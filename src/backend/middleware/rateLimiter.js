/**
 * Rate Limiter Middleware
 * Protects API endpoints from abuse by limiting request rates
 */

const rateLimit = require('express-rate-limit');
const RedisStore = require('rate-limit-redis');
const Redis = require('ioredis');
const { AuditService } = require('../services/AuditService');

// Initialize Redis client if Redis URL is provided
let redisClient;
if (process.env.REDIS_URL) {
  redisClient = new Redis(process.env.REDIS_URL);
  redisClient.on('error', (err) => {
    console.error('Redis error:', err);
    // Fall back to memory store if Redis connection fails
  });
}

/**
 * Create a rate limiter middleware
 * @param {Object} options - Rate limiter options
 * @returns {Function} - Express middleware function
 */
const createRateLimiter = (options = {}) => {
  const {
    windowMs = 15 * 60 * 1000, // 15 minutes by default
    max = 100, // 100 requests per windowMs by default
    message = 'Too many requests, please try again later.',
    statusCode = 429,
    keyGenerator = (req) => req.ip,
    skip = () => false,
    path = '*',
    logToAudit = true
  } = options;

  const limiterOptions = {
    windowMs,
    max,
    message: {
      success: false,
      error: {
        status: statusCode,
        message
      }
    },
    statusCode,
    keyGenerator,
    skip,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res, next, options) => {
      if (logToAudit) {
        try {
          AuditService.logSecurityEvent({
            event_type: 'rate_limit_exceeded',
            severity: 'medium',
            details: {
              ip: req.ip,
              path: req.path,
              method: req.method,
              user_id: req.user ? req.user.id : null,
              headers: req.headers
            }
          });
        } catch (error) {
          console.error('Failed to log rate limit event:', error);
        }
      }
      res.status(options.statusCode).json(options.message);
    }
  };

  // Use Redis store if Redis client is available
  if (redisClient) {
    limiterOptions.store = new RedisStore({
      sendCommand: (...args) => redisClient.call(...args),
      prefix: `ratelimit:${path}:`
    });
  }

  return rateLimit(limiterOptions);
};

/**
 * Predefined rate limiters
 */
const limiters = {
  // Global rate limiter (applied to all routes)
  global: createRateLimiter({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: parseInt(process.env.RATE_LIMIT_GLOBAL_MAX || '100'),
    path: 'global'
  }),

  // API rate limiter (applied to /api routes)
  api: createRateLimiter({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: parseInt(process.env.RATE_LIMIT_API_MAX || '300'),
    path: 'api'
  }),

  // Authentication rate limiter (applied to auth routes)
  auth: createRateLimiter({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: parseInt(process.env.RATE_LIMIT_AUTH_MAX || '5'),
    message: 'Too many authentication attempts, please try again later.',
    path: 'auth'
  }),

  // Cross-hospital rate limiter (applied to cross-hospital routes)
  crossHospital: createRateLimiter({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: parseInt(process.env.RATE_LIMIT_CROSS_HOSPITAL_MAX || '50'),
    path: 'cross-hospital'
  }),

  // FHIR rate limiter (applied to FHIR routes)
  fhir: createRateLimiter({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: parseInt(process.env.RATE_LIMIT_FHIR_MAX || '200'),
    path: 'fhir'
  }),

  // DICOM rate limiter (applied to DICOM routes)
  dicom: createRateLimiter({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: parseInt(process.env.RATE_LIMIT_DICOM_MAX || '50'),
    path: 'dicom'
  })
};

module.exports = {
  createRateLimiter,
  limiters
};