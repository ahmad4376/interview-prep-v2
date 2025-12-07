import OpenAI from 'openai';
import { Socket } from 'socket.io';
import { logger } from '../utils/logger.js';
import Interview from '../models/Interview.js';

interface ConversationMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface ProcessedContext {
  keyRequirements: string[];
  technicalSkills: string[];
  softSkills: string[];
}

interface InterviewFeedback {
  overall_score: number;
  strengths: string[];
  weaknesses: string[];
  improvements: string[];
  confidence_assessment: {
    score: number;
    explanation: string;
  };
  communication_style: {
    type: 'clear' | 'verbose' | 'technical' | 'conversational';
    explanation: string;
  };
  approach_analysis: {
    type: 'structured' | 'scattered' | 'thorough' | 'surface-level';
    explanation: string;
  };
}

export interface InterviewContext {
  jobTitle: string;
  jobDescription: string;
  company: string;
  interviewId: string;

  // Extracted during background processing
  keyRequirements: string[];
  technicalSkills: string[];
  softSkills: string[];

  // State tracking
  stage: 'greeting' | 'small_talk' | 'ready_check' | 'interview' | 'closing';
  questionsAsked: number;
  maxQuestions: number;
  conversationHistory: ConversationMessage[];

  // Track Q&A for saving
  interviewQuestions: Array<{
    question: string;
    answer: string;
    asked_at: Date;
  }>;

  // Track current question being asked
  currentQuestion: string | null;
}

export class InterviewConversationService {
  private openai: OpenAI;

  constructor() {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY is not defined');
    }
    this.openai = new OpenAI({ apiKey });
    logger.info('[InterviewService] Initialized with OpenAI client');
  }

  /**
   * Process job description in background to extract key information
   */
  async processJobDescription(description: string): Promise<ProcessedContext> {
    logger.info('[InterviewService] Processing job description');

    const prompt = `Analyze this job description and extract:
1. Top 5 key requirements
2. Technical skills required
3. Soft skills/qualities desired

Job Description:
${description}

Return as JSON: { "keyRequirements": ["..."], "technicalSkills": ["..."], "softSkills": ["..."] }`;

    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        temperature: 0.3,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: 'You are a job description analyzer. Always return valid JSON.' },
          { role: 'user', content: prompt }
        ]
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error('Empty response from OpenAI');
      }

      const parsed = JSON.parse(content) as ProcessedContext;
      logger.info('[InterviewService] Job description processed successfully');
      return parsed;

    } catch (error) {
      logger.error('[InterviewService] Error processing job description:', error);
      // Return defaults if processing fails
      return {
        keyRequirements: ['General technical knowledge'],
        technicalSkills: ['Problem solving'],
        softSkills: ['Communication']
      };
    }
  }

  /**
   * Generate initial greeting with small talk
   */
  async startInterview(socket: Socket, context: InterviewContext): Promise<void> {
    logger.info(`[InterviewService] Starting interview for ${context.jobTitle}`);

    const systemPrompt = this.buildSystemPrompt(context);

    try {
      const stream = await this.openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        max_tokens: 150,
        temperature: 0.7,
        stream: true,
        messages: [
          { role: 'system', content: systemPrompt },
          {
            role: 'user',
            content: 'Start the conversation with a warm greeting mentioning the job title, then ask a casual small talk question like "how\'s your day going?"'
          }
        ]
      });

      let fullText = '';
      for await (const chunk of stream) {
        if (!socket.connected) {
          logger.warn('[InterviewService] Socket disconnected during greeting');
          break;
        }

        const delta = chunk.choices[0]?.delta?.content || '';
        if (!delta) continue;

        fullText += delta;
        socket.emit('text_chunk', { chunk: delta });
      }

      socket.emit('text_complete', { fullText: fullText.trim() });

      // Add to conversation history
      context.conversationHistory.push({
        role: 'assistant',
        content: fullText.trim()
      });

      // Move to small_talk stage
      context.stage = 'small_talk';

      logger.info('[InterviewService] Greeting sent successfully');

    } catch (error) {
      logger.error('[InterviewService] Error generating greeting:', error);
      const fallback = `Hi! Thanks for joining us today for the ${context.jobTitle} interview. How's your day going so far?`;
      socket.emit('text_complete', { fullText: fallback });
      context.conversationHistory.push({
        role: 'assistant',
        content: fallback
      });
      context.stage = 'small_talk';
    }
  }

  /**
   * Handle user response based on current stage
   */
  async handleUserResponse(socket: Socket, userMessage: string, context: InterviewContext): Promise<void> {
    logger.info(`[InterviewService] Handling user response at stage: ${context.stage}`);

    // Add user message to history
    context.conversationHistory.push({
      role: 'user',
      content: userMessage
    });

    // Save answer if we're in interview stage
    if (context.stage === 'interview' && context.currentQuestion) {
      context.interviewQuestions.push({
        question: context.currentQuestion,
        answer: userMessage,
        asked_at: new Date()
      });
      context.currentQuestion = null;
    }

    // Generate appropriate response
    await this.generateResponse(socket, context, userMessage);
  }

  /**
   * Generate response based on current stage
   */
  private async generateResponse(socket: Socket, context: InterviewContext, userMessage: string): Promise<void> {
    const systemPrompt = this.buildSystemPrompt(context);

    // Build user instruction based on stage
    let userInstruction = '';

    if (context.stage === 'small_talk') {
      userInstruction = 'Briefly acknowledge their response (1 sentence), then ask if they are ready to start the interview.';
      context.stage = 'ready_check';
    } else if (context.stage === 'ready_check') {
      if (this.isReadyConfirmation(userMessage)) {
        userInstruction = 'They confirmed they are ready. Say "Perfect!" or similar, then ask your first interview question based on the job requirements and technical skills.';
        context.stage = 'interview';
        context.questionsAsked = 1;
      } else {
        userInstruction = 'They seem not ready. Ask if they need anything or if they want to proceed anyway.';
      }
    } else if (context.stage === 'interview') {
      if (context.questionsAsked < context.maxQuestions) {
        userInstruction = `Briefly acknowledge their answer with a natural comment (1 sentence). Then ask your next interview question (question ${context.questionsAsked + 1} of ${context.maxQuestions}). Base the question on their previous answer - dive deeper if they were shallow, move to a different skill area if they were comprehensive.`;
        context.questionsAsked++;
      } else {
        userInstruction = 'Briefly acknowledge their final answer. Thank them for their time, mention that the team will review their responses and get back to them. Wish them a great day. Keep it professional but warm.';
        context.stage = 'closing';
      }
    } else if (context.stage === 'closing') {
      // Check if user said goodbye
      if (this.isGoodbyeConfirmation(userMessage)) {
        // User said goodbye - interview is done
        await this.completeInterview(socket, context);
        return;
      } else {
        // User said something else - acknowledge and close anyway
        userInstruction = 'Briefly acknowledge their comment and say goodbye again.';
      }
    }

    try {
      // Limit history to last 10 messages
      const limitedHistory = context.conversationHistory.slice(-10);

      const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
        { role: 'system', content: systemPrompt },
        ...limitedHistory,
        { role: 'user', content: userInstruction }
      ];

      const stream = await this.openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        max_tokens: 200,
        temperature: 0.7,
        stream: true,
        messages
      });

      let fullText = '';
      for await (const chunk of stream) {
        if (!socket.connected) {
          logger.warn('[InterviewService] Socket disconnected during response');
          break;
        }

        const delta = chunk.choices[0]?.delta?.content || '';
        if (!delta) continue;

        fullText += delta;
        socket.emit('text_chunk', { chunk: delta });
      }

      socket.emit('text_complete', { fullText: fullText.trim() });

      // Add to conversation history
      context.conversationHistory.push({
        role: 'assistant',
        content: fullText.trim()
      });

      // Track current question if we just asked one
      if (context.stage === 'interview') {
        context.currentQuestion = fullText.trim();
      }

      logger.info(`[InterviewService] Response sent successfully, new stage: ${context.stage}`);

    } catch (error) {
      logger.error('[InterviewService] Error generating response:', error);
      const fallback = "I'm sorry, could you repeat that?";
      socket.emit('text_complete', { fullText: fallback });
      context.conversationHistory.push({
        role: 'assistant',
        content: fallback
      });
    }
  }

  /**
   * Build system prompt with interview context
   */
  private buildSystemPrompt(context: InterviewContext): string {
    const keyReqs = context.keyRequirements.join(', ');
    const techSkills = context.technicalSkills.join(', ');
    const softSkills = context.softSkills.join(', ');

    return `You are an expert technical interviewer conducting an interview for the position of ${context.jobTitle} at ${context.company}.

JOB DESCRIPTION:
${context.jobDescription}

KEY REQUIREMENTS TO ASSESS:
${keyReqs}

TECHNICAL SKILLS: ${techSkills}
SOFT SKILLS: ${softSkills}

INTERVIEW RULES:
1. Be conversational and natural, not robotic
2. Start with warm greeting and small talk ("How's your day?")
3. Ask if candidate is ready before starting interview questions
4. Ask exactly ${context.maxQuestions} interview questions total
5. Adapt follow-up questions based on candidate's answers
6. Acknowledge answers before asking next question
7. Keep responses concise (2-3 sentences maximum)
8. Questions should assess the technical and soft skills listed above
9. Make questions specific to the job description requirements
10. Be encouraging and professional throughout

CURRENT STAGE: ${context.stage}
QUESTIONS ASKED: ${context.questionsAsked} / ${context.maxQuestions}

Respond naturally based on the current stage and instructions provided.`;
  }

  /**
   * Check if user confirmed they're ready
   */
  private isReadyConfirmation(message: string): boolean {
    const normalized = message.toLowerCase().trim();
    const confirmations = ['yes', 'yeah', 'yep', 'sure', 'ready', "let's go", "let's do it", 'okay', 'ok', 'definitely', 'absolutely'];
    return confirmations.some(word => normalized.includes(word));
  }

  /**
   * Check if user said goodbye
   */
  private isGoodbyeConfirmation(message: string): boolean {
    const normalized = message.toLowerCase().trim();
    const goodbyes = ['bye', 'goodbye', 'see you', 'thanks', 'thank you', 'later', 'great', 'okay'];
    return goodbyes.some(word => normalized.includes(word));
  }

  /**
   * Complete interview - generate feedback and save
   */
  private async completeInterview(socket: Socket, context: InterviewContext): Promise<void> {
    try {
      logger.info('[InterviewService] Completing interview and generating feedback');

      // 1. Generate feedback
      const feedback = await this.generateFeedback(context);

      // 2. Save interview with feedback
      await Interview.findByIdAndUpdate(context.interviewId, {
        status: 'completed',
        questionHistory: context.interviewQuestions.map(qa => ({
          question_text: qa.question,
          transcript: qa.answer,
          asked_at: qa.asked_at,
          was_modified: false,
          modification_reason: 'LLM generated',
          duration: 0
        })),
        feedback: {
          overall_score: feedback.overall_score,
          strengths: feedback.strengths,
          weaknesses: feedback.weaknesses,
          improvements: feedback.improvements,
          confidence_assessment: feedback.confidence_assessment,
          communication_style: feedback.communication_style,
          approach_analysis: feedback.approach_analysis,
          generated_at: new Date()
        },
        metrics: {
          questions_asked: context.questionsAsked,
          total_duration: 0,
          overall_performance_score: feedback.overall_score
        }
      });

      logger.info(`[InterviewService] Interview completed and saved with feedback`);

      // 3. Emit completion event to frontend
      socket.emit('interview_completed', {
        message: 'Interview completed successfully',
        score: feedback.overall_score
      });

    } catch (error) {
      logger.error('[InterviewService] Error completing interview:', error);
      socket.emit('error', { message: 'Failed to complete interview' });
    }
  }

  /**
   * Generate comprehensive feedback using OpenAI
   */
  private async generateFeedback(context: InterviewContext): Promise<InterviewFeedback> {
    logger.info('[InterviewService] Generating comprehensive feedback');

    // Build Q&A context for analysis
    const qaContext = context.interviewQuestions.map((qa, idx) =>
      `Question ${idx + 1}: ${qa.question}\nAnswer: ${qa.answer}`
    ).join('\n\n');

    const prompt = `You are an expert interview coach. Analyze this technical interview performance and provide detailed feedback.

JOB POSITION: ${context.jobTitle} at ${context.company}
JOB REQUIREMENTS: ${context.keyRequirements.join(', ')}
TECHNICAL SKILLS ASSESSED: ${context.technicalSkills.join(', ')}
SOFT SKILLS ASSESSED: ${context.softSkills.join(', ')}

INTERVIEW Q&A:
${qaContext}

Provide comprehensive feedback analyzing:
1. STRENGTHS: What the candidate did well (2-4 specific points)
2. WEAKNESSES: Where the candidate struggled or went wrong (2-4 specific points)
3. IMPROVEMENTS: Actionable advice for improvement (3-5 specific suggestions)
4. CONFIDENCE_ASSESSMENT: Analyze their confidence level (scale 1-10 with explanation)
5. COMMUNICATION_STYLE: How they communicate (clear/verbose/technical/conversational)
6. APPROACH_ANALYSIS: Their problem-solving approach (structured/scattered/thorough/surface-level)
7. OVERALL_SCORE: Overall performance score (0-100)

Return as JSON:
{
  "overall_score": number,
  "strengths": ["strength 1", "strength 2", ...],
  "weaknesses": ["weakness 1", "weakness 2", ...],
  "improvements": ["improvement 1", "improvement 2", ...],
  "confidence_assessment": {
    "score": number (1-10),
    "explanation": "detailed explanation"
  },
  "communication_style": {
    "type": "clear" | "verbose" | "technical" | "conversational",
    "explanation": "detailed explanation"
  },
  "approach_analysis": {
    "type": "structured" | "scattered" | "thorough" | "surface-level",
    "explanation": "detailed explanation"
  }
}`;

    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        temperature: 0.3,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: 'You are an expert interview coach providing constructive feedback. Be honest but encouraging. Always return valid JSON.'
          },
          {
            role: 'user',
            content: prompt
          }
        ]
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error('Empty feedback response from OpenAI');
      }

      const feedback = JSON.parse(content) as InterviewFeedback;
      logger.info('[InterviewService] Feedback generated successfully');
      return feedback;

    } catch (error) {
      logger.error('[InterviewService] Error generating feedback:', error);
      // Return default feedback if generation fails
      return {
        overall_score: 50,
        strengths: ['Participated in the interview'],
        weaknesses: ['Feedback generation failed'],
        improvements: ['Try again'],
        confidence_assessment: { score: 5, explanation: 'Unable to assess' },
        communication_style: { type: 'conversational', explanation: 'Unable to assess' },
        approach_analysis: { type: 'scattered', explanation: 'Unable to assess' }
      };
    }
  }

  /**
   * Save interview results to database
   */
  private async saveInterviewResults(context: InterviewContext): Promise<void> {
    try {
      const questionHistory = context.interviewQuestions.map(qa => ({
        question_text: qa.question,
        transcript: qa.answer,
        asked_at: qa.asked_at,
        was_modified: false,
        modification_reason: 'LLM generated',
        duration: 0
      }));

      await Interview.findByIdAndUpdate(context.interviewId, {
        status: 'completed',
        questionHistory,
        metrics: {
          questions_asked: context.questionsAsked,
          total_duration: 0,
          overall_performance_score: 0
        }
      });

      logger.info(`[InterviewService] Interview results saved for ${context.interviewId}`);
    } catch (error) {
      logger.error('[InterviewService] Error saving interview results:', error);
    }
  }
}
