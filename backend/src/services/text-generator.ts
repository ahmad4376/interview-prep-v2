import OpenAI from 'openai';
import { Socket } from 'socket.io';
import { logger } from '../utils/logger.js';

/**
 * Text Generator Service
 * Generates random 2-line text using OpenAI streaming
 */
export class TextGeneratorService {
  private openai: OpenAI;
  private topics: string[] = [
    'technology and innovation',
    'nature and wildlife',
    'space exploration',
    'art and creativity',
    'history and culture',
    'science and discovery',
    'music and entertainment',
    'food and cuisine',
    'travel and adventure',
    'philosophy and thought',
  ];

  constructor() {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY is not defined');
    }
    this.openai = new OpenAI({ apiKey });
  }

  /**
   * Generate 2 lines of text on a random topic and stream to client
   */
  async generateAndStreamText(socket: Socket): Promise<void> {
    const startTime = Date.now();
    const randomTopic = this.topics[Math.floor(Math.random() * this.topics.length)];

    logger.info(`[TextGen] Generating text about: ${randomTopic}`);

    try {
      const stream = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        max_tokens: 60,
        temperature: 0.9,
        stream: true,
        messages: [
          {
            role: 'system',
            content: 'You are a creative writer. Generate exactly 2 short, interesting sentences about the given topic. Be concise.',
          },
          {
            role: 'user',
            content: `Write 2 short sentences about ${randomTopic}.`,
          },
        ],
      });

      let fullText = '';
      let firstChunkTime: number | null = null;

      // Stream tokens to client
      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta?.content || '';
        if (!delta) continue;

        if (!firstChunkTime) {
          firstChunkTime = Date.now();
          logger.info(`[TextGen] First token received in ${firstChunkTime - startTime}ms`);
        }

        fullText += delta;

        // Emit chunk to frontend
        socket.emit('text_chunk', { chunk: delta });
      }

      const endTime = Date.now();
      logger.info(`[TextGen] Complete in ${endTime - startTime}ms. Text: "${fullText.substring(0, 80)}..."`);

      // Emit complete text
      socket.emit('text_complete', { fullText: fullText.trim() });

    } catch (error) {
      logger.error('[TextGen] Error generating text:', error);
      socket.emit('error', { message: 'Failed to generate text' });
    }
  }
}
