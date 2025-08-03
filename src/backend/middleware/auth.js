/**
 * Authentication Middleware
 * Handles user authentication and authorization
 */

const jwt = require('jsonwebtoken');
const config = require('../config/config');
const AuditService = require('../services/AuditService');

/**
 * Authenticate middleware
 * Verifies JWT token and adds user info to request
 */
const authenticate = (req, res, next) => {
  try {
    // Get token from Authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required. Please provide a valid token.'
      });
    }
    
    const token = authHeader.split(' ')[1];
    
    // Verify token
    const decoded = jwt.verify(token, config.jwt.secret);
    
    // Add user info to request
    req.user = decoded;
    
    // Log authentication
    AuditService.logAuthEvent({
      event_type: 'authentication',
      user_id: decoded.id,
      ip_address: req.ip,
      success: true
    });
    
    next();
  } catch (error) {
    console.error('Authentication error:', error);
    
    // Log failed authentication
    AuditService.logAuthEvent({
      event_type: 'authentication_failure',
      error: error.message,
      ip_address: req.ip,
      success: false
    });
    
    return res.status(401).json({
      success: false,
      error: 'Invalid or expired token'
    });
  }
};

/**
 * Authorize middleware
 * Checks if authenticated user has required role(s)
 * @param {Array|String} roles - Required role(s)
 */
const authorize = (roles) => {
  return (req, res, next) => {
    try {
      // Check if user is authenticated
      if (!req.user) {
        return res.status(401).json({
          success: false,
          error: 'Authentication required'
        });
      }
      
      // Convert roles to array if string
      const requiredRoles = Array.isArray(roles) ? roles : [roles];
      
      // Check if user has required role
      if (requiredRoles.includes(req.user.role)) {
        // Log authorization
        AuditService.logAuthEvent({
          event_type: 'authorization',
          user_id: req.user.id,
          role: req.user.role,
          required_roles: requiredRoles,
          ip_address: req.ip,
          success: true
        });
        
        return next();
      }
      
      // Log failed authorization
      AuditService.logAuthEvent({
        event_type: 'authorization_failure',
        user_id: req.user.id,
        role: req.user.role,
        required_roles: requiredRoles,
        ip_address: req.ip,
        success: false
      });
      
      return res.status(403).json({
        success: false,
        error: 'Access denied. Insufficient permissions.'
      });
    } catch (error) {
      console.error('Authorization error:', error);
      
      return res.status(500).json({
        success: false,
        error: 'Authorization error'
      });
    }
  };
};

/**
 * API Key authentication middleware
 * Verifies hospital API key for cross-hospital communication
 */
const authenticateApiKey = async (req, res, next) => {
  try {
    // Get API key and hospital ID from headers
    const apiKey = req.headers[config.apiKeyHeader.toLowerCase()];
    const hospitalId = req.headers[config.hospitalIdHeader.toLowerCase()];
    
    if (!apiKey || !hospitalId) {
      return res.status(401).json({
        success: false,
        error: 'API key and hospital ID required'
      });
    }
    
    // Verify API key with HospitalService
    // This is a placeholder - in a real implementation, this would verify against a database
    const isValidApiKey = await verifyApiKey(hospitalId, apiKey);
    
    if (!isValidApiKey) {
      // Log failed API key authentication
      AuditService.logAuthEvent({
        event_type: 'api_key_authentication_failure',
        hospital_id: hospitalId,
        ip_address: req.ip,
        success: false
      });
      
      return res.status(401).json({
        success: false,
        error: 'Invalid API key'
      });
    }
    
    // Add hospital info to request
    req.hospital = {
      id: hospitalId
    };
    
    // Log successful API key authentication
    AuditService.logAuthEvent({
      event_type: 'api_key_authentication',
      hospital_id: hospitalId,
      ip_address: req.ip,
      success: true
    });
    
    next();
  } catch (error) {
    console.error('API key authentication error:', error);
    
    return res.status(500).json({
      success: false,
      error: 'Authentication error'
    });
  }
};

/**
 * Verify API key
 * Placeholder function - in a real implementation, this would verify against a database
 * @param {String} hospitalId - Hospital ID
 * @param {String} apiKey - API key
 * @returns {Promise<Boolean>} - Whether API key is valid
 */
const verifyApiKey = async (hospitalId, apiKey) => {
  // In a real implementation, this would verify against a database
  // For now, we'll just return true for testing purposes
  return true;
};

module.exports = {
  authenticate,
  authorize,
  authenticateApiKey
};