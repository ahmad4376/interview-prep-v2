import { Socket } from 'socket.io';
import { InterviewConversationService, InterviewContext } from '../services/interview-conversation-service.js';
import Interview from '../models/Interview.js';
import { logger } from '../utils/logger.js';

// Active sessions tracking (prevent duplicates)
const activeSessions = new Map<string, boolean>();

// Lazy initialization
let conversationService: InterviewConversationService | null = null;

function getService(): InterviewConversationService {
  if (!conversationService) {
    conversationService = new InterviewConversationService();
  }
  return conversationService;
}

export async function handleInterview(
  socket: Socket,
  interviewId: string,
  userId: string
) {
  // Prevent duplicate sessions
  const sessionKey = `${interviewId}-${userId}`;
  if (activeSessions.get(sessionKey)) {
    logger.warn(`[Interview] Session already active: ${sessionKey}`);
    socket.emit('error', { message: 'Interview session already active' });
    return;
  }

  activeSessions.set(sessionKey, true);
  logger.info(`[Interview] Starting session: ${sessionKey}`);

  // Cleanup on disconnect
  socket.on('disconnect', () => {
    activeSessions.delete(sessionKey);
    logger.info(`[Interview] Cleaned up session: ${sessionKey}`);
  });

  try {
    // Load interview from database
    const interview = await Interview.findOne({ _id: interviewId, userId });
    if (!interview) {
      activeSessions.delete(sessionKey);
      socket.emit('error', { message: 'Interview not found' });
      return;
    }

    logger.info(`[Interview] Loaded interview: ${interview.title} at ${interview.company}`);

    // Update status to in-progress
    await Interview.findByIdAndUpdate(interviewId, {
      status: 'in-progress',
      startedAt: new Date(),
    });

    // Initialize service
    const service = getService();

    // Start processing job description in background (don't await)
    const processingPromise = service.processJobDescription(interview.description);

    // Initialize interview context
    const context: InterviewContext = {
      jobTitle: interview.title,
      jobDescription: interview.description,
      company: interview.company,
      interviewId: interviewId,
      stage: 'greeting',
      questionsAsked: 0,
      maxQuestions: 3,
      conversationHistory: [],
      keyRequirements: [],
      technicalSkills: [],
      softSkills: [],
      interviewQuestions: [],
      currentQuestion: null
    };

    // Store context in socket data
    socket.data.interviewContext = context;

    // Track if processing to prevent duplicate requests
    let isProcessing = false;

    // Handle start_interview event
    socket.on('start_interview', async () => {
      if (isProcessing) {
        logger.warn('[Interview] Already processing start_interview');
        return;
      }

      isProcessing = true;
      logger.info('[Interview] Received start_interview event');

      try {
        // Wait for background job description processing to complete
        const processed = await processingPromise;
        context.keyRequirements = processed.keyRequirements;
        context.technicalSkills = processed.technicalSkills;
        context.softSkills = processed.softSkills;

        logger.info('[Interview] Job description processed, sending greeting');

        // Send greeting
        await service.startInterview(socket, context);

      } catch (error) {
        logger.error('[Interview] Error starting interview:', error);
        socket.emit('error', { message: 'Failed to start interview' });
      } finally {
        isProcessing = false;
      }
    });

    // Handle user_response event
    socket.on('user_response', async (data: { text: string }) => {
      if (isProcessing) {
        logger.warn('[Interview] Already processing user response');
        return;
      }

      isProcessing = true;
      logger.info(`[Interview] User response: "${data.text.substring(0, 50)}..."`);

      try {
        await service.handleUserResponse(socket, data.text, context);
      } catch (error) {
        logger.error('[Interview] Error handling user response:', error);
        socket.emit('error', { message: 'Failed to process response' });
      } finally {
        isProcessing = false;
      }
    });

  } catch (error) {
    logger.error('[Interview] Error in interview handler:', error);
    activeSessions.delete(sessionKey);
    socket.emit('error', { message: 'Server error' });
  }
}
