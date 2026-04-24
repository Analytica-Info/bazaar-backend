'use strict';

const logger = require('../utilities/logger');

let _client = null;
let _initialized = false;

/**
 * Returns true if Redis is configured and not explicitly disabled.
 */
function isEnabled() {
  return process.env.CACHE_ENABLED !== 'false' && Boolean(process.env.REDIS_URL);
}

/**
 * Build and return the singleton ioredis client.
 * Returns null if disabled or if construction fails.
 */
function getClient() {
  if (_initialized) return _client;
  _initialized = true;

  if (!isEnabled()) {
    logger.info({ module: 'redis' }, 'Redis cache disabled (CACHE_ENABLED=false or REDIS_URL not set)');
    return null;
  }

  let Redis;
  try {
    Redis = require('ioredis');
  } catch (err) {
    logger.error({ module: 'redis', err }, 'ioredis not installed — Redis cache unavailable');
    return null;
  }

  try {
    const client = new Redis(process.env.REDIS_URL, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      retryStrategy(times) {
        if (times > 10) {
          logger.error({ module: 'redis', attempt: times }, 'Redis max reconnect attempts reached — giving up');
          return null; // stop retrying
        }
        const delay = Math.min(100 * 2 ** times, 30_000);
        logger.warn({ module: 'redis', attempt: times, delayMs: delay }, 'Redis reconnecting');
        return delay;
      },
      reconnectOnError(err) {
        // Reconnect on READONLY errors (e.g. replica promotion)
        return err.message.startsWith('READONLY');
      },
    });

    client.on('connect', () => logger.info({ module: 'redis' }, 'Redis connecting'));
    client.on('ready', () => logger.info({ module: 'redis' }, 'Redis ready'));
    client.on('reconnecting', (ms) => logger.warn({ module: 'redis', delayMs: ms }, 'Redis reconnecting'));
    client.on('error', (err) => logger.error({ module: 'redis', err }, 'Redis error'));
    client.on('close', () => logger.warn({ module: 'redis' }, 'Redis connection closed'));
    client.on('end', () => logger.error({ module: 'redis' }, 'Redis connection ended — no further reconnects'));

    // Kick off the connection without blocking startup
    client.connect().catch((err) => {
      logger.warn({ module: 'redis', err }, 'Redis initial connect failed — will retry in background');
    });

    _client = client;
    return _client;
  } catch (err) {
    logger.error({ module: 'redis', err }, 'Failed to construct Redis client');
    return null;
  }
}

module.exports = { getClient, isEnabled };
