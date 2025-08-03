/**
 * Logger Middleware
 * Handles HTTP request logging and integration with AuditService
 */

const morgan = require('morgan');
const { AuditService } = require('../services/AuditService');

/**
 * Custom morgan token for request body
 * Sanitizes sensitive data from request body
 */
morgan.token('body', (req) => {
  if (!req.body) return '-';
  
  // Create a sanitized copy of the request body
  const sanitized = { ...req.body };
  
  // List of sensitive fields to mask
  const sensitiveFields = [
    'password', 'token', 'secret', 'apiKey', 'api_key',
    'authorization', 'ssn', 'social_security', 'credit_card',
    'creditCard', 'cvv', 'pin'
  ];
  
  // Mask sensitive fields
  sensitiveFields.forEach(field => {
    if (field in sanitized) {
      sanitized[field] = '********';
    }
  });
  
  return JSON.stringify(sanitized);
});

/**
 * Custom morgan token for response body
 * Only used in development environment
 */
morgan.token('response-body', (req, res) => {
  if (!res.body) return '-';
  return JSON.stringify(res.body);
});

/**
 * Custom morgan token for user ID
 */
morgan.token('user-id', (req) => {
  return req.user ? req.user.id : 'anonymous';
});

/**
 * Custom morgan token for hospital ID
 */
morgan.token('hospital-id', (req) => {
  return req.hospital ? req.hospital.id : process.env.HOSPITAL_ID || 'unknown';
});

/**
 * Create HTTP request logger middleware
 * @param {String} environment - Current environment (development, production, test)
 * @returns {Function} - Express middleware function
 */
const createLogger = (environment = 'development') => {
  // Define format based on environment
  let format;
  
  if (environment === 'development') {
    // Detailed format for development
    format = morgan('dev', {
      skip: (req) => req.path === '/health' || req.path.startsWith('/metrics')
    });
  } else if (environment === 'production') {
    // JSON format for production
    format = morgan(JSON.stringify({
      timestamp: ':date[iso]',
      method: ':method',
      url: ':url',
      status: ':status',
      response_time: ':response-time ms',
      content_length: ':res[content-length]',
      remote_addr: ':remote-addr',
      remote_user: ':remote-user',
      user_id: ':user-id',
      hospital_id: ':hospital-id',
      referrer: ':referrer',
      user_agent: ':user-agent'
    }), {
      skip: (req) => req.path === '/health' || req.path.startsWith('/metrics')
    });
  } else {
    // Minimal format for test
    format = morgan('tiny', {
      skip: () => true // Skip logging in test environment
    });
  }
  
  return format;
};

/**
 * Audit logger middleware
 * Logs HTTP requests to AuditService
 */
const auditLogger = (req, res, next) => {
  // Skip health and metrics endpoints
  if (req.path === '/health' || req.path.startsWith('/metrics')) {
    return next();
  }
  
  // Store original end function
  const originalEnd = res.end;
  
  // Override end function to capture response
  res.end = function(chunk, encoding) {
    // Restore original end function
    res.end = originalEnd;
    
    // Call original end function
    res.end(chunk, encoding);
    
    // Log to audit service
    try {
      const eventType = req.path.includes('/auth') ? 'authentication' : 'api_access';
      
      AuditService.logNetworkEvent({
        event_type: eventType,
        severity: res.statusCode >= 400 ? 'medium' : 'low',
        details: {
          method: req.method,
          path: req.path,
          status_code: res.statusCode,
          ip: req.ip,
          user_id: req.user ? req.user.id : null,
          hospital_id: req.hospital ? req.hospital.id : process.env.HOSPITAL_ID || null,
          user_agent: req.headers['user-agent'],
          referrer: req.headers['referer'] || req.headers['referrer'],
          request_id: req.id,
          response_time: res.responseTime
        }
      });
    } catch (error) {
      console.error('Failed to log to audit service:', error);
    }
  };
  
  // Calculate response time
  const startTime = Date.now();
  res.on('finish', () => {
    res.responseTime = Date.now() - startTime;
  });
  
  next();
};

module.exports = {
  createLogger,
  auditLogger
};