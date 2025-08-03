/**
 * Audit Service
 * Implements comprehensive, immutable audit logging for all system operations
 */

const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');

class AuditService {
  constructor() {
    this.config = {
      // Storage configuration
      storageType: process.env.AUDIT_STORAGE_TYPE || 'file', // 'file', 'database', 's3'
      filePath: process.env.AUDIT_FILE_PATH || path.join(process.cwd(), 'audit_logs'),
      rotationInterval: process.env.AUDIT_ROTATION_INTERVAL || 'daily', // 'hourly', 'daily', 'weekly', 'monthly'
      retentionPeriod: parseInt(process.env.AUDIT_RETENTION_PERIOD || '365', 10), // days
      
      // Database configuration (if storageType is 'database')
      dbConnection: process.env.AUDIT_DB_CONNECTION,
      dbTable: process.env.AUDIT_DB_TABLE || 'audit_logs',
      
      // S3 configuration (if storageType is 's3')
      s3Bucket: process.env.AUDIT_S3_BUCKET,
      s3Region: process.env.AUDIT_S3_REGION || 'us-east-1',
      s3Prefix: process.env.AUDIT_S3_PREFIX || 'audit-logs/',
      
      // Security configuration
      signLogs: process.env.AUDIT_SIGN_LOGS === 'true' || true,
      signatureKey: process.env.AUDIT_SIGNATURE_KEY || crypto.randomBytes(32).toString('hex'),
      encryptLogs: process.env.AUDIT_ENCRYPT_LOGS === 'true' || false,
      encryptionKey: process.env.AUDIT_ENCRYPTION_KEY || crypto.randomBytes(32).toString('hex'),
      
      // Performance configuration
      batchSize: parseInt(process.env.AUDIT_BATCH_SIZE || '100', 10),
      flushInterval: parseInt(process.env.AUDIT_FLUSH_INTERVAL || '5000', 10), // ms
      
      // Compliance configuration
      includePatientData: process.env.AUDIT_INCLUDE_PATIENT_DATA === 'true' || false,
      maskSensitiveData: process.env.AUDIT_MASK_SENSITIVE_DATA === 'true' || true,
      sensitiveFields: (process.env.AUDIT_SENSITIVE_FIELDS || 'ssn,creditCard,password').split(','),
      
      // Alerting configuration
      alertOnCritical: process.env.AUDIT_ALERT_ON_CRITICAL === 'true' || true,
      alertEndpoint: process.env.AUDIT_ALERT_ENDPOINT,
      
      // Monitoring configuration
      enableMetrics: process.env.AUDIT_ENABLE_METRICS === 'true' || true,
      metricsPrefix: process.env.AUDIT_METRICS_PREFIX || 'hospital_network.audit'
    };

    // Initialize storage
    this.initializeStorage();
    
    // Batch processing
    this.logBatch = [];
    this.lastFlushTime = Date.now();
    this.flushTimer = null;
    
    // Start flush timer
    this.startFlushTimer();
    
    // Register process exit handler
    process.on('beforeExit', () => {
      this.flush();
    });
  }

  /**
   * Initialize the audit log storage
   */
  initializeStorage() {
    if (this.config.storageType === 'file') {
      // Ensure log directory exists
      if (!fs.existsSync(this.config.filePath)) {
        fs.mkdirSync(this.config.filePath, { recursive: true });
      }
    } else if (this.config.storageType === 'database') {
      // Database initialization would happen here
      console.log('Database audit storage initialized');
    } else if (this.config.storageType === 's3') {
      // S3 initialization would happen here
      console.log('S3 audit storage initialized');
    } else {
      console.warn(`Unknown audit storage type: ${this.config.storageType}, defaulting to file`);
      this.config.storageType = 'file';
      
      // Ensure log directory exists
      if (!fs.existsSync(this.config.filePath)) {
        fs.mkdirSync(this.config.filePath, { recursive: true });
      }
    }
  }

  /**
   * Start the flush timer
   */
  startFlushTimer() {
    this.flushTimer = setInterval(() => {
      if (Date.now() - this.lastFlushTime >= this.config.flushInterval) {
        this.flush();
      }
    }, Math.min(this.config.flushInterval, 1000)); // Check at least every second
  }

  /**
   * Flush the log batch to storage
   */
  async flush() {
    if (this.logBatch.length === 0) {
      return;
    }
    
    const batchToFlush = [...this.logBatch];
    this.logBatch = [];
    this.lastFlushTime = Date.now();
    
    try {
      if (this.config.storageType === 'file') {
        await this.flushToFile(batchToFlush);
      } else if (this.config.storageType === 'database') {
        await this.flushToDatabase(batchToFlush);
      } else if (this.config.storageType === 's3') {
        await this.flushToS3(batchToFlush);
      }
    } catch (error) {
      console.error('Failed to flush audit logs:', error);
      
      // Put the logs back in the batch
      this.logBatch = [...batchToFlush, ...this.logBatch];
      
      // Limit batch size to prevent memory issues
      if (this.logBatch.length > this.config.batchSize * 3) {
        console.error(`Audit log batch size exceeded limit (${this.logBatch.length}), dropping oldest logs`);
        this.logBatch = this.logBatch.slice(-this.config.batchSize * 2);
      }
    }
  }

  /**
   * Flush logs to file
   * @param {Array} logs - Logs to flush
   */
  async flushToFile(logs) {
    const now = new Date();
    const fileName = this.getLogFileName(now);
    const filePath = path.join(this.config.filePath, fileName);
    
    // Process logs
    const processedLogs = logs.map(log => {
      // Add signature if configured
      if (this.config.signLogs) {
        log.signature = this.signLog(log);
      }
      
      // Encrypt if configured
      if (this.config.encryptLogs) {
        return this.encryptLog(log);
      }
      
      return JSON.stringify(log);
    });
    
    // Write to file
    await fs.promises.appendFile(filePath, processedLogs.join('\n') + '\n');
    
    // Clean up old logs
    this.cleanupOldLogs();
  }

  /**
   * Flush logs to database
   * @param {Array} logs - Logs to flush
   */
  async flushToDatabase(logs) {
    // In a real implementation, this would use a database connection
    // to insert the logs into a database table
    console.log(`Would insert ${logs.length} logs into database`);
  }

  /**
   * Flush logs to S3
   * @param {Array} logs - Logs to flush
   */
  async flushToS3(logs) {
    // In a real implementation, this would use the AWS SDK
    // to upload the logs to an S3 bucket
    console.log(`Would upload ${logs.length} logs to S3`);
  }

  /**
   * Get the log file name based on rotation interval
   * @param {Date} date - Date to use for file name
   * @returns {string} - Log file name
   */
  getLogFileName(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hour = String(date.getHours()).padStart(2, '0');
    
    if (this.config.rotationInterval === 'hourly') {
      return `audit-${year}-${month}-${day}-${hour}.log`;
    } else if (this.config.rotationInterval === 'daily') {
      return `audit-${year}-${month}-${day}.log`;
    } else if (this.config.rotationInterval === 'weekly') {
      const weekNumber = this.getWeekNumber(date);
      return `audit-${year}-W${weekNumber}.log`;
    } else if (this.config.rotationInterval === 'monthly') {
      return `audit-${year}-${month}.log`;
    } else {
      return `audit-${year}-${month}-${day}.log`; // Default to daily
    }
  }

  /**
   * Get the week number for a date
   * @param {Date} date - Date to get week number for
   * @returns {number} - Week number
   */
  getWeekNumber(date) {
    const firstDayOfYear = new Date(date.getFullYear(), 0, 1);
    const pastDaysOfYear = (date - firstDayOfYear) / 86400000;
    return Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7);
  }

  /**
   * Clean up old log files
   */
  async cleanupOldLogs() {
    if (this.config.storageType !== 'file') {
      return;
    }
    
    try {
      const files = await fs.promises.readdir(this.config.filePath);
      const now = new Date();
      const cutoffDate = new Date(now.getTime() - this.config.retentionPeriod * 24 * 60 * 60 * 1000);
      
      for (const file of files) {
        if (!file.startsWith('audit-')) {
          continue;
        }
        
        const filePath = path.join(this.config.filePath, file);
        const stats = await fs.promises.stat(filePath);
        
        if (stats.mtime < cutoffDate) {
          await fs.promises.unlink(filePath);
          console.log(`Deleted old audit log: ${file}`);
        }
      }
    } catch (error) {
      console.error('Failed to clean up old audit logs:', error);
    }
  }

  /**
   * Sign a log entry
   * @param {Object} log - Log entry to sign
   * @returns {string} - Signature
   */
  signLog(log) {
    const logString = JSON.stringify(log);
    return crypto
      .createHmac('sha256', this.config.signatureKey)
      .update(logString)
      .digest('hex');
  }

  /**
   * Encrypt a log entry
   * @param {Object} log - Log entry to encrypt
   * @returns {string} - Encrypted log
   */
  encryptLog(log) {
    const logString = JSON.stringify(log);
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(
      'aes-256-cbc',
      Buffer.from(this.config.encryptionKey, 'hex'),
      iv
    );
    
    let encrypted = cipher.update(logString, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    return JSON.stringify({
      iv: iv.toString('hex'),
      encrypted
    });
  }

  /**
   * Decrypt a log entry
   * @param {string} encryptedLog - Encrypted log entry
   * @returns {Object} - Decrypted log
   */
  decryptLog(encryptedLog) {
    const { iv, encrypted } = JSON.parse(encryptedLog);
    const decipher = crypto.createDecipheriv(
      'aes-256-cbc',
      Buffer.from(this.config.encryptionKey, 'hex'),
      Buffer.from(iv, 'hex')
    );
    
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return JSON.parse(decrypted);
  }

  /**
   * Mask sensitive data in a log entry
   * @param {Object} log - Log entry to mask
   * @returns {Object} - Masked log entry
   */
  maskSensitiveData(log) {
    if (!this.config.maskSensitiveData) {
      return log;
    }
    
    const maskedLog = { ...log };
    
    // Mask sensitive fields in details
    if (maskedLog.details) {
      for (const field of this.config.sensitiveFields) {
        if (maskedLog.details[field]) {
          maskedLog.details[field] = this.maskValue(maskedLog.details[field]);
        }
      }
    }
    
    // Mask patient data if configured
    if (!this.config.includePatientData && maskedLog.patientId) {
      maskedLog.patientId = this.maskValue(maskedLog.patientId);
    }
    
    return maskedLog;
  }

  /**
   * Mask a value
   * @param {string} value - Value to mask
   * @returns {string} - Masked value
   */
  maskValue(value) {
    if (typeof value !== 'string') {
      return value;
    }
    
    if (value.length <= 4) {
      return '*'.repeat(value.length);
    }
    
    return value.substring(0, 2) + '*'.repeat(value.length - 4) + value.substring(value.length - 2);
  }

  /**
   * Add a log entry to the batch
   * @param {Object} log - Log entry
   */
  async addLog(log) {
    // Add common fields
    const enrichedLog = {
      ...log,
      id: uuidv4(),
      timestamp: log.timestamp || new Date().toISOString(),
      hostname: require('os').hostname(),
      processId: process.pid
    };
    
    // Mask sensitive data
    const maskedLog = this.maskSensitiveData(enrichedLog);
    
    // Add to batch
    this.logBatch.push(maskedLog);
    
    // Flush if batch is full
    if (this.logBatch.length >= this.config.batchSize) {
      await this.flush();
    }
    
    // Send alert if critical and configured
    if (this.config.alertOnCritical && log.level === 'critical' && this.config.alertEndpoint) {
      this.sendAlert(maskedLog);
    }
    
    // Update metrics if configured
    if (this.config.enableMetrics) {
      this.updateMetrics(maskedLog);
    }
    
    return maskedLog.id;
  }

  /**
   * Send an alert for a critical log
   * @param {Object} log - Log entry
   */
  async sendAlert(log) {
    try {
      // In a real implementation, this would send an alert to a monitoring system
      console.log(`Would send alert for critical log: ${log.id}`);
    } catch (error) {
      console.error('Failed to send alert:', error);
    }
  }

  /**
   * Update metrics for a log
   * @param {Object} log - Log entry
   */
  updateMetrics(log) {
    // In a real implementation, this would update metrics in a monitoring system
    console.log(`Would update metrics for log: ${log.id}`);
  }

  /**
   * Log a user authentication event
   * @param {Object} params - Log parameters
   * @returns {Promise<string>} - Log ID
   */
  async logAuthEvent(params) {
    return this.addLog({
      type: 'auth',
      level: params.status === 'error' ? 'warning' : 'info',
      eventType: params.eventType,
      status: params.status,
      userId: params.userId,
      username: params.username,
      hospitalId: params.hospitalId,
      ipAddress: params.ipAddress,
      userAgent: params.userAgent,
      details: params.details
    });
  }

  /**
   * Log a data access event
   * @param {Object} params - Log parameters
   * @returns {Promise<string>} - Log ID
   */
  async logDataAccess(params) {
    return this.addLog({
      type: 'data_access',
      level: params.status === 'error' ? 'warning' : 'info',
      eventType: params.eventType,
      status: params.status,
      userId: params.userId,
      hospitalId: params.hospitalId,
      patientId: params.patientId,
      resourceType: params.resourceType,
      resourceId: params.resourceId,
      action: params.action,
      reason: params.reason,
      details: params.details
    });
  }

  /**
   * Log a patient consent event
   * @param {Object} params - Log parameters
   * @returns {Promise<string>} - Log ID
   */
  async logConsentEvent(params) {
    return this.addLog({
      type: 'consent',
      level: params.status === 'error' ? 'warning' : 'info',
      eventType: params.eventType,
      status: params.status,
      patientId: params.patientId,
      userId: params.userId,
      hospitalId: params.hospitalId,
      targetHospitalId: params.targetHospitalId,
      consentType: params.consentType,
      consentId: params.consentId,
      action: params.action,
      expiresAt: params.expiresAt,
      details: params.details
    });
  }

  /**
   * Log a cross-hospital access event
   * @param {Object} params - Log parameters
   * @returns {Promise<string>} - Log ID
   */
  async logCrossHospitalAccess(params) {
    return this.addLog({
      type: 'cross_hospital',
      level: params.status === 'error' ? 'warning' : 'info',
      eventType: params.eventType,
      status: params.status,
      sourceHospitalId: params.sourceHospitalId,
      targetHospitalId: params.targetHospitalId,
      userId: params.userId,
      patientId: params.patientId,
      tokenId: params.tokenId,
      resourceType: params.resourceType,
      resourceId: params.resourceId,
      action: params.action,
      details: params.details
    });
  }

  /**
   * Log a medication event
   * @param {Object} params - Log parameters
   * @returns {Promise<string>} - Log ID
   */
  async logMedicationEvent(params) {
    return this.addLog({
      type: 'medication',
      level: params.status === 'error' ? 'warning' : 'info',
      eventType: params.eventType,
      status: params.status,
      userId: params.userId,
      hospitalId: params.hospitalId,
      patientId: params.patientId,
      medicationId: params.medicationId,
      action: params.action,
      details: params.details
    });
  }

  /**
   * Log a document event
   * @param {Object} params - Log parameters
   * @returns {Promise<string>} - Log ID
   */
  async logDocumentEvent(params) {
    return this.addLog({
      type: 'document',
      level: params.status === 'error' ? 'warning' : 'info',
      eventType: params.eventType,
      status: params.status,
      userId: params.userId,
      hospitalId: params.hospitalId,
      patientId: params.patientId,
      documentId: params.documentId,
      documentType: params.documentType,
      action: params.action,
      details: params.details
    });
  }

  /**
   * Log a DICOM operation
   * @param {Object} params - Log parameters
   * @returns {Promise<string>} - Log ID
   */
  async logDicomOperation(params) {
    return this.addLog({
      type: 'dicom',
      level: params.status === 'error' ? 'warning' : 'info',
      eventType: params.operationType,
      status: params.status,
      userId: params.userId,
      hospitalId: params.hospitalId,
      patientId: params.patientId,
      studyInstanceUid: params.studyInstanceUid,
      seriesInstanceUid: params.seriesInstanceUid,
      sopInstanceUid: params.sopInstanceUid,
      details: params.details
    });
  }

  /**
   * Log a message event
   * @param {Object} params - Log parameters
   * @returns {Promise<string>} - Log ID
   */
  async logMessageEvent(params) {
    return this.addLog({
      type: 'message',
      level: params.status === 'error' ? 'warning' : 'info',
      eventType: params.eventType,
      status: params.status,
      topic: params.topic,
      messageId: params.messageId,
      source: params.source,
      subscriptionId: params.subscriptionId,
      details: params.details
    });
  }

  /**
   * Log a system event
   * @param {Object} params - Log parameters
   * @returns {Promise<string>} - Log ID
   */
  async logSystemEvent(params) {
    return this.addLog({
      type: 'system',
      level: params.status === 'error' ? 'warning' : 'info',
      eventType: params.eventType,
      status: params.status,
      hostname: params.hostname,
      component: params.component,
      details: params.details
    });
  }

  /**
   * Log a security event
   * @param {Object} params - Log parameters
   * @returns {Promise<string>} - Log ID
   */
  async logSecurityEvent(params) {
    return this.addLog({
      type: 'security',
      level: params.severity || 'warning',
      eventType: params.eventType,
      status: params.status,
      userId: params.userId,
      hospitalId: params.hospitalId,
      ipAddress: params.ipAddress,
      userAgent: params.userAgent,
      details: params.details
    });
  }

  /**
   * Search audit logs
   * @param {Object} criteria - Search criteria
   * @param {Object} options - Search options
   * @returns {Promise<Object>} - Search results
   */
  async searchLogs(criteria = {}, options = {}) {
    // In a real implementation, this would search the audit logs
    // based on the provided criteria and options
    console.log('Would search audit logs with criteria:', criteria);
    
    return {
      total: 0,
      logs: [],
      page: options.page || 1,
      pageSize: options.pageSize || 20
    };
  }

  /**
   * Get audit log statistics
   * @param {Object} criteria - Filter criteria
   * @returns {Promise<Object>} - Statistics
   */
  async getStatistics(criteria = {}) {
    // In a real implementation, this would calculate statistics
    // based on the audit logs matching the criteria
    console.log('Would calculate audit log statistics with criteria:', criteria);
    
    return {
      totalLogs: 0,
      byType: {},
      byLevel: {},
      byStatus: {},
      byHospital: {},
      byTimeRange: {}
    };
  }

  /**
   * Export audit logs
   * @param {Object} criteria - Filter criteria
   * @param {string} format - Export format ('json', 'csv')
   * @returns {Promise<string>} - Export file path
   */
  async exportLogs(criteria = {}, format = 'json') {
    // In a real implementation, this would export the audit logs
    // matching the criteria to a file in the specified format
    console.log(`Would export audit logs to ${format} with criteria:`, criteria);
    
    return '/path/to/export/file';
  }

  /**
   * Verify the integrity of audit logs
   * @param {Date} startDate - Start date
   * @param {Date} endDate - End date
   * @returns {Promise<Object>} - Verification results
   */
  async verifyIntegrity(startDate, endDate) {
    // In a real implementation, this would verify the integrity of the audit logs
    // by checking signatures and ensuring no logs have been tampered with
    console.log(`Would verify audit log integrity from ${startDate} to ${endDate}`);
    
    return {
      verified: true,
      totalLogs: 0,
      validLogs: 0,
      invalidLogs: 0,
      missingLogs: 0
    };
  }
}

module.exports = new AuditService();