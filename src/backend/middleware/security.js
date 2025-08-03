/**
 * Security Middleware
 * Implements security best practices for the API
 */

const helmet = require('helmet');
const hpp = require('hpp');
const xss = require('xss-clean');
const mongoSanitize = require('express-mongo-sanitize');

/**
 * Create security middleware with configurable options
 * @param {Object} options - Security configuration options
 * @returns {Array} - Array of Express middleware functions
 */
const createSecurityMiddleware = (options = {}) => {
  const {
    // Content Security Policy options
    contentSecurityPolicy = process.env.SECURITY_CSP_ENABLED !== 'false',
    cspOptions = {},
    
    // XSS Protection options
    xssProtection = true,
    
    // HTTP Parameter Pollution options
    parameterPollution = true,
    
    // MongoDB query sanitization options
    mongoSanitization = true,
    
    // Referrer Policy options
    referrerPolicy = true,
    referrerPolicyOption = { policy: 'same-origin' },
    
    // Frameguard options (X-Frame-Options)
    frameguard = true,
    frameguardOption = { action: 'deny' },
    
    // HSTS options
    hsts = process.env.NODE_ENV === 'production',
    hstsOptions = {
      maxAge: 15552000, // 180 days
      includeSubDomains: true,
      preload: true
    },
    
    // noSniff options (X-Content-Type-Options)
    noSniff = true,
    
    // DNS Prefetch Control options
    dnsPrefetchControl = true,
    dnsPrefetchControlOption = { allow: false }
  } = options;
  
  // Configure helmet middleware
  const helmetOptions = {
    contentSecurityPolicy: contentSecurityPolicy ? {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        imgSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"],
        frameSrc: ["'none'"],
        objectSrc: ["'none'"],
        upgradeInsecureRequests: [],
        ...cspOptions
      }
    } : false,
    xssFilter: xssProtection,
    referrerPolicy: referrerPolicy ? referrerPolicyOption : false,
    frameguard: frameguard ? frameguardOption : false,
    hsts: hsts ? hstsOptions : false,
    noSniff,
    dnsPrefetchControl: dnsPrefetchControl ? dnsPrefetchControlOption : false
  };
  
  // Create middleware array
  const middleware = [helmet(helmetOptions)];
  
  // Add HTTP Parameter Pollution protection
  if (parameterPollution) {
    middleware.push(hpp());
  }
  
  // Add XSS protection
  if (xssProtection) {
    middleware.push(xss());
  }
  
  // Add MongoDB query sanitization
  if (mongoSanitization) {
    middleware.push(mongoSanitize());
  }
  
  return middleware;
};

/**
 * Predefined security configurations
 */
const securityConfigs = {
  // Default configuration
  default: createSecurityMiddleware(),
  
  // API configuration (less restrictive for API endpoints)
  api: createSecurityMiddleware({
    contentSecurityPolicy: false,
    referrerPolicy: true,
    referrerPolicyOption: { policy: 'no-referrer' },
    frameguard: true,
    hsts: process.env.NODE_ENV === 'production'
  }),
  
  // Frontend configuration (more permissive for frontend assets)
  frontend: createSecurityMiddleware({
    contentSecurityPolicy: true,
    cspOptions: {
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", 'https://cdn.jsdelivr.net'],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com', 'https://cdn.jsdelivr.net'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com', 'https://cdn.jsdelivr.net'],
      imgSrc: ["'self'", 'data:', 'https:'],
      connectSrc: ["'self'", 'https://api.example.com']
    },
    referrerPolicy: true,
    referrerPolicyOption: { policy: 'strict-origin-when-cross-origin' }
  })
};

module.exports = {
  createSecurityMiddleware,
  securityConfigs
};