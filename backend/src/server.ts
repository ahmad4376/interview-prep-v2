// Load environment variables FIRST, before any other imports
import { config } from 'dotenv';
config({ path: '.env' });

import { createServer } from 'http';
import { Server, Socket } from 'socket.io';
import app from './app.js';
import { connectDatabase } from './config/database.js';
import { getRedisClient } from './config/redis.js';
import { handleInterview } from './sockets/interviewHandler.js';
import { logger } from './utils/logger.js';
import { verifyToken } from '@clerk/backend';

const PORT = process.env.PORT || 8000;

// Create HTTP server
const server = createServer(app);

// Setup Socket.IO
const io = new Server(server, {
  cors: {
    origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
    credentials: true,
  },
  maxHttpBufferSize: 1e6, // 1MB for audio chunks
});

// Socket.IO authentication middleware
io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth.token;

    // Development mode: allow connections without token
    if (!token) {
      if (process.env.NODE_ENV === 'development') {
        logger.warn('⚠️ No auth token provided - allowing in development mode');
        socket.data.userId = 'dev-user';
        socket.data.sessionId = 'dev-session';
        return next();
      }
      return next(new Error('Authentication error: No token provided'));
    }

    // Verify token with Clerk
    const verified = await verifyToken(token, {
      secretKey: process.env.CLERK_SECRET_KEY,
    });

    // Attach user info to socket
    socket.data.userId = verified.sub;
    socket.data.sessionId = verified.sid || '';

    logger.info(`✅ Socket authenticated: User ${socket.data.userId}`);
    next();
  } catch (error) {
    logger.error('Socket authentication error:', error);
    next(new Error('Authentication error'));
  }
});

// Socket.IO connection handler
io.on('connection', (socket: Socket) => {
  logger.info(`🔌 Client connected: ${socket.id} (User: ${socket.data.userId})`);

  // Join interview session
  socket.on('join_interview', async ({ interviewId }) => {
    try {
      logger.info(`User ${socket.data.userId} joining interview ${interviewId}`);

      // Start conversational interview session
      await handleInterview(socket, interviewId, socket.data.userId);
    } catch (error) {
      logger.error('Error joining interview:', error);
      socket.emit('error', { message: 'Failed to join interview' });
    }
  });

  socket.on('disconnect', () => {
    logger.info(`❌ Client disconnected: ${socket.id}`);
  });

  socket.on('error', (error) => {
    logger.error('Socket error:', error);
  });
});

// Start server
async function startServer() {
  try {
    // Connect to MongoDB
    await connectDatabase();

    // Connect to Redis
    const redis = getRedisClient();
    await redis.ping();
    logger.info('✅ Connected to Redis');

    // Start HTTP server
    server.listen(PORT, () => {
      logger.info(`🚀 Server running on port ${PORT}`);
      logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
      logger.info(`Allowed origins: ${process.env.ALLOWED_ORIGINS}`);
    });
  } catch (error) {
    logger.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

// Handle shutdown gracefully
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully...');
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully...');
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});

// Start the server
startServer();
