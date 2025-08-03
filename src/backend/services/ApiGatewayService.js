/**
 * API Gateway Service
 * Centralizes and secures API traffic between hospitals and internal services
 */

const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cors = require('cors');
const { createProxyMiddleware } = require('http-proxy-middleware');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');

const authService = require('./AuthService');
const auditService = require('./AuditService');
const networkService = require('./NetworkService');

class ApiGatewayService {
  constructor() {
    this.config = {
      port: process.env.API_GATEWAY_PORT || 3000,
      jwtSecret: process.env.JWT_SECRET || 'your-secret-key', // Should be set in environment variables
      rateLimitWindowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10), // 15 minutes
      rateLimitMax: parseInt(process.env.RATE_LIMIT_MAX || '100', 10), // 100 requests per window
      corsOrigins: process.env.CORS_ORIGINS ? process.env.CORS_ORIGINS.split(',') : ['*'],
      proxyTimeout: parseInt(process.env.PROXY_TIMEOUT || '30000', 10), // 30 seconds
      enableSwagger: process.env.ENABLE_SWAGGER === 'true' || false
    };

    this.app = null;
    this.server = null;
    this.routes = [];
    this.serviceRegistry = new Map();
  }

  /**
   * Initialize the API Gateway
   * @returns {Promise<void>}
   */
  async initialize() {
    try {
      console.log('Initializing API Gateway Service...');

      // Create Express app
      this.app = express();

      // Apply middleware
      this.applyMiddleware();

      // Register routes
      this.registerRoutes();

      // Register error handlers
      this.registerErrorHandlers();

      // Start server
      await this.startServer();

      console.log('API Gateway Service initialized successfully');
    } catch (error) {
      console.error('Failed to initialize API Gateway Service:', error);
      throw error;
    }
  }

  /**
   * Apply middleware to Express app
   */
  applyMiddleware() {
    // Security headers
    this.app.use(helmet());

    // CORS
    this.app.use(cors({
      origin: this.config.corsOrigins,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Hospital-ID', 'X-API-Key'],
      credentials: true,
      maxAge: 86400 // 24 hours
    }));

    // Body parsing
    this.app.use(express.json({ limit: '1mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '1mb' }));

    // Request ID
    this.app.use((req, res, next) => {
      req.id = uuidv4();
      res.setHeader('X-Request-ID', req.id);
      next();
    });

    // Logging
    this.app.use((req, res, next) => {
      const start = Date.now();
      res.on('finish', () => {
        const duration = Date.now() - start;
        console.log(`${req.method} ${req.originalUrl} ${res.statusCode} ${duration}ms`);
        
        // Log to audit service for non-GET requests or any authenticated requests
        if (req.method !== 'GET' || req.user) {
          auditService.logApiRequest({
            requestId: req.id,
            method: req.method,
            path: req.originalUrl,
            statusCode: res.statusCode,
            duration,
            userId: req.user?.id,
            hospitalId: req.user?.hospitalId,
            ipAddress: req.ip,
            userAgent: req.headers['user-agent'],
            timestamp: new Date().toISOString()
          }).catch(err => {
            console.error('Failed to log API request:', err);
          });
        }
      });
      next();
    });

    // Rate limiting
    const apiLimiter = rateLimit({
      windowMs: this.config.rateLimitWindowMs,
      max: this.config.rateLimitMax,
      standardHeaders: true,
      legacyHeaders: false,
      keyGenerator: (req) => {
        // Use API key, user ID, or IP address as the rate limit key
        return req.headers['x-api-key'] || req.user?.id || req.ip;
      },
      handler: (req, res) => {
        res.status(429).json({
          error: 'Too many requests, please try again later.',
          requestId: req.id
        });
      }
    });
    this.app.use('/api/', apiLimiter);
  }

  /**
   * Register API routes
   */
  registerRoutes() {
    // Health check endpoint
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        version: process.env.API_VERSION || '1.0.0'
      });
    });

    // API documentation (Swagger) if enabled
    if (this.config.enableSwagger) {
      const swaggerUi = require('swagger-ui-express');
      const swaggerDocument = require('../../api-spec.yaml');
      this.app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));
    }

    // Register internal service routes
    this.registerServiceRoutes();

    // Register cross-hospital routes
    this.registerCrossHospitalRoutes();

    // Catch-all route for 404
    this.app.use('*', (req, res) => {
      res.status(404).json({
        error: 'Not Found',
        message: `Route ${req.originalUrl} not found`,
        requestId: req.id
      });
    });
  }

  /**
   * Register internal service routes
   */
  registerServiceRoutes() {
    // Register patient service
    this.registerService({
      name: 'patient',
      prefix: '/api/patients',
      target: process.env.PATIENT_SERVICE_URL || 'http://localhost:3001',
      auth: true,
      roles: ['doctor', 'nurse', 'admin']
    });

    // Register medical record service
    this.registerService({
      name: 'medical-record',
      prefix: '/api/medical-records',
      target: process.env.MEDICAL_RECORD_SERVICE_URL || 'http://localhost:3002',
      auth: true,
      roles: ['doctor', 'nurse', 'admin']
    });

    // Register medication service
    this.registerService({
      name: 'medication',
      prefix: '/api/medications',
      target: process.env.MEDICATION_SERVICE_URL || 'http://localhost:3003',
      auth: true,
      roles: ['doctor', 'nurse', 'pharmacist', 'admin']
    });

    // Register document service
    this.registerService({
      name: 'document',
      prefix: '/api/documents',
      target: process.env.DOCUMENT_SERVICE_URL || 'http://localhost:3004',
      auth: true,
      roles: ['doctor', 'nurse', 'admin']
    });

    // Register hospital service
    this.registerService({
      name: 'hospital',
      prefix: '/api/hospitals',
      target: process.env.HOSPITAL_SERVICE_URL || 'http://localhost:3005',
      auth: true,
      roles: ['admin']
    });

    // Register auth service (no auth required for login/register endpoints)
    this.registerService({
      name: 'auth',
      prefix: '/api/auth',
      target: process.env.AUTH_SERVICE_URL || 'http://localhost:3006',
      auth: false
    });
  }

  /**
   * Register cross-hospital routes
   */
  registerCrossHospitalRoutes() {
    // Cross-hospital authentication middleware
    const crossHospitalAuth = async (req, res, next) => {
      try {
        // Check for hospital ID and API key
        const hospitalId = req.headers['x-hospital-id'];
        const apiKey = req.headers['x-api-key'];
        const signature = req.headers['x-signature'];
        const timestamp = req.headers['x-timestamp'];

        if (!hospitalId || !apiKey || !signature || !timestamp) {
          return res.status(401).json({
            error: 'Unauthorized',
            message: 'Missing required authentication headers',
            requestId: req.id
          });
        }

        // Check if timestamp is recent (within 5 minutes)
        const requestTime = new Date(timestamp);
        const now = new Date();
        const timeDiff = (now - requestTime) / 1000 / 60; // difference in minutes
        if (timeDiff > 5) {
          return res.status(401).json({
            error: 'Unauthorized',
            message: 'Request has expired',
            requestId: req.id
          });
        }

        // Check if hospital is connected to the network
        if (!networkService.isHospitalConnected(hospitalId)) {
          return res.status(403).json({
            error: 'Forbidden',
            message: 'Hospital is not connected to the network',
            requestId: req.id
          });
        }

        // Verify API key and signature
        const isValid = await this.verifyHospitalRequest(hospitalId, apiKey, signature, {
          method: req.method,
          path: req.path,
          timestamp
        });

        if (!isValid) {
          return res.status(401).json({
            error: 'Unauthorized',
            message: 'Invalid authentication',
            requestId: req.id
          });
        }

        // Set hospital in request
        req.hospital = { id: hospitalId };
        next();
      } catch (error) {
        console.error('Cross-hospital authentication error:', error);
        res.status(500).json({
          error: 'Internal Server Error',
          message: 'Authentication failed',
          requestId: req.id
        });
      }
    };

    // Cross-hospital patient record access
    this.app.get('/api/cross-hospital/patients/:patientId/records', crossHospitalAuth, async (req, res) => {
      try {
        const { patientId } = req.params;
        const { accessToken } = req.query;

        // Verify access token for patient
        if (!accessToken) {
          return res.status(401).json({
            error: 'Unauthorized',
            message: 'Missing access token',
            requestId: req.id
          });
        }

        // Forward request to patient record service
        // In a real implementation, this would proxy to the appropriate internal service
        res.json({
          patientId,
          hospitalId: req.hospital.id,
          records: [
            { id: '1', type: 'medication', date: '2023-01-01' },
            { id: '2', type: 'diagnosis', date: '2023-01-02' }
          ]
        });
      } catch (error) {
        console.error('Error accessing cross-hospital patient records:', error);
        res.status(500).json({
          error: 'Internal Server Error',
          message: 'Failed to retrieve patient records',
          requestId: req.id
        });
      }
    });

    // Cross-hospital medication access
    this.app.get('/api/cross-hospital/patients/:patientId/medications', crossHospitalAuth, async (req, res) => {
      try {
        const { patientId } = req.params;
        const { accessToken } = req.query;

        // Verify access token for patient
        if (!accessToken) {
          return res.status(401).json({
            error: 'Unauthorized',
            message: 'Missing access token',
            requestId: req.id
          });
        }

        // Forward request to medication service
        // In a real implementation, this would proxy to the appropriate internal service
        res.json({
          patientId,
          hospitalId: req.hospital.id,
          medications: [
            { id: '1', name: 'Medication 1', dosage: '10mg', frequency: 'daily' },
            { id: '2', name: 'Medication 2', dosage: '5mg', frequency: 'twice daily' }
          ]
        });
      } catch (error) {
        console.error('Error accessing cross-hospital patient medications:', error);
        res.status(500).json({
          error: 'Internal Server Error',
          message: 'Failed to retrieve patient medications',
          requestId: req.id
        });
      }
    });

    // Cross-hospital document access
    this.app.get('/api/cross-hospital/patients/:patientId/documents', crossHospitalAuth, async (req, res) => {
      try {
        const { patientId } = req.params;
        const { accessToken } = req.query;

        // Verify access token for patient
        if (!accessToken) {
          return res.status(401).json({
            error: 'Unauthorized',
            message: 'Missing access token',
            requestId: req.id
          });
        }

        // Forward request to document service
        // In a real implementation, this would proxy to the appropriate internal service
        res.json({
          patientId,
          hospitalId: req.hospital.id,
          documents: [
            { id: '1', type: 'lab_report', date: '2023-01-01', filename: 'lab_report.pdf' },
            { id: '2', type: 'mri_scan', date: '2023-01-02', filename: 'mri_scan.dcm' }
          ]
        });
      } catch (error) {
        console.error('Error accessing cross-hospital patient documents:', error);
        res.status(500).json({
          error: 'Internal Server Error',
          message: 'Failed to retrieve patient documents',
          requestId: req.id
        });
      }
    });
  }

  /**
   * Register a service with the API Gateway
   * @param {Object} service - Service configuration
   * @param {string} service.name - Service name
   * @param {string} service.prefix - URL prefix for the service
   * @param {string} service.target - Target URL for the service
   * @param {boolean} service.auth - Whether authentication is required
   * @param {Array<string>} service.roles - Allowed roles (if auth is true)
   */
  registerService(service) {
    console.log(`Registering service: ${service.name} at ${service.prefix} -> ${service.target}`);

    // Store service in registry
    this.serviceRegistry.set(service.name, service);

    // Create authentication middleware if required
    const authMiddleware = service.auth ? this.createAuthMiddleware(service.roles) : (req, res, next) => next();

    // Create proxy middleware
    const proxyMiddleware = createProxyMiddleware({
      target: service.target,
      changeOrigin: true,
      pathRewrite: {
        [`^${service.prefix}`]: '',
      },
      proxyTimeout: this.config.proxyTimeout,
      onProxyReq: (proxyReq, req, res) => {
        // Add request ID to proxied request
        proxyReq.setHeader('X-Request-ID', req.id);

        // Add user ID if authenticated
        if (req.user) {
          proxyReq.setHeader('X-User-ID', req.user.id);
          proxyReq.setHeader('X-User-Role', req.user.role);
          proxyReq.setHeader('X-Hospital-ID', req.user.hospitalId);
        }

        // If body was parsed as JSON, we need to restream it
        if (req.body && Object.keys(req.body).length > 0) {
          const bodyData = JSON.stringify(req.body);
          proxyReq.setHeader('Content-Type', 'application/json');
          proxyReq.setHeader('Content-Length', Buffer.byteLength(bodyData));
          proxyReq.write(bodyData);
        }
      },
      onProxyRes: (proxyRes, req, res) => {
        // Add CORS headers if needed
        proxyRes.headers['Access-Control-Allow-Origin'] = this.config.corsOrigins.includes('*') ? '*' : req.headers.origin;
      },
      onError: (err, req, res) => {
        console.error(`Proxy error for ${service.name}:`, err);
        res.status(500).json({
          error: 'Internal Server Error',
          message: 'Service unavailable',
          service: service.name,
          requestId: req.id
        });
      }
    });

    // Register route with authentication middleware
    this.app.use(service.prefix, authMiddleware, proxyMiddleware);

    // Add to routes list
    this.routes.push({
      path: service.prefix,
      service: service.name,
      target: service.target,
      auth: service.auth,
      roles: service.roles
    });
  }

  /**
   * Create authentication middleware
   * @param {Array<string>} roles - Allowed roles
   * @returns {Function} - Express middleware
   */
  createAuthMiddleware(roles = []) {
    return async (req, res, next) => {
      try {
        // Get authorization header
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
          return res.status(401).json({
            error: 'Unauthorized',
            message: 'Missing or invalid authorization header',
            requestId: req.id
          });
        }

        // Extract token
        const token = authHeader.split(' ')[1];

        // Verify token
        const decoded = await this.verifyToken(token);

        // Check if token is valid
        if (!decoded) {
          return res.status(401).json({
            error: 'Unauthorized',
            message: 'Invalid or expired token',
            requestId: req.id
          });
        }

        // Check if user has required role
        if (roles && roles.length > 0 && !roles.includes(decoded.role)) {
          return res.status(403).json({
            error: 'Forbidden',
            message: 'Insufficient permissions',
            requestId: req.id
          });
        }

        // Set user in request
        req.user = decoded;
        next();
      } catch (error) {
        console.error('Authentication error:', error);
        res.status(401).json({
          error: 'Unauthorized',
          message: 'Authentication failed',
          requestId: req.id
        });
      }
    };
  }

  /**
   * Verify JWT token
   * @param {string} token - JWT token
   * @returns {Promise<Object|null>} - Decoded token or null if invalid
   */
  async verifyToken(token) {
    try {
      // Verify token with JWT library
      const decoded = jwt.verify(token, this.config.jwtSecret);

      // Check if token is in blacklist (would typically check a Redis cache)
      const isBlacklisted = false; // await authService.isTokenBlacklisted(token);
      if (isBlacklisted) {
        return null;
      }

      return decoded;
    } catch (error) {
      console.error('Token verification error:', error);
      return null;
    }
  }

  /**
   * Verify cross-hospital request
   * @param {string} hospitalId - Hospital ID
   * @param {string} apiKey - API key
   * @param {string} signature - Request signature
   * @param {Object} request - Request details
   * @returns {Promise<boolean>} - Whether request is valid
   */
  async verifyHospitalRequest(hospitalId, apiKey, signature, request) {
    try {
      // In a real implementation, this would verify the API key against a database
      // and use the hospital's public key to verify the signature
      
      // For this example, we'll simulate a successful verification
      return true;
    } catch (error) {
      console.error('Hospital request verification error:', error);
      return false;
    }
  }

  /**
   * Register error handlers
   */
  registerErrorHandlers() {
    // Error handler for JSON parsing
    this.app.use((err, req, res, next) => {
      if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'Invalid JSON',
          requestId: req.id
        });
      }
      next(err);
    });

    // General error handler
    this.app.use((err, req, res, next) => {
      console.error('Unhandled error:', err);
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'An unexpected error occurred',
        requestId: req.id
      });
    });
  }

  /**
   * Start the server
   * @returns {Promise<void>}
   */
  async startServer() {
    return new Promise((resolve, reject) => {
      this.server = this.app.listen(this.config.port, () => {
        console.log(`API Gateway listening on port ${this.config.port}`);
        resolve();
      });

      this.server.on('error', (error) => {
        console.error('Error starting API Gateway server:', error);
        reject(error);
      });
    });
  }

  /**
   * Get registered routes
   * @returns {Array<Object>} - List of registered routes
   */
  getRoutes() {
    return this.routes;
  }

  /**
   * Get registered services
   * @returns {Array<Object>} - List of registered services
   */
  getServices() {
    return Array.from(this.serviceRegistry.values());
  }

  /**
   * Shutdown the server
   * @returns {Promise<void>}
   */
  async shutdown() {
    return new Promise((resolve, reject) => {
      if (!this.server) {
        resolve();
        return;
      }

      this.server.close((err) => {
        if (err) {
          console.error('Error shutting down API Gateway server:', err);
          reject(err);
        } else {
          console.log('API Gateway server shut down successfully');
          this.server = null;
          resolve();
        }
      });
    });
  }
}

module.exports = new ApiGatewayService();