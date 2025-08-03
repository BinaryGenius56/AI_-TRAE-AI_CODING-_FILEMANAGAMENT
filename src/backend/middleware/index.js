/**
 * Middleware Index
 * Exports all middleware modules for easier imports
 */

const { authenticate, authorize, authenticateApiKey } = require('./auth');
const { validate, schemas } = require('./validation');
const { ApiError, notFoundHandler, errorHandler, createError } = require('./errorHandler');
const { createRateLimiter, limiters } = require('./rateLimiter');
const { createLogger, auditLogger } = require('./logger');
const { createCorsMiddleware, corsConfigs } = require('./cors');
const { createUploadMiddleware, uploads, generateSecureFilename, baseUploadDir } = require('./fileUpload');
const { createSecurityMiddleware, securityConfigs } = require('./security');
const { createRequestIdMiddleware, requestId } = require('./requestId');

module.exports = {
  // Authentication middleware
  authenticate,
  authorize,
  authenticateApiKey,
  
  // Validation middleware
  validate,
  schemas,
  
  // Error handling middleware
  ApiError,
  notFoundHandler,
  errorHandler,
  createError,
  
  // Rate limiting middleware
  createRateLimiter,
  limiters,
  
  // Logging middleware
  createLogger,
  auditLogger,
  
  // CORS middleware
  createCorsMiddleware,
  corsConfigs,
  
  // File upload middleware
  createUploadMiddleware,
  uploads,
  generateSecureFilename,
  baseUploadDir,
  
  // Security middleware
  createSecurityMiddleware,
  securityConfigs,
  
  // Request ID middleware
  createRequestIdMiddleware,
  requestId
}