import { Socket } from 'socket.io';
import { ConversationService } from '../services/conversation-service.js';
import { logger } from '../utils/logger.js';

let conversationService: ConversationService | null = null;

function getConversationService(): ConversationService {
  if (!conversationService) {
    conversationService = new ConversationService();
  }
  return conversationService;
}

/**
 * Handle conversational text streaming
 */
export function handleTextStream(socket: Socket) {
  const service = getConversationService();

  logger.info(`[Conversation] Client connected: ${socket.id}`);

  // Initialize conversation history
  socket.data.conversationHistory = [];

  // Track if currently processing to prevent duplicate requests
  let isProcessing = false;

  // Handle conversation start (initial greeting)
  socket.on('start_conversation', async () => {
    logger.info(`[Conversation] Starting conversation for ${socket.id}`);

    try {
      await service.generateGreeting(socket);
    } catch (error) {
      logger.error('[Conversation] Error starting conversation:', error);
      socket.emit('error', { message: 'Failed to start conversation' });
    }
  });

  // Handle user responses
  socket.on('user_response', async (data: { text: string }) => {
    if (isProcessing) {
      logger.warn(`[Conversation] Already processing message for ${socket.id}, ignoring duplicate`);
      return;
    }

    isProcessing = true;

    logger.info(`[Conversation] User message from ${socket.id}:`);
    logger.info(`[Conversation] "${data.text}"`);

    try {
      // Get conversation history
      const history = socket.data.conversationHistory || [];

      // Add user message to history
      history.push({
        role: 'user',
        content: data.text,
      });

      // Update socket data
      socket.data.conversationHistory = history;

      // Generate AI response
      await service.respondToUser(socket, data.text, history);

    } catch (error) {
      logger.error('[Conversation] Error processing user response:', error);
      socket.emit('error', { message: 'Failed to process response' });
    } finally {
      isProcessing = false;
    }
  });

  socket.on('disconnect', () => {
    logger.info(`[Conversation] Client disconnected: ${socket.id}`);
    // Clear conversation history
    socket.data.conversationHistory = [];
  });
}
