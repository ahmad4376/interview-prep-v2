import OpenAI from 'openai';
import { Socket } from 'socket.io';
import { IQuestion } from '../models/Question.js';
import { logger } from '../utils/logger.js';

interface StreamingEvaluationResult {
  completeness_score: number;
  confidence_score: number;
  key_points_covered: string[];
  key_points_missed: string[];
  is_complete: boolean;
  needs_follow_up: boolean;
  follow_up_question?: string;
  feedback: string;
  next_action: 'move_next' | 'ask_follow_up' | 'clarify';
  full_response: string;
}

/**
 * Streaming evaluator for ultra-low latency conversation
 */
export class StreamingEvaluator {
  private openai: OpenAI;

  constructor() {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY is not defined');
    }
    this.openai = new OpenAI({ apiKey });
  }

  /**
   * Evaluate answer with streaming response
   * Immediately sends filling phrase, then evaluates answer
   * Returns natural conversational feedback
   */
  async evaluateAnswerStreaming(
    question: IQuestion,
    transcript: string,
    previousContext: any[],
    socket: Socket
  ): Promise<StreamingEvaluationResult> {
    const startTime = Date.now();
    logger.info(`⚡ [T+0ms] Starting streaming evaluation`);

    // Step 1: Send filling phrase IMMEDIATELY
    const fillingPhrase = this.selectFillingPhrase(transcript);
    socket.emit('filling_phrase', { text: fillingPhrase });
    logger.info(`⚡ [T+${Date.now() - startTime}ms] Filling phrase sent: "${fillingPhrase}"`);

    // Step 2: Quick LLM evaluation to determine if follow-up is needed
    const prompt = this.buildEvaluationPrompt(question, transcript, previousContext);

    try {
      const llmStartTime = Date.now();
      logger.info(`⚡ [T+${llmStartTime - startTime}ms] Starting LLM evaluation`);

      // Get evaluation from LLM (non-streaming for quick decision)
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        max_tokens: 300,
        temperature: 0.7,
        messages: [
          {
            role: 'system',
            content: 'You are a technical interviewer evaluating answers. Respond with JSON only.'
          },
          {
            role: 'user',
            content: prompt
          }
        ]
      });

      const fullResponse = response.choices[0]?.message?.content || '';
      logger.info(`⚡ [T+${Date.now() - startTime}ms] LLM evaluation complete`);

      // Step 3: Parse response to extract structured evaluation
      const evaluation = await this.parseEvaluationResponse(fullResponse, question, transcript);

      // Step 4: If follow-up is needed, log it
      if (evaluation.needs_follow_up && evaluation.follow_up_question) {
        logger.info(`⚡ [T+${Date.now() - startTime}ms] Follow-up question generated`);
      }

      logger.info(`⚡ [T+${Date.now() - startTime}ms] COMPLETE - Total latency: ${Date.now() - startTime}ms`);

      return {
        ...evaluation,
        full_response: fullResponse
      };

    } catch (error) {
      logger.error('Error in streaming evaluation:', error);

      // Fallback: send a generic follow-up
      socket.emit('question', {
        question_id: `${question.question_id}_followup`,
        text: 'Could you elaborate a bit more on that?',
        is_follow_up: true
      });

      return {
        completeness_score: 50,
        confidence_score: 50,
        key_points_covered: [],
        key_points_missed: [],
        is_complete: false,
        needs_follow_up: true,
        follow_up_question: 'Could you elaborate a bit more on that?',
        feedback: 'Streaming evaluation error - using fallback',
        next_action: 'ask_follow_up',
        full_response: ''
      };
    }
  }

  /**
   * Select intelligent filling phrase based on transcript content
   */
  private selectFillingPhrase(transcript: string): string {
    const lower = transcript.toLowerCase();
    const length = transcript.split(' ').length;

    // Short answers (< 5 words) - encouraging
    if (length < 5) {
      return ['Mm-hmm, go on', 'I see, tell me more', 'Okay, continue'][Math.floor(Math.random() * 3)];
    }

    // Check for uncertainty
    if (lower.includes('i think') || lower.includes('maybe') || lower.includes('probably')) {
      return ['Interesting', 'Mm-hmm', 'I hear you'][Math.floor(Math.random() * 3)];
    }

    // Check for confidence
    if (lower.includes('definitely') || lower.includes('certainly') || lower.includes('exactly')) {
      return ['Got it', 'Okay', 'I see'][Math.floor(Math.random() * 3)];
    }

    // Default conversational fillers
    const fillers = [
      'Mm-hmm',
      'I see',
      'Okay',
      'Got it',
      'Alright',
      'Right'
    ];

    return fillers[Math.floor(Math.random() * fillers.length)];
  }

  /**
   * Build prompt for evaluation (determines if follow-up needed)
   */
  private buildEvaluationPrompt(
    question: IQuestion,
    transcript: string,
    previousContext: any[]
  ): string {
    return `Evaluate this technical interview answer. Respond with JSON only.

QUESTION:
${question.question_text}

CANDIDATE'S ANSWER:
${transcript}

EXPECTED KEY POINTS:
${question.expected_key_points?.join(', ') || 'General understanding'}

Respond with JSON in this exact format:
{
  "completeness_score": <0-100>,
  "confidence_score": <0-100>,
  "is_complete": <boolean>,
  "needs_follow_up": <boolean>,
  "follow_up_question": "<only if needs_follow_up is true, a short clarifying question>",
  "feedback": "<brief evaluation>"
}

STRICT Guidelines for needs_follow_up:
- Set needs_follow_up=false if answer demonstrates ANY understanding (even if incomplete)
- Set needs_follow_up=true ONLY if:
  1. Answer is completely wrong, OR
  2. Answer is "I don't know" with NO attempt, OR
  3. Answer contradicts basic facts
- PREFER moving to next question over asking follow-ups
- If completeness_score >= 40, set needs_follow_up=false
- Maximum 1 follow-up per question, then move on`;
  }

  /**
   * Parse the JSON evaluation response from LLM
   */
  private async parseEvaluationResponse(
    response: string,
    question: IQuestion,
    transcript: string
  ): Promise<Omit<StreamingEvaluationResult, 'full_response'>> {
    try {
      // Extract JSON from response (in case LLM adds extra text)
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }

      const parsed = JSON.parse(jsonMatch[0]);

      return {
        completeness_score: parsed.completeness_score || 50,
        confidence_score: parsed.confidence_score || 50,
        key_points_covered: [],
        key_points_missed: [],
        is_complete: parsed.is_complete !== false,
        needs_follow_up: parsed.needs_follow_up === true,
        follow_up_question: parsed.follow_up_question,
        feedback: parsed.feedback || '',
        next_action: parsed.needs_follow_up ? 'ask_follow_up' : 'move_next'
      };
    } catch (error) {
      logger.error('Failed to parse LLM evaluation JSON:', error);
      // Fallback to simple evaluation
      return {
        completeness_score: 60,
        confidence_score: 60,
        key_points_covered: [],
        key_points_missed: [],
        is_complete: true,
        needs_follow_up: false,
        feedback: 'Evaluation completed',
        next_action: 'move_next'
      };
    }
  }
}
