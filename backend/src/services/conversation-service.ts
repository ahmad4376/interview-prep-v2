import OpenAI from 'openai';
import { Socket } from 'socket.io';
import { logger } from '../utils/logger.js';

interface ConversationMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export class ConversationService {
  private openai: OpenAI;
  private systemPrompt = 'You are a helpful assistant. Answer questions in short, clear sentences. Keep responses concise and conversational, typically 2-3 sentences maximum.';

  constructor() {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY is not defined');
    }
    this.openai = new OpenAI({ apiKey });
    logger.info('[ConversationService] Initialized with OpenAI client');
  }

  /**
   * Generate initial greeting when conversation starts
   */
  async generateGreeting(socket: Socket): Promise<void> {
    const startTime = Date.now();
    logger.info(`[Conversation] Generating initial greeting for ${socket.id}`);

    try {
      const stream = await this.openai.chat.completions.create({
        model: 'gpt-3.5-turbo', // Faster first token (600-800ms vs 1500-2000ms)
        max_tokens: 100,
        temperature: 0.7,
        stream: true,
        messages: [
          {
            role: 'system',
            content: this.systemPrompt,
          },
          {
            role: 'user',
            content: 'Say a brief, friendly greeting to start our conversation. Keep it to one sentence.',
          },
        ],
      });

      let fullText = '';
      for await (const chunk of stream) {
        if (!socket.connected) {
          logger.warn('[Conversation] Socket disconnected during greeting stream');
          break;
        }

        const delta = chunk.choices[0]?.delta?.content || '';
        if (!delta) continue;

        fullText += delta;
        socket.emit('text_chunk', { chunk: delta });
      }

      socket.emit('text_complete', { fullText: fullText.trim() });

      // Add to conversation history
      if (!socket.data.conversationHistory) {
        socket.data.conversationHistory = [];
      }
      socket.data.conversationHistory.push({
        role: 'assistant',
        content: fullText.trim(),
      });

      logger.info(`[Conversation] Greeting complete in ${Date.now() - startTime}ms`);

    } catch (error) {
      logger.error('[Conversation] Error generating greeting:', error);
      const fallback = "Hello! How can I help you today?";
      socket.emit('text_complete', { fullText: fallback });

      if (!socket.data.conversationHistory) {
        socket.data.conversationHistory = [];
      }
      socket.data.conversationHistory.push({
        role: 'assistant',
        content: fallback,
      });
    }
  }

  /**
   * Respond to user message with conversation context
   */
  async respondToUser(
    socket: Socket,
    userMessage: string,
    conversationHistory: ConversationMessage[]
  ): Promise<void> {
    const startTime = Date.now();
    logger.info(`[Conversation] Responding to user: "${userMessage.substring(0, 100)}..."`);

    // Validate user message
    if (!userMessage || userMessage.trim().length === 0) {
      logger.warn('[Conversation] Empty user message, skipping');
      return;
    }

    // Limit conversation history to last 10 messages
    const limitedHistory = conversationHistory.slice(-10);

    // Build messages array
    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: 'system', content: this.systemPrompt },
      ...limitedHistory,
    ];

    try {
      const stream = await this.openai.chat.completions.create({
        model: 'gpt-3.5-turbo', // Faster first token (600-800ms vs 1500-2000ms)
        max_tokens: 200,
        temperature: 0.7,
        stream: true,
        messages,
      });

      let fullText = '';
      let firstChunkTime: number | null = null;

      for await (const chunk of stream) {
        if (!socket.connected) {
          logger.warn('[Conversation] Socket disconnected during response stream');
          break;
        }

        const delta = chunk.choices[0]?.delta?.content || '';
        if (!delta) continue;

        if (!firstChunkTime) {
          firstChunkTime = Date.now();
          logger.info(`[Conversation] First token in ${firstChunkTime - startTime}ms`);
        }

        fullText += delta;
        socket.emit('text_chunk', { chunk: delta });

        // Log token usage if available
        if (chunk.usage) {
          logger.info(`[Conversation] Tokens used: ${chunk.usage.total_tokens}`);
        }
      }

      // Handle empty response
      if (!fullText || fullText.trim().length === 0) {
        logger.warn('[Conversation] Empty response from OpenAI');
        fullText = "I'm sorry, could you repeat that?";
      }

      socket.emit('text_complete', { fullText: fullText.trim() });

      // Add assistant response to history
      socket.data.conversationHistory.push({
        role: 'assistant',
        content: fullText.trim(),
      });

      logger.info(`[Conversation] Response complete in ${Date.now() - startTime}ms`);

    } catch (error) {
      logger.error('[Conversation] Error generating response:', error);
      const fallback = "I'm sorry, could you repeat that?";
      socket.emit('text_complete', { fullText: fallback });

      socket.data.conversationHistory.push({
        role: 'assistant',
        content: fallback,
      });
    }
  }
}
