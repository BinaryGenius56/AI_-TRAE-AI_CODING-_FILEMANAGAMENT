/**
 * Configuration module for the Hospital Network Management System
 * Loads environment variables and provides configuration settings
 */

const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');

// Load environment variables from .env file
dotenv.config();

// Default configuration values
const defaults = {
  // Server configuration
  port: 3000,
  nodeEnv: 'development',
  apiVersion: 'v1',
  hospitalId: 'hospital-1',
  hospitalName: 'General Hospital',
  corsOrigins: 'http://localhost:3000,http://localhost:3001',
  trustProxy: false,

  // Security configuration
  useHttps: false,
  sslCertPath: './certs/server.crt',
  sslKeyPath: './certs/server.key',
  jwtSecret: 'default_jwt_secret_do_not_use_in_production',
  jwtExpiration: '8h',
  refreshTokenSecret: 'default_refresh_token_secret_do_not_use_in_production',
  refreshTokenExpiration: '7d',
  passwordSaltRounds: 10,

  // Rate limiting
  rateLimitMax: 100,
  rateLimitWindowMs: 900000, // 15 minutes

  // File upload configuration
  maxUploadSize: '50mb',
  uploadDirectory: './uploads',

  // Logging configuration
  logFormat: 'combined',
  logDirectory: './logs',

  // Database configuration
  dbHost: 'localhost',
  dbPort: 5432,
  dbName: 'hospital_network',
  dbUser: 'postgres',
  dbPassword: 'postgres',
  dbSsl: false,
  dbPoolMin: 2,
  dbPoolMax: 10,

  // Audit service configuration
  auditStorageType: 'file',
  auditFilePath: './audit_logs',
  auditRotationInterval: 'daily',
  auditRetentionPeriod: 365,
  auditSignLogs: true,
  auditEncryptLogs: false,
  auditMaskSensitiveData: true,

  // Message broker configuration
  messageBrokerType: 'rabbitmq',
  rabbitmqUrl: 'amqp://localhost:5672',
  rabbitmqExchange: 'hospital-network-exchange',
  rabbitmqQueue: 'hospital-network-queue',
  messageEncryption: false,

  // FHIR service configuration
  fhirServerUrl: 'http://localhost:8080/fhir',
  fhirVersion: 'R4',
  fhirUseAuth: false,
  fhirUsername: '',
  fhirPassword: '',

  // DICOM service configuration
  dicomServerUrl: 'http://localhost:8042/dicom-web',
  dicomAeTitle: 'HOSP_NETWORK',
  dicomPort: 4242,
  dicomStoragePath: './dicom_storage',
  dicomUseAuth: false,
  dicomAnonymizeDefault: false,

  // Network service configuration
  networkPort: 3001,
  networkHeartbeatInterval: 30000, // 30 seconds
  networkDiscoveryInterval: 300000, // 5 minutes
  networkRegistryUrl: 'http://localhost:3002/registry',

  // API gateway configuration
  gatewayTimeout: 30000, // 30 seconds
  gatewayMaxRedirects: 5,
  gatewayRetryCount: 3,
  gatewayRetryDelay: 1000, // 1 second

  // Cross-hospital configuration
  crossHospitalTokenExpiration: '1h',
  crossHospitalMaxRequests: 1000,

  // AI service configuration
  aiModelPath: './models',
  aiOcrConfidenceThreshold: 0.8,
  aiAnomalyThreshold: 0.7,
};

/**
 * Configuration object with environment variables and defaults
 */
