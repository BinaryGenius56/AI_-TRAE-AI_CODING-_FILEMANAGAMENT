/**
 * Hospital Network Management System
 * Main application entry point
 */

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const compression = require('compression');
const path = require('path');
const fs = require('fs');
const https = require('https');
const config = require('./config/config');
const ApiGatewayService = require('./services/ApiGatewayService');
const NetworkService = require('./services/NetworkService');
const AuditService = require('./services/AuditService');

// Initialize Express app
const app = express();

// Security middleware
app.use(helmet());
app.use(cors({
  origin: config.corsOrigins || '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key', 'X-Hospital-ID'],
  exposedHeaders: ['Content-Disposition', 'X-Total-Count'],
  credentials: true,
  maxAge: 86400 // 24 hours
}));

// Request logging
if (config.env === 'production') {
  // Create logs directory if it doesn't exist
  const logsDir = path.join(__dirname, '../logs');
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
  }
  
  // Create write stream for access logs
  const accessLogStream = fs.createWriteStream(
    path.join(logsDir, 'access.log'),
    { flags: 'a' }
  );
  
  // Use combined format for production
  app.use(morgan('combined', { stream: accessLogStream }));
} else {
  // Use dev format for development
  app.use(morgan('dev'));
}

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Compression middleware
app.use(compression());

// Global rate limiting
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: config.rateLimit.global.max || 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later',
  standardHeaders: true,
  legacyHeaders: false
});
app.use(globalLimiter);

// Initialize API Gateway
const apiGateway = new ApiGatewayService(app);

// Initialize Network Service
const networkService = new NetworkService();

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: config.version || '1.0.0',
    environment: config.env
  });
});

// Load controllers
const patientController = require('./controllers/PatientController');
const hospitalController = require('./controllers/HospitalController');
const documentController = require('./controllers/DocumentController');
const medicationController = require('./controllers/MedicationController');
const crossHospitalController = require('./controllers/CrossHospitalController');
const consentController = require('./controllers/ConsentController');
const fhirController = require('./controllers/FhirController');
const dicomController = require('./controllers/DicomController');

// Register API routes
app.use('/api/patients', patientController);
app.use('/api/hospitals', hospitalController);
app.use('/api/documents', documentController);
app.use('/api/medications', medicationController);
app.use('/api/cross-hospital', crossHospitalController);
app.use('/api/consents', consentController);
app.use('/api/fhir', fhirController);
app.use('/api/dicom', dicomController);

// Error handling middleware
app.use((req, res, next) => {
  res.status(404).json({
    success: false,
    error: 'Resource not found'
  });
});

app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  
  // Log error to audit service
  AuditService.logSystemEvent({
    event_type: 'system_error',
    error_message: err.message,
    error_stack: err.stack,
    request_path: req.path,
    request_method: req.method,
    success: false
  });
  
  res.status(err.status || 500).json({
    success: false,
    error: config.env === 'production' ? 'Internal server error' : err.message
  });
});

// Start server
const startServer = async () => {
  try {
    // Initialize network service
    await networkService.initialize();
    console.log('Network service initialized successfully');
    
    // Start HTTP or HTTPS server
    let server;
    
    if (config.ssl.enabled) {
      // HTTPS server
      const sslOptions = {
        key: fs.readFileSync(config.ssl.keyPath),
        cert: fs.readFileSync(config.ssl.certPath),
        ca: config.ssl.caPath ? fs.readFileSync(config.ssl.caPath) : undefined,
        requestCert: config.ssl.requestClientCert || false,
        rejectUnauthorized: config.ssl.rejectUnauthorized || false
      };
      
      server = https.createServer(sslOptions, app);
      console.log('Created HTTPS server with SSL');
    } else {
      // HTTP server (not recommended for production)
      server = app;
      console.warn('WARNING: Running in HTTP mode. This is not recommended for production.');
    }
    
    // Start listening
    const port = config.port || 3000;
    server.listen(port, () => {
      console.log(`Server running on port ${port} in ${config.env} mode`);
      
      // Log server start
      AuditService.logSystemEvent({
        event_type: 'server_start',
        port,
        environment: config.env,
        success: true
      });
    });
    
    // Handle server shutdown
    const gracefulShutdown = async () => {
      console.log('Received shutdown signal, closing connections...');
      
      // Disconnect from network
      await networkService.shutdown();
      
      // Log server shutdown
      AuditService.logSystemEvent({
        event_type: 'server_shutdown',
        success: true
      });
      
      // Close server
      server.close(() => {
        console.log('Server shut down successfully');
        process.exit(0);
      });
      
      // Force exit after timeout
      setTimeout(() => {
        console.error('Could not close connections in time, forcefully shutting down');
        process.exit(1);
      }, 10000);
    };
    
    // Listen for shutdown signals
    process.on('SIGTERM', gracefulShutdown);
    process.on('SIGINT', gracefulShutdown);
    
    return server;
  } catch (error) {
    console.error('Failed to start server:', error);
    
    // Log server start failure
    AuditService.logSystemEvent({
      event_type: 'server_start_failure',
      error_message: error.message,
      error_stack: error.stack,
      success: false
    });
    
    process.exit(1);
  }
};

// Export for testing
module.exports = {
  app,
  startServer
};

// Start server if this file is run directly
if (require.main === module) {
  startServer();
}