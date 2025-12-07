import { clerkClient } from '@clerk/express';
import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger.js';
import { verifyToken } from '@clerk/backend';

export async function authenticateClerk(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');

    if (!token) {
      return res.status(401).json({ message: 'No token provided' });
    }

    // Verify JWT token with Clerk
    const verified = await verifyToken(token, {
      secretKey: process.env.CLERK_SECRET_KEY,
    });

    // Attach user info to request
    req.auth = {
      userId: verified.sub,
      sessionId: verified.sid || '',
    };

    next();
  } catch (error) {
    logger.error('Authentication error:', error);
    res.status(401).json({ message: 'Invalid token' });
  }
}

// Extend Express Request type
declare global {
  namespace Express {
    interface Request {
      auth?: {
        userId: string;
        sessionId: string;
      };
    }
  }
}