const config = {
  // Server configuration
  port: process.env.PORT || defaults.port,
  nodeEnv: process.env.NODE_ENV || defaults.nodeEnv,
  apiVersion: process.env.API_VERSION || defaults.apiVersion,
  hospitalId: process.env.HOSPITAL_ID || defaults.hospitalId,
  hospitalName: process.env.HOSPITAL_NAME || defaults.hospitalName,
  corsOrigins: process.env.CORS_ORIGINS ? process.env.CORS_ORIGINS.split(',') : defaults.corsOrigins.split(','),
  trustProxy: process.env.TRUST_PROXY === 'true' || defaults.trustProxy,

  // Security configuration
  useHttps: process.env.USE_HTTPS === 'true' || defaults.useHttps,
  sslCertPath: process.env.SSL_CERT_PATH || defaults.sslCertPath,
  sslKeyPath: process.env.SSL_KEY_PATH || defaults.sslKeyPath,
  jwtSecret: process.env.JWT_SECRET || defaults.jwtSecret,
  jwtExpiration: process.env.JWT_EXPIRATION || defaults.jwtExpiration,
  refreshTokenSecret: process.env.REFRESH_TOKEN_SECRET || defaults.refreshTokenSecret,
  refreshTokenExpiration: process.env.REFRESH_TOKEN_EXPIRATION || defaults.refreshTokenExpiration,
  passwordSaltRounds: parseInt(process.env.PASSWORD_SALT_ROUNDS || defaults.passwordSaltRounds, 10),

  // Rate limiting
  rateLimitMax: parseInt(process.env.RATE_LIMIT_MAX || defaults.rateLimitMax, 10),
  rateLimitWindowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || defaults.rateLimitWindowMs, 10),

  // File upload configuration
  maxUploadSize: process.env.MAX_UPLOAD_SIZE || defaults.maxUploadSize,
  uploadDirectory: process.env.UPLOAD_DIRECTORY || defaults.uploadDirectory,

  // Logging configuration
  logFormat: process.env.LOG_FORMAT || defaults.logFormat,
  logDirectory: process.env.LOG_DIRECTORY || defaults.logDirectory,

  // Database configuration
  db: {
    host: process.env.DB_HOST || defaults.dbHost,
    port: parseInt(process.env.DB_PORT || defaults.dbPort, 10),
    database: process.env.DB_NAME || defaults.dbName,
    user: process.env.DB_USER || defaults.dbUser,
    password: process.env.DB_PASSWORD || defaults.dbPassword,
    ssl: process.env.DB_SSL === 'true' || defaults.dbSsl,
    pool: {
      min: parseInt(process.env.DB_POOL_MIN || defaults.dbPoolMin, 10),
      max: parseInt(process.env.DB_POOL_MAX || defaults.dbPoolMax, 10),
    },
  },

  // Audit service configuration
  audit: {
    storageType: process.env.AUDIT_STORAGE_TYPE || defaults.auditStorageType,
    filePath: process.env.AUDIT_FILE_PATH || defaults.auditFilePath,
    rotationInterval: process.env.AUDIT_ROTATION_INTERVAL || defaults.auditRotationInterval,
    retentionPeriod: parseInt(process.env.AUDIT_RETENTION_PERIOD || defaults.auditRetentionPeriod, 10),
    signLogs: process.env.AUDIT_SIGN_LOGS === 'true' || defaults.auditSignLogs,
    encryptLogs: process.env.AUDIT_ENCRYPT_LOGS === 'true' || defaults.auditEncryptLogs,
    maskSensitiveData: process.env.AUDIT_MASK_SENSITIVE_DATA === 'true' || defaults.auditMaskSensitiveData,
  },

  // Message broker configuration
  messageBroker: {
    type: process.env.MESSAGE_BROKER_TYPE || defaults.messageBrokerType,
    rabbitmq: {
      url: process.env.RABBITMQ_URL || defaults.rabbitmqUrl,
      exchange: process.env.RABBITMQ_EXCHANGE || defaults.rabbitmqExchange,
      queue: process.env.RABBITMQ_QUEUE || defaults.rabbitmqQueue,
    },
    encryption: process.env.MESSAGE_ENCRYPTION === 'true' || defaults.messageEncryption,
  },

  // FHIR service configuration
  fhir: {
    serverUrl: process.env.FHIR_SERVER_URL || defaults.fhirServerUrl,
    version: process.env.FHIR_VERSION || defaults.fhirVersion,
    useAuth: process.env.FHIR_USE_AUTH === 'true' || defaults.fhirUseAuth,
    username: process.env.FHIR_USERNAME || defaults.fhirUsername,
    password: process.env.FHIR_PASSWORD || defaults.fhirPassword,
  },

  // DICOM service configuration
  dicom: {
    serverUrl: process.env.DICOM_SERVER_URL || defaults.dicomServerUrl,
    aeTitle: process.env.DICOM_AE_TITLE || defaults.dicomAeTitle,
    port: parseInt(process.env.DICOM_PORT || defaults.dicomPort, 10),
    storagePath: process.env.DICOM_STORAGE_PATH || defaults.dicomStoragePath,
    useAuth: process.env.DICOM_USE_AUTH === 'true' || defaults.dicomUseAuth,
    anonymizeDefault: process.env.DICOM_ANONYMIZE_DEFAULT === 'true' || defaults.dicomAnonymizeDefault,
  },

  // Network service configuration
  network: {
    port: parseInt(process.env.NETWORK_PORT || defaults.networkPort, 10),
    heartbeatInterval: parseInt(process.env.NETWORK_HEARTBEAT_INTERVAL || defaults.networkHeartbeatInterval, 10),
    discoveryInterval: parseInt(process.env.NETWORK_DISCOVERY_INTERVAL || defaults.networkDiscoveryInterval, 10),
    registryUrl: process.env.NETWORK_REGISTRY_URL || defaults.networkRegistryUrl,
  },

  // API gateway configuration
  gateway: {
    timeout: parseInt(process.env.GATEWAY_TIMEOUT || defaults.gatewayTimeout, 10),
    maxRedirects: parseInt(process.env.GATEWAY_MAX_REDIRECTS || defaults.gatewayMaxRedirects, 10),
    retryCount: parseInt(process.env.GATEWAY_RETRY_COUNT || defaults.gatewayRetryCount, 10),
    retryDelay: parseInt(process.env.GATEWAY_RETRY_DELAY || defaults.gatewayRetryDelay, 10),
  },

  // Cross-hospital configuration
  crossHospital: {
    tokenExpiration: process.env.CROSS_HOSPITAL_TOKEN_EXPIRATION || defaults.crossHospitalTokenExpiration,
    maxRequests: parseInt(process.env.CROSS_HOSPITAL_MAX_REQUESTS || defaults.crossHospitalMaxRequests, 10),
  },

  // AI service configuration
  ai: {
    modelPath: process.env.AI_MODEL_PATH || defaults.aiModelPath,
    ocrConfidenceThreshold: parseFloat(process.env.AI_OCR_CONFIDENCE_THRESHOLD || defaults.aiOcrConfidenceThreshold),
    anomalyThreshold: parseFloat(process.env.AI_ANOMALY_THRESHOLD || defaults.aiAnomalyThreshold),
  },

  /**
   * Check if the application is running in production mode
   * @returns {boolean} True if in production mode
   */
  isProduction() {
    return this.nodeEnv === 'production';
  },

  /**
   * Check if the application is running in development mode
   * @returns {boolean} True if in development mode
   */
  isDevelopment() {
    return this.nodeEnv === 'development';
  },

  /**
   * Check if the application is running in test mode
   * @returns {boolean} True if in test mode
   */
  isTest() {
    return this.nodeEnv === 'test';
  },

  /**
   * Get SSL options for HTTPS server
   * @returns {Object|null} SSL options or null if HTTPS is disabled
   */
  getSSLOptions() {
    if (!this.useHttps) {
      return null;
    }

    try {
      return {
        cert: fs.readFileSync(this.sslCertPath),
        key: fs.readFileSync(this.sslKeyPath),
      };
    } catch (error) {
      console.error('Error loading SSL certificates:', error.message);
      return null;
    }
  },
};

module.exports = config;