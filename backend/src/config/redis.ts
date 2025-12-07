import Redis from 'ioredis';
import { logger } from '../utils/logger.js';

let redis: Redis | null = null;

export function getRedisClient(): Redis {
  if (!redis) {
    const redisUrl = process.env.REDIS_URL;
    if (!redisUrl) {
      throw new Error('REDIS_URL environment variable is not defined');
    }

    redis = new Redis(redisUrl, {
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      lazyConnect: true,
    });

    redis.on('connect', () => {
      logger.info('✅ Connected to Redis');
    });

    redis.on('error', (error) => {
      logger.error('Redis error:', error);
    });

    redis.connect().catch((error) => {
      logger.error('Failed to connect to Redis:', error);
    });
  }

  return redis;
}

export async function disconnectRedis() {
  if (redis) {
    await redis.quit();
    redis = null;
  }
}
