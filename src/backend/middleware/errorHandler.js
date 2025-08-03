/**
 * Error Handler Middleware
 * Centralizes error handling and response formatting
 */

const { AuditService } = require('../services/AuditService');

/**
 * Custom error class for API errors
 */
class ApiError extends Error {
  constructor(statusCode, message, details = null) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Not found error handler
 * Handles 404 errors for routes that don't exist
 */
const notFoundHandler = (req, res, next) => {
  const error = new ApiError(404, `Resource not found - ${req.originalUrl}`);
  next(error);
};

/**
 * Global error handler
 * Handles all errors and formats responses consistently
 */
const errorHandler = (err, req, res, next) => {
  // Default error status and message if not specified
  const statusCode = err.statusCode || 500;
  const message = err.message || 'Internal server error';
  const details = err.details || null;
  
  // Log the error
  const logLevel = statusCode >= 500 ? 'error' : 'warn';
  console[logLevel](`[${statusCode}] ${message}`, {
    error: err.stack,
    path: req.path,
    method: req.method,
    ip: req.ip,
    user: req.user ? req.user.id : 'unauthenticated'
  });
  
  // Log to audit service for 500 errors
  if (statusCode >= 500) {
    try {
      AuditService.logSystemEvent({
        event_type: 'error',
        severity: 'high',
        details: {
          message,
          stack: err.stack,
          path: req.path,
          method: req.method,
          user_id: req.user ? req.user.id : null
        }
      });
    } catch (auditError) {
      console.error('Failed to log error to audit service:', auditError);
    }
  }
  
  // Send error response
  res.status(statusCode).json({
    success: false,
    error: {
      status: statusCode,
      message,
      ...(details && { details })
    }
  });
};

/**
 * Error factory functions for common error types
 */
const createError = {
  badRequest: (message, details) => new ApiError(400, message || 'Bad request', details),
  unauthorized: (message, details) => new ApiError(401, message || 'Unauthorized', details),
  forbidden: (message, details) => new ApiError(403, message || 'Forbidden', details),
  notFound: (message, details) => new ApiError(404, message || 'Resource not found', details),
  methodNotAllowed: (message, details) => new ApiError(405, message || 'Method not allowed', details),
  conflict: (message, details) => new ApiError(409, message || 'Conflict', details),
  unprocessableEntity: (message, details) => new ApiError(422, message || 'Unprocessable entity', details),
  tooManyRequests: (message, details) => new ApiError(429, message || 'Too many requests', details),
  internal: (message, details) => new ApiError(500, message || 'Internal server error', details)
};

module.exports = {
  ApiError,
  notFoundHandler,
  errorHandler,
  createError
};