import OpenAI from 'openai';
import Question, { IQuestion } from '../models/Question.js';
import { logger } from '../utils/logger.js';

let openai: OpenAI | null = null;

function getOpenAI(): OpenAI {
  if (!openai) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY environment variable is not defined');
    }
    openai = new OpenAI({ apiKey });
  }
  return openai;
}

interface QuestionContext {
  remainingQuestions: IQuestion[];
  previousQAs: any[];
  userPerformance: {
    averageScore: number;
    strengths: string[];
    weaknesses: string[];
  };
  interviewFocus: string[];
}

interface QuestionDecision {
  question_id: number;
  should_modify: boolean;
  modified_text?: string;
  reasoning: string;
  expected_difficulty?: string;
}

interface AnswerEvaluation {
  completeness_score: number;
  confidence_score: number;
  key_points_covered: string[];
  key_points_missed: string[];
  is_complete: boolean;
  needs_follow_up: boolean;
  follow_up_question?: string;
  feedback: string;
  next_action: 'move_next' | 'ask_follow_up' | 'clarify';
}

export class HybridQuestionSelector {
  /**
   * Phase 1: Initial question selection from databank
   * Uses keyword matching and relevance scoring
   */
  async selectInitialQuestions(
    jobTitle: string,
    jobDescription: string,
    count: number = 10
  ): Promise<IQuestion[]> {
    logger.info('Selecting initial questions from databank');

    const text = `${jobTitle} ${jobDescription}`.toLowerCase();

    // Curated technical terms
    const TECH_TERMS = [
      'react', 'angular', 'vue', 'javascript', 'typescript', 'html', 'css',
      'node', 'express', 'python', 'java', 'go', 'rust', 'cpp',
      'mongodb', 'postgresql', 'mysql', 'redis', 'docker', 'kubernetes',
      'aws', 'azure', 'gcp', 'git', 'rest', 'graphql', 'api',
    ];

    // Stopwords
    const STOPWORDS = new Set([
      'the', 'and', 'for', 'with', 'that', 'this', 'from', 'have', 'will',
      'are', 'you', 'your', 'our', 'we', 'a', 'an', 'to', 'of', 'in', 'on',
      'as', 'is', 'be', 'by', 'or', 'it', 'at',
    ]);

    // Extract keywords
    const tokens = text
      .replace(/[^a-z0-9.\s-]/g, ' ')
      .split(/\s+/)
      .filter(Boolean);

    const detectedTech = new Set<string>();
    for (const term of TECH_TERMS) {
      const regex = new RegExp(`\\b${term}\\b`, 'i');
      if (regex.test(text)) {
        detectedTech.add(term);
      }
    }

    // Build frequency map
    const freq = new Map<string, number>();
    for (const token of tokens) {
      const t = token.toLowerCase();
      if (STOPWORDS.has(t) || t.length <= 2) continue;
      freq.set(t, (freq.get(t) || 0) + 1);
    }

    const freqSorted = Array.from(freq.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([tok]) => tok);

    const keywords = Array.from(new Set([
      ...Array.from(detectedTech),
      ...freqSorted.slice(0, 8),
    ]));

    logger.info(`Extracted keywords: ${keywords.join(', ')}`);

    // Build query
    const orClauses: any[] = [];
    if (keywords.length > 0) {
      orClauses.push({ question_tags: { $in: keywords } });
      for (const k of keywords) {
        orClauses.push({
          question_title: { $regex: `\\b${k}\\b`, $options: 'i' },
        });
        orClauses.push({
          question_text: { $regex: `\\b${k}\\b`, $options: 'i' },
        });
      }
    }

    // Fetch candidates
    const candidates = orClauses.length > 0
      ? await Question.find({ $or: orClauses }).limit(200).lean()
      : await Question.find({}).sort({ 'rank_key.0': -1 }).limit(count).lean();

    logger.info(`Fetched ${candidates.length} candidate questions`);

    // If no candidates found, fall back to all questions
    if (candidates.length === 0) {
      logger.info('No matches found, falling back to all questions');
      const allQuestions = await Question.find({}).limit(count).lean();
      logger.info(`Fallback fetched ${allQuestions.length} questions`);
      return allQuestions as IQuestion[];
    }

    // Score candidates
    const kwSet = new Set(keywords);
    const scored = candidates.map((doc) => {
      let score = 0;
      if (Array.isArray(doc.question_tags)) {
        for (const t of doc.question_tags) {
          if (kwSet.has(String(t).toLowerCase())) score += 5;
        }
      }
      const title = String(doc.question_title || '').toLowerCase();
      const textField = String(doc.question_text || '').toLowerCase();
      for (const k of keywords) {
        if (title.includes(k)) score += 3;
        if (textField.includes(k)) score += 1;
      }
      const rankKey = doc.rank_key?.[0] || 0;
      return { doc, score, rankKey };
    });

    scored.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return (b.rankKey || 0) - (a.rankKey || 0);
    });

    const results = scored.slice(0, count).map((s) => s.doc as IQuestion);
    logger.info(`Selected ${results.length} questions from databank`);

    return results;
  }

  /**
   * Phase 2: LLM-powered dynamic question selection
   * During interview, decides which question to ask next
   */
  async selectNextQuestion(
    context: QuestionContext
  ): Promise<QuestionDecision> {
    logger.info('LLM selecting next question');

    const prompt = this.buildSelectionPrompt(context);

    try {
      const response = await getOpenAI().chat.completions.create({
        model: 'gpt-4-turbo-preview',
        max_tokens: 1024,
        temperature: 0.7,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: 'You are an intelligent interview question selector. Always respond with valid JSON.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
      });

      const content = response.choices[0].message.content;
      if (!content) {
        throw new Error('No response from OpenAI');
      }

      const decision = JSON.parse(content) as QuestionDecision;
      logger.info(`LLM selected question_id: ${decision.question_id}`);

      return decision;
    } catch (error) {
      logger.error('Error in selectNextQuestion:', error);
      // Fallback: return first remaining question
      return {
        question_id: context.remainingQuestions[0].question_id,
        should_modify: false,
        reasoning: 'Fallback: LLM error',
      };
    }
  }

  /**
   * Phase 3: Question modification if needed
   */
  async modifyQuestion(
    question: IQuestion,
    context: QuestionContext
  ): Promise<{ should_modify: boolean; modified_text: string; reasoning: string }> {
    logger.info(`Checking if question ${question.question_id} should be modified`);

    const prompt = `
You are an expert interviewer. You have a question from our curated databank:

ORIGINAL QUESTION:
Title: ${question.question_title}
Text: ${question.question_text}
Tags: ${question.question_tags.join(', ')}
Difficulty: ${question.difficulty}

INTERVIEW CONTEXT:
${JSON.stringify(context, null, 2)}

TASK:
Decide if this question should be:
1. Asked AS-IS (no modification needed)
2. Simplified (candidate seems to be struggling)
3. Enhanced (candidate is doing very well, add complexity)
4. Contextualized (add context from their previous answers)

RULES:
- ALWAYS keep the core intent of the question
- If simplifying, break it into smaller parts
- If enhancing, add edge cases or follow-up
- If contextualizing, reference their previous answers
- Return JSON only

Return format:
{
  "should_modify": true/false,
  "modification_type": "as-is" | "simplified" | "enhanced" | "contextualized",
  "modified_text": "the question text to ask",
  "reasoning": "why this modification"
}
`;

    try {
      const response = await getOpenAI().chat.completions.create({
        model: 'gpt-4-turbo-preview',
        max_tokens: 1024,
        temperature: 0.7,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: 'You are an expert interviewer who adapts questions based on candidate performance. Always respond with valid JSON.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
      });

      const content = response.choices[0].message.content;
      if (!content) {
        throw new Error('No response from OpenAI');
      }

      const result = JSON.parse(content);
      logger.info(`Question modification result: ${result.modification_type}`);

      return result;
    } catch (error) {
      logger.error('Error in modifyQuestion:', error);
      return {
        should_modify: false,
        modified_text: question.question_text,
        reasoning: 'Fallback: no modification',
      };
    }
  }

  /**
   * Evaluate user's answer
   */
  async evaluateAnswer(
    question: IQuestion,
    transcript: string,
    previousContext: any[]
  ): Promise<AnswerEvaluation> {
    logger.info(`Evaluating answer for question ${question.question_id}`);

    const prompt = `
You are evaluating a candidate's answer in a technical interview.

QUESTION ASKED:
${question.question_text}

EXPECTED KEY POINTS (from databank):
${question.expected_key_points?.join('\n') || 'Not specified'}

CANDIDATE'S ANSWER:
${transcript}

PREVIOUS CONTEXT:
${JSON.stringify(previousContext.slice(-3), null, 2)}

TASK:
Evaluate the answer and decide next action.

Return JSON:
{
  "completeness_score": 0-100,
  "confidence_score": 0-100,
  "key_points_covered": ["point1", "point2"],
  "key_points_missed": ["point3"],
  "is_complete": true/false,
  "needs_follow_up": true/false,
  "follow_up_question": "if needed, ask clarifying question",
  "feedback": "brief feedback (NOT shown to user during interview)",
  "next_action": "move_next" | "ask_follow_up" | "clarify"
}
`;

    try {
      const response = await getOpenAI().chat.completions.create({
        model: 'gpt-4-turbo-preview',
        max_tokens: 1024,
        temperature: 0.7,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: 'You are an expert technical interviewer evaluating candidate answers. Always respond with valid JSON.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
      });

      const content = response.choices[0].message.content;
      if (!content) {
        throw new Error('No response from OpenAI');
      }

      const evaluation = JSON.parse(content) as AnswerEvaluation;
      logger.info(`Answer evaluation complete: ${evaluation.completeness_score}/100`);

      return evaluation;
    } catch (error) {
      logger.error('Error in evaluateAnswer:', error);
      // Fallback evaluation
      return {
        completeness_score: 50,
        confidence_score: 50,
        key_points_covered: [],
        key_points_missed: [],
        is_complete: true,
        needs_follow_up: false,
        feedback: 'Fallback evaluation',
        next_action: 'move_next',
      };
    }
  }

  private buildSelectionPrompt(context: QuestionContext): string {
    return `
You are an intelligent interview engine. Select the next question from the databank.

REMAINING QUESTIONS (from curated databank):
${JSON.stringify(
      context.remainingQuestions.map((q) => ({
        id: q.question_id,
        title: q.question_title,
        difficulty: q.difficulty,
        category: q.category,
        tags: q.question_tags,
      })),
      null,
      2
    )}

PREVIOUS Q&As:
${JSON.stringify(context.previousQAs.slice(-3), null, 2)}

USER PERFORMANCE:
${JSON.stringify(context.userPerformance, null, 2)}

INTERVIEW FOCUS AREAS:
${context.interviewFocus.join(', ')}

TASK:
Choose the BEST next question from the databank based on:
1. Relevance to interview focus
2. Appropriate difficulty given performance
3. Logical flow from previous questions
4. Coverage of different topics

Return JSON only:
{
  "question_id": 12345,
  "reasoning": "why this question is best next",
  "expected_difficulty": "easy|medium|hard"
}
`;
  }
}
