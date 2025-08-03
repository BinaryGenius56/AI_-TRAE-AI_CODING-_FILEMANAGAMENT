/**
 * Request ID Middleware
 * Generates and attaches unique IDs to requests for tracking
 */

const { v4: uuidv4 } = require('uuid');

/**
 * Create request ID middleware
 * @param {Object} options - Configuration options
 * @returns {Function} - Express middleware function
 */
const createRequestIdMiddleware = (options = {}) => {
  const {
    // Header to check for existing request ID
    headerName = 'X-Request-ID',
    
    // Whether to expose the request ID in the response headers
    exposeHeader = true,
    
    // Function to generate request ID if not provided
    generator = () => uuidv4(),
    
    // Property name to attach to request object
    requestProperty = 'id'
  } = options;
  
  return (req, res, next) => {
    // Check if request ID already exists in headers
    const existingId = req.headers[headerName.toLowerCase()];
    
    // Use existing ID or generate a new one
    const id = existingId || generator();
    
    // Attach ID to request object
    req[requestProperty] = id;
    
    // Expose ID in response headers if enabled
    if (exposeHeader) {
      res.setHeader(headerName, id);
    }
    
    next();
  };
};

/**
 * Default request ID middleware
 */
const requestId = createRequestIdMiddleware();

module.exports = {
  createRequestIdMiddleware,
  requestId
};