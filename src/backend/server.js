/**
 * Hospital Network Management System - Main Server
 * Integrates all services and provides the main application entry point
 */

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const morgan = require('morgan');
const path = require('path');
const fs = require('fs');
const https = require('https');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

// Import services
const apiGatewayService = require('./services/ApiGatewayService');
const networkService = require('./services/NetworkService');
const fhirService = require('./services/FhirService');
const dicomService = require('./services/DicomService');
const messageBrokerService = require('./services/MessageBrokerService');
const auditService = require('./services/AuditService');

// Import controllers
const hospitalController = require('./controllers/HospitalController');
const patientController = require('./controllers/PatientController');
const medicationController = require('./controllers/MedicationController');
const documentController = require('./controllers/DocumentController');
const authController = require('./controllers/AuthController');
const crossHospitalController = require('./controllers/CrossHospitalController');

// Create Express app
const app = express();

// Configuration
const config = {
  port: process.env.PORT || 3000,
  env: process.env.NODE_ENV || 'development',
  hospitalId: process.env.HOSPITAL_ID || 'hospital-' + require('os').hostname(),
  hospitalName: process.env.HOSPITAL_NAME || 'Hospital Network Node',
  apiVersion: process.env.API_VERSION || 'v1',
  corsOrigins: (process.env.CORS_ORIGINS || '*').split(','),
  rateLimitMax: parseInt(process.env.RATE_LIMIT_MAX || '100', 10),
  rateLimitWindowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10), // 15 minutes
  useHttps: process.env.USE_HTTPS === 'true' || false,
  sslCert: process.env.SSL_CERT_PATH,
  sslKey: process.env.SSL_KEY_PATH,
  logFormat: process.env.LOG_FORMAT || 'combined',
  logDirectory: process.env.LOG_DIRECTORY || path.join(__dirname, '../logs'),
  staticDirectory: process.env.STATIC_DIRECTORY || path.join(__dirname, '../public'),
  uploadDirectory: process.env.UPLOAD_DIRECTORY || path.join(__dirname, '../uploads'),
  maxUploadSize: process.env.MAX_UPLOAD_SIZE || '50mb',
  trustProxy: process.env.TRUST_PROXY === 'true' || false
};

// Ensure directories exist
ensureDirectoryExists(config.logDirectory);
ensureDirectoryExists(config.uploadDirectory);

// Set up logging
const accessLogStream = fs.createWriteStream(
  path.join(config.logDirectory, 'access.log'),
  { flags: 'a' }
);

// Configure Express middleware
app.use(helmet()); // Security headers
app.use(cors({
  origin: config.corsOrigins,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));
app.use(compression()); // Compress responses
app.use(express.json({ limit: config.maxUploadSize })); // Parse JSON bodies
app.use(express.urlencoded({ extended: true, limit: config.maxUploadSize })); // Parse URL-encoded bodies
app.use(morgan(config.logFormat, { stream: accessLogStream })); // HTTP request logging

// Trust proxy if configured (for correct client IP behind load balancers)
if (config.trustProxy) {
  app.set('trust proxy', 1);
}

// Rate limiting
const limiter = rateLimit({
  windowMs: config.rateLimitWindowMs,
  max: config.rateLimitMax,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many requests from this IP, please try again later.'
});
app.use('/api/', limiter);

// Static files
app.use(express.static(config.staticDirectory));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '1.0.0',
    hospitalId: config.hospitalId,
    hospitalName: config.hospitalName,
    environment: config.env
  });
});

// API routes
const apiRouter = express.Router();
app.use(`/api/${config.apiVersion}`, apiRouter);

// Register controllers
apiRouter.use('/auth', authController);
apiRouter.use('/hospitals', hospitalController);
apiRouter.use('/patients', patientController);
apiRouter.use('/medications', medicationController);
apiRouter.use('/documents', documentController);
apiRouter.use('/cross-hospital', crossHospitalController);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  
  // Log error to audit service
  auditService.logSystemEvent({
    eventType: 'server_error',
    status: 'error',
    component: 'server',
    details: {
      message: err.message,
      stack: config.env === 'development' ? err.stack : undefined,
      path: req.path,
      method: req.method,
      ip: req.ip
    }
  }).catch(console.error);
  
  res.status(err.status || 500).json({
    error: {
      message: config.env === 'development' ? err.message : 'Internal Server Error',
      code: err.code || 'SERVER_ERROR'
    }
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: {
      message: 'Not Found',
      code: 'NOT_FOUND'
    }
  });
});

// Start server
async function startServer() {
  try {
    // Initialize services
    await initializeServices();
    
    // Create HTTP or HTTPS server
    let server;
    if (config.useHttps && config.sslCert && config.sslKey) {
      const httpsOptions = {
        key: fs.readFileSync(config.sslKey),
        cert: fs.readFileSync(config.sslCert)
      };
      server = https.createServer(httpsOptions, app);
    } else {
      server = require('http').createServer(app);
      if (config.env === 'production') {
        console.warn('WARNING: Running in production without HTTPS is not recommended');
      }
    }
    
    // Start listening
    server.listen(config.port, () => {
      console.log(`Hospital Network Management System server running on port ${config.port}`);
      console.log(`Environment: ${config.env}`);
      console.log(`Hospital ID: ${config.hospitalId}`);
      console.log(`API Version: ${config.apiVersion}`);
      console.log(`HTTPS: ${config.useHttps ? 'Enabled' : 'Disabled'}`);
    });
    
    // Handle graceful shutdown
    setupGracefulShutdown(server);
    
    return server;
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Initialize all services
async function initializeServices() {
  try {
    console.log('Initializing services...');
    
    // Initialize message broker for event-driven architecture
    await messageBrokerService.initialize();
    console.log('Message broker service initialized');
    
    // Initialize network service for inter-hospital communication
    await networkService.initialize({
      hospitalId: config.hospitalId,
      hospitalName: config.hospitalName
    });
    console.log('Network service initialized');
    
    // Initialize FHIR service for healthcare data exchange
    await fhirService.initialize();
    console.log('FHIR service initialized');
    
    // Initialize API gateway service
    await apiGatewayService.initialize(app);
    console.log('API gateway service initialized');
    
    // Log system startup
    await auditService.logSystemEvent({
      eventType: 'system_startup',
      status: 'success',
      component: 'server',
      details: {
        hospitalId: config.hospitalId,
        hospitalName: config.hospitalName,
        environment: config.env,
        version: process.env.npm_package_version || '1.0.0'
      }
    });
    
    console.log('All services initialized successfully');
  } catch (error) {
    console.error('Service initialization failed:', error);
    
    // Log initialization failure
    await auditService.logSystemEvent({
      eventType: 'system_startup',
      status: 'error',
      component: 'server',
      details: {
        error: error.message,
        stack: error.stack
      }
    }).catch(console.error);
    
    throw error;
  }
}

// Set up graceful shutdown
function setupGracefulShutdown(server) {
  // Handle process termination signals
  const signals = ['SIGINT', 'SIGTERM', 'SIGQUIT'];
  
  signals.forEach(signal => {
    process.on(signal, async () => {
      console.log(`Received ${signal}, shutting down gracefully...`);
      
      try {
        // Close HTTP server (stop accepting new connections)
        server.close();
        console.log('HTTP server closed');
        
        // Log system shutdown
        await auditService.logSystemEvent({
          eventType: 'system_shutdown',
          status: 'success',
          component: 'server',
          details: {
            signal,
            hospitalId: config.hospitalId
          }
        });
        
        // Shut down services in reverse order
        await apiGatewayService.shutdown();
        console.log('API gateway service shut down');
        
        await fhirService.shutdown();
        console.log('FHIR service shut down');
        
        await networkService.shutdown();
        console.log('Network service shut down');
        
        await messageBrokerService.close();
        console.log('Message broker service shut down');
        
        // Flush audit logs
        await auditService.flush();
        console.log('Audit logs flushed');
        
        console.log('Graceful shutdown completed');
        process.exit(0);
      } catch (error) {
        console.error('Error during shutdown:', error);
        process.exit(1);
      }
    });
  });
}

// Helper function to ensure a directory exists
function ensureDirectoryExists(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
    console.log(`Created directory: ${dirPath}`);
  }
}

// Export for testing
module.exports = {
  app,
  config,
  startServer
};

// Start the server if this file is run directly
if (require.main === module) {
  startServer();
}