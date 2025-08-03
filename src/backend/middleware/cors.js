/**
 * CORS Middleware
 * Configures Cross-Origin Resource Sharing for the API
 */

const cors = require('cors');

/**
 * Create CORS middleware with configurable options
 * @param {Object} options - CORS configuration options
 * @returns {Function} - Express middleware function
 */
const createCorsMiddleware = (options = {}) => {
  const {
    // Default allowed origins from environment variable or allow localhost in development
    allowedOrigins = process.env.CORS_ALLOWED_ORIGINS ? 
      process.env.CORS_ALLOWED_ORIGINS.split(',') : 
      (process.env.NODE_ENV === 'development' ? 
        ['http://localhost:3000', 'http://localhost:8080'] : []),
    
    // Default allowed methods
    allowedMethods = process.env.CORS_ALLOWED_METHODS ? 
      process.env.CORS_ALLOWED_METHODS.split(',') : 
      ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    
    // Default allowed headers
    allowedHeaders = process.env.CORS_ALLOWED_HEADERS ? 
      process.env.CORS_ALLOWED_HEADERS.split(',') : 
      ['Content-Type', 'Authorization', 'X-Requested-With', 'X-API-Key', 'X-Hospital-ID'],
    
    // Default exposed headers
    exposedHeaders = process.env.CORS_EXPOSED_HEADERS ? 
      process.env.CORS_EXPOSED_HEADERS.split(',') : 
      ['Content-Disposition', 'X-Rate-Limit-Limit', 'X-Rate-Limit-Remaining', 'X-Rate-Limit-Reset'],
    
    // Default max age (24 hours)
    maxAge = parseInt(process.env.CORS_MAX_AGE || '86400'),
    
    // Default credentials setting
    credentials = process.env.CORS_ALLOW_CREDENTIALS === 'true'
  } = options;

  return cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps, curl, etc)
      if (!origin) return callback(null, true);
      
      // Check if origin is in allowed list
      if (allowedOrigins.indexOf(origin) !== -1 || allowedOrigins.includes('*')) {
        return callback(null, true);
      }
      
      // Check if origin matches any wildcard patterns
      const wildcardOrigins = allowedOrigins.filter(o => o.includes('*'));
      for (const pattern of wildcardOrigins) {
        const regexPattern = pattern.replace(/\./g, '\\.').replace(/\*/g, '.*');
        const regex = new RegExp(`^${regexPattern}$`);
        if (regex.test(origin)) {
          return callback(null, true);
        }
      }
      
      // Origin not allowed
      callback(new Error(`Origin ${origin} not allowed by CORS policy`));
    },
    methods: allowedMethods,
    allowedHeaders,
    exposedHeaders,
    maxAge,
    credentials
  });
};

/**
 * Predefined CORS configurations
 */
const corsConfigs = {
  // Default configuration
  default: createCorsMiddleware(),
  
  // Strict configuration for sensitive routes
  strict: createCorsMiddleware({
    allowedOrigins: process.env.CORS_STRICT_ORIGINS ? 
      process.env.CORS_STRICT_ORIGINS.split(',') : 
      [],
    credentials: true
  }),
  
  // Public configuration for public routes
  public: createCorsMiddleware({
    allowedOrigins: ['*'],
    credentials: false
  }),
  
  // Cross-hospital configuration for hospital network
  crossHospital: createCorsMiddleware({
    allowedOrigins: process.env.HOSPITAL_NETWORK_ORIGINS ? 
      process.env.HOSPITAL_NETWORK_ORIGINS.split(',') : 
      [],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key', 'X-Hospital-ID', 'X-Request-ID'],
    credentials: true
  })
};

module.exports = {
  createCorsMiddleware,
  corsConfigs
};