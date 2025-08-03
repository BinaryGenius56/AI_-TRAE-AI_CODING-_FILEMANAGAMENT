/**
 * DICOM Service
 * Implements DICOM protocol for medical imaging exchange
 */

const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');
const axios = require('axios');
const { spawn } = require('child_process');

const auditService = require('./AuditService');

class DicomService {
  constructor() {
    this.config = {
      // DICOM server configuration
      dicomServerUrl: process.env.DICOM_SERVER_URL || 'http://localhost:8042/dicom-web',
      dicomAeTitle: process.env.DICOM_AE_TITLE || 'HOSP_NETWORK',
      dicomPort: parseInt(process.env.DICOM_PORT || '4242', 10),
      dicomStoragePath: process.env.DICOM_STORAGE_PATH || path.join(process.cwd(), 'dicom_storage'),
      dicomTempPath: process.env.DICOM_TEMP_PATH || path.join(process.cwd(), 'dicom_temp'),
      
      // Authentication
      useAuthentication: process.env.DICOM_USE_AUTH === 'true' || false,
      username: process.env.DICOM_USERNAME,
      password: process.env.DICOM_PASSWORD,
      
      // Request configuration
      requestTimeout: parseInt(process.env.DICOM_REQUEST_TIMEOUT || '60000', 10), // 60 seconds
      maxRetries: parseInt(process.env.DICOM_MAX_RETRIES || '3', 10),
      retryDelay: parseInt(process.env.DICOM_RETRY_DELAY || '1000', 10), // 1 second
      
      // External tools
      dcmtkPath: process.env.DCMTK_PATH || '/usr/bin', // Path to DCMTK binaries
      useDcmtk: process.env.USE_DCMTK === 'true' || false,
      
      // Viewer configuration
      viewerUrl: process.env.DICOM_VIEWER_URL || '/dicom-viewer',
      
      // Security
      anonymizeByDefault: process.env.DICOM_ANONYMIZE_DEFAULT === 'true' || false,
      encryptStorage: process.env.DICOM_ENCRYPT_STORAGE === 'true' || false,
      encryptionKey: process.env.DICOM_ENCRYPTION_KEY || crypto.randomBytes(32).toString('hex')
    };

    // Initialize HTTP client for DICOMweb
    this.client = axios.create({
      baseURL: this.config.dicomServerUrl,
      timeout: this.config.requestTimeout,
      headers: {
        'Accept': 'application/dicom+json'
      }
    });

    // Add authentication if configured
    if (this.config.useAuthentication) {
      this.setupAuthentication();
    }

    // Ensure storage directories exist
    this.ensureDirectories();
  }

  /**
   * Setup authentication for DICOM requests
   */
  setupAuthentication() {
    if (this.config.username && this.config.password) {
      const auth = Buffer.from(`${this.config.username}:${this.config.password}`).toString('base64');
      this.client.defaults.headers.common['Authorization'] = `Basic ${auth}`;
    } else {
      console.warn('DICOM authentication configured but no username/password provided');
    }
  }

  /**
   * Ensure required directories exist
   */
  ensureDirectories() {
    try {
      if (!fs.existsSync(this.config.dicomStoragePath)) {
        fs.mkdirSync(this.config.dicomStoragePath, { recursive: true });
        console.log(`Created DICOM storage directory: ${this.config.dicomStoragePath}`);
      }

      if (!fs.existsSync(this.config.dicomTempPath)) {
        fs.mkdirSync(this.config.dicomTempPath, { recursive: true });
        console.log(`Created DICOM temp directory: ${this.config.dicomTempPath}`);
      }
    } catch (error) {
      console.error('Failed to create DICOM directories:', error);
      throw error;
    }
  }

  /**
   * Execute a DICOM request with retries
   * @param {Function} requestFn - Function that returns a promise for the request
   * @param {string} operationType - Type of operation for logging
   * @param {string} studyInstanceUid - Study Instance UID (optional)
   * @param {string} seriesInstanceUid - Series Instance UID (optional)
   * @param {string} sopInstanceUid - SOP Instance UID (optional)
   * @param {Object} user - User making the request (optional)
   * @returns {Promise<Object>} - DICOM response
   */
  async executeWithRetry(requestFn, operationType, studyInstanceUid = null, seriesInstanceUid = null, sopInstanceUid = null, user = null) {
    let lastError = null;
    let attempt = 0;

    while (attempt < this.config.maxRetries) {
      try {
        attempt++;
        const response = await requestFn();

        // Log successful operation to audit service
        if (user) {
          await this.logDicomOperation({
            operationType,
            studyInstanceUid,
            seriesInstanceUid,
            sopInstanceUid,
            status: 'success',
            userId: user.id,
            hospitalId: user.hospitalId,
            details: {
              attempt,
              statusCode: response.status
            }
          });
        }

        return response.data;
      } catch (error) {
        lastError = error;
        
        // Check if we should retry based on error type
        const shouldRetry = this.shouldRetryRequest(error);
        if (!shouldRetry || attempt >= this.config.maxRetries) {
          break;
        }

        // Wait before retrying
        const delay = this.config.retryDelay * Math.pow(2, attempt - 1); // Exponential backoff
        console.log(`Retrying DICOM ${operationType} (attempt ${attempt}/${this.config.maxRetries}) after ${delay}ms`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    // Log failed operation to audit service
    if (user) {
      await this.logDicomOperation({
        operationType,
        studyInstanceUid,
        seriesInstanceUid,
        sopInstanceUid,
        status: 'error',
        userId: user.id,
        hospitalId: user.hospitalId,
        details: {
          attempts: attempt,
          errorMessage: lastError.message,
          statusCode: lastError.response?.status || 0
        }
      });
    }

    throw lastError;
  }

  /**
   * Determine if a request should be retried based on the error
   * @param {Error} error - Axios error
   * @returns {boolean} - Whether to retry the request
   */
  shouldRetryRequest(error) {
    // Retry on network errors
    if (!error.response) {
      return true;
    }

    // Retry on 5xx server errors
    if (error.response.status >= 500 && error.response.status < 600) {
      return true;
    }

    // Retry on 429 Too Many Requests
    if (error.response.status === 429) {
      return true;
    }

    // Don't retry on 4xx client errors (except 429)
    return false;
  }

  /**
   * Log DICOM operation to audit service
   * @param {Object} params - Log parameters
   */
  async logDicomOperation(params) {
    try {
      await auditService.logDicomOperation({
        ...params,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Failed to log DICOM operation:', error);
    }
  }

  /**
   * Search for DICOM studies
   * @param {Object} searchParams - Search parameters
   * @param {Object} user - User making the request
   * @returns {Promise<Array>} - Array of DICOM studies
   */
  async searchStudies(searchParams = {}, user = null) {
    return this.executeWithRetry(
      () => this.client.get('/studies', { params: searchParams }),
      'search_studies',
      null,
      null,
      null,
      user
    );
  }

  /**
   * Get a specific DICOM study
   * @param {string} studyInstanceUid - Study Instance UID
   * @param {Object} user - User making the request
   * @returns {Promise<Object>} - DICOM study metadata
   */
  async getStudy(studyInstanceUid, user = null) {
    return this.executeWithRetry(
      () => this.client.get(`/studies/${studyInstanceUid}`),
      'get_study',
      studyInstanceUid,
      null,
      null,
      user
    );
  }

  /**
   * Get series in a study
   * @param {string} studyInstanceUid - Study Instance UID
   * @param {Object} user - User making the request
   * @returns {Promise<Array>} - Array of DICOM series
   */
  async getStudySeries(studyInstanceUid, user = null) {
    return this.executeWithRetry(
      () => this.client.get(`/studies/${studyInstanceUid}/series`),
      'get_study_series',
      studyInstanceUid,
      null,
      null,
      user
    );
  }

  /**
   * Get instances in a series
   * @param {string} studyInstanceUid - Study Instance UID
   * @param {string} seriesInstanceUid - Series Instance UID
   * @param {Object} user - User making the request
   * @returns {Promise<Array>} - Array of DICOM instances
   */
  async getSeriesInstances(studyInstanceUid, seriesInstanceUid, user = null) {
    return this.executeWithRetry(
      () => this.client.get(`/studies/${studyInstanceUid}/series/${seriesInstanceUid}/instances`),
      'get_series_instances',
      studyInstanceUid,
      seriesInstanceUid,
      null,
      user
    );
  }

  /**
   * Get a specific DICOM instance
   * @param {string} studyInstanceUid - Study Instance UID
   * @param {string} seriesInstanceUid - Series Instance UID
   * @param {string} sopInstanceUid - SOP Instance UID
   * @param {Object} user - User making the request
   * @returns {Promise<Object>} - DICOM instance metadata
   */
  async getInstance(studyInstanceUid, seriesInstanceUid, sopInstanceUid, user = null) {
    return this.executeWithRetry(
      () => this.client.get(`/studies/${studyInstanceUid}/series/${seriesInstanceUid}/instances/${sopInstanceUid}`),
      'get_instance',
      studyInstanceUid,
      seriesInstanceUid,
      sopInstanceUid,
      user
    );
  }

  /**
   * Download a DICOM instance
   * @param {string} studyInstanceUid - Study Instance UID
   * @param {string} seriesInstanceUid - Series Instance UID
   * @param {string} sopInstanceUid - SOP Instance UID
   * @param {string} outputPath - Path to save the DICOM file
   * @param {Object} user - User making the request
   * @returns {Promise<string>} - Path to downloaded file
   */
  async downloadInstance(studyInstanceUid, seriesInstanceUid, sopInstanceUid, outputPath = null, user = null) {
    try {
      // Set default output path if not provided
      if (!outputPath) {
        const filename = `${sopInstanceUid}.dcm`;
        outputPath = path.join(this.config.dicomStoragePath, studyInstanceUid, seriesInstanceUid, filename);
      }

      // Ensure directory exists
      const dir = path.dirname(outputPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      // Download the DICOM file
      const response = await this.client.get(
        `/studies/${studyInstanceUid}/series/${seriesInstanceUid}/instances/${sopInstanceUid}`,
        {
          headers: {
            'Accept': 'application/dicom'
          },
          responseType: 'arraybuffer'
        }
      );

      // Write the file
      let fileData = Buffer.from(response.data);
      
      // Encrypt if configured
      if (this.config.encryptStorage) {
        fileData = this.encryptData(fileData);
      }
      
      fs.writeFileSync(outputPath, fileData);

      // Log the operation
      if (user) {
        await this.logDicomOperation({
          operationType: 'download_instance',
          studyInstanceUid,
          seriesInstanceUid,
          sopInstanceUid,
          status: 'success',
          userId: user.id,
          hospitalId: user.hospitalId,
          details: {
            filePath: outputPath,
            fileSize: fileData.length
          }
        });
      }

      return outputPath;
    } catch (error) {
      console.error('Failed to download DICOM instance:', error);
      
      // Log the error
      if (user) {
        await this.logDicomOperation({
          operationType: 'download_instance',
          studyInstanceUid,
          seriesInstanceUid,
          sopInstanceUid,
          status: 'error',
          userId: user.id,
          hospitalId: user.hospitalId,
          details: {
            errorMessage: error.message
          }
        });
      }
      
      throw error;
    }
  }

  /**
   * Upload a DICOM file
   * @param {string} filePath - Path to the DICOM file
   * @param {Object} user - User making the request
   * @returns {Promise<Object>} - Upload response
   */
  async uploadDicomFile(filePath, user = null) {
    try {
      // Read the file
      let fileData = fs.readFileSync(filePath);
      
      // Decrypt if encrypted
      if (this.config.encryptStorage && this.isEncrypted(fileData)) {
        fileData = this.decryptData(fileData);
      }
      
      // Extract DICOM metadata using DCMTK if available
      let metadata = null;
      if (this.config.useDcmtk) {
        metadata = await this.extractDicomMetadata(filePath);
      }

      // Anonymize if configured
      if (this.config.anonymizeByDefault) {
        fileData = await this.anonymizeDicom(fileData);
      }

      // Upload the file
      const response = await this.client.post('/studies', fileData, {
        headers: {
          'Content-Type': 'application/dicom'
        }
      });

      // Extract UIDs from metadata or response
      const studyInstanceUid = metadata?.studyInstanceUid || 'unknown';
      const seriesInstanceUid = metadata?.seriesInstanceUid || 'unknown';
      const sopInstanceUid = metadata?.sopInstanceUid || 'unknown';

      // Log the operation
      if (user) {
        await this.logDicomOperation({
          operationType: 'upload_file',
          studyInstanceUid,
          seriesInstanceUid,
          sopInstanceUid,
          status: 'success',
          userId: user.id,
          hospitalId: user.hospitalId,
          details: {
            filePath,
            fileSize: fileData.length,
            anonymized: this.config.anonymizeByDefault
          }
        });
      }

      return {
        status: 'success',
        statusCode: response.status,
        studyInstanceUid,
        seriesInstanceUid,
        sopInstanceUid
      };
    } catch (error) {
      console.error('Failed to upload DICOM file:', error);
      
      // Log the error
      if (user) {
        await this.logDicomOperation({
          operationType: 'upload_file',
          status: 'error',
          userId: user.id,
          hospitalId: user.hospitalId,
          details: {
            filePath,
            errorMessage: error.message
          }
        });
      }
      
      throw error;
    }
  }

  /**
   * Extract metadata from a DICOM file using DCMTK
   * @param {string} filePath - Path to the DICOM file
   * @returns {Promise<Object>} - DICOM metadata
   */
  async extractDicomMetadata(filePath) {
    return new Promise((resolve, reject) => {
      // Use dcmdump from DCMTK to extract metadata
      const dcmdump = path.join(this.config.dcmtkPath, 'dcmdump');
      const args = ['--print-all', filePath];
      
      const process = spawn(dcmdump, args);
      let stdout = '';
      let stderr = '';
      
      process.stdout.on('data', (data) => {
        stdout += data.toString();
      });
      
      process.stderr.on('data', (data) => {
        stderr += data.toString();
      });
      
      process.on('close', (code) => {
        if (code !== 0) {
          console.error(`dcmdump exited with code ${code}`);
          console.error(`stderr: ${stderr}`);
          reject(new Error(`Failed to extract DICOM metadata: ${stderr}`));
          return;
        }
        
        // Parse the output to extract key metadata
        const metadata = {};
        
        // Extract Study Instance UID
        const studyUidMatch = stdout.match(/\(0020,000d\) UI \[([^\]]+)\]/);
        if (studyUidMatch) {
          metadata.studyInstanceUid = studyUidMatch[1];
        }
        
        // Extract Series Instance UID
        const seriesUidMatch = stdout.match(/\(0020,000e\) UI \[([^\]]+)\]/);
        if (seriesUidMatch) {
          metadata.seriesInstanceUid = seriesUidMatch[1];
        }
        
        // Extract SOP Instance UID
        const sopUidMatch = stdout.match(/\(0008,0018\) UI \[([^\]]+)\]/);
        if (sopUidMatch) {
          metadata.sopInstanceUid = sopUidMatch[1];
        }
        
        // Extract Modality
        const modalityMatch = stdout.match(/\(0008,0060\) CS \[([^\]]+)\]/);
        if (modalityMatch) {
          metadata.modality = modalityMatch[1];
        }
        
        // Extract Patient Name
        const patientNameMatch = stdout.match(/\(0010,0010\) PN \[([^\]]+)\]/);
        if (patientNameMatch) {
          metadata.patientName = patientNameMatch[1];
        }
        
        // Extract Patient ID
        const patientIdMatch = stdout.match(/\(0010,0020\) LO \[([^\]]+)\]/);
        if (patientIdMatch) {
          metadata.patientId = patientIdMatch[1];
        }
        
        // Extract Study Date
        const studyDateMatch = stdout.match(/\(0008,0020\) DA \[([^\]]+)\]/);
        if (studyDateMatch) {
          metadata.studyDate = studyDateMatch[1];
        }
        
        resolve(metadata);
      });
    });
  }

  /**
   * Anonymize a DICOM file
   * @param {Buffer} dicomData - DICOM file data
   * @returns {Promise<Buffer>} - Anonymized DICOM data
   */
  async anonymizeDicom(dicomData) {
    // In a real implementation, this would use DCMTK's dcmodify or similar tool
    // to remove or replace patient identifying information
    
    // For this example, we'll just return the original data
    // with a note that it would be anonymized in a real implementation
    console.log('DICOM anonymization would be performed here in a real implementation');
    return dicomData;
  }

  /**
   * Encrypt data
   * @param {Buffer} data - Data to encrypt
   * @returns {Buffer} - Encrypted data
   */
  encryptData(data) {
    try {
      const iv = crypto.randomBytes(16);
      const key = Buffer.from(this.config.encryptionKey, 'hex');
      const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
      
      const encrypted = Buffer.concat([iv, cipher.update(data), cipher.final()]);
      return encrypted;
    } catch (error) {
      console.error('Failed to encrypt data:', error);
      throw error;
    }
  }

  /**
   * Decrypt data
   * @param {Buffer} encryptedData - Encrypted data
   * @returns {Buffer} - Decrypted data
   */
  decryptData(encryptedData) {
    try {
      const iv = encryptedData.slice(0, 16);
      const data = encryptedData.slice(16);
      const key = Buffer.from(this.config.encryptionKey, 'hex');
      const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
      
      const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
      return decrypted;
    } catch (error) {
      console.error('Failed to decrypt data:', error);
      throw error;
    }
  }

  /**
   * Check if data is encrypted
   * @param {Buffer} data - Data to check
   * @returns {boolean} - Whether data is encrypted
   */
  isEncrypted(data) {
    // In a real implementation, this would check for encryption markers
    // For this example, we'll assume data longer than 16 bytes might be encrypted
    return data.length > 16;
  }

  /**
   * Get a URL for viewing a DICOM study
   * @param {string} studyInstanceUid - Study Instance UID
   * @returns {string} - Viewer URL
   */
  getViewerUrl(studyInstanceUid) {
    return `${this.config.viewerUrl}?studyInstanceUid=${encodeURIComponent(studyInstanceUid)}`;
  }

  /**
   * Delete a DICOM study
   * @param {string} studyInstanceUid - Study Instance UID
   * @param {Object} user - User making the request
   * @returns {Promise<Object>} - Delete response
   */
  async deleteStudy(studyInstanceUid, user = null) {
    return this.executeWithRetry(
      () => this.client.delete(`/studies/${studyInstanceUid}`),
      'delete_study',
      studyInstanceUid,
      null,
      null,
      user
    );
  }

  /**
   * Delete a DICOM series
   * @param {string} studyInstanceUid - Study Instance UID
   * @param {string} seriesInstanceUid - Series Instance UID
   * @param {Object} user - User making the request
   * @returns {Promise<Object>} - Delete response
   */
  async deleteSeries(studyInstanceUid, seriesInstanceUid, user = null) {
    return this.executeWithRetry(
      () => this.client.delete(`/studies/${studyInstanceUid}/series/${seriesInstanceUid}`),
      'delete_series',
      studyInstanceUid,
      seriesInstanceUid,
      null,
      user
    );
  }

  /**
   * Delete a DICOM instance
   * @param {string} studyInstanceUid - Study Instance UID
   * @param {string} seriesInstanceUid - Series Instance UID
   * @param {string} sopInstanceUid - SOP Instance UID
   * @param {Object} user - User making the request
   * @returns {Promise<Object>} - Delete response
   */
  async deleteInstance(studyInstanceUid, seriesInstanceUid, sopInstanceUid, user = null) {
    return this.executeWithRetry(
      () => this.client.delete(`/studies/${studyInstanceUid}/series/${seriesInstanceUid}/instances/${sopInstanceUid}`),
      'delete_instance',
      studyInstanceUid,
      seriesInstanceUid,
      sopInstanceUid,
      user
    );
  }

  /**
   * Get DICOM server status
   * @returns {Promise<Object>} - Server status
   */
  async getServerStatus() {
    try {
      const response = await this.client.get('/');
      return {
        status: 'online',
        version: response.headers['server'] || 'unknown',
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('Failed to get DICOM server status:', error);
      return {
        status: 'offline',
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Convert a DICOM study to a structured object for the frontend
   * @param {Object} dicomStudy - DICOM study metadata
   * @returns {Object} - Structured study object
   */
  formatStudyForFrontend(dicomStudy) {
    // Extract relevant fields from the DICOM study metadata
    const study = {
      studyInstanceUid: this.getTagValue(dicomStudy, '0020000D'),
      studyDate: this.formatDicomDate(this.getTagValue(dicomStudy, '00080020')),
      studyTime: this.formatDicomTime(this.getTagValue(dicomStudy, '00080030')),
      studyDescription: this.getTagValue(dicomStudy, '00081030'),
      patientName: this.getTagValue(dicomStudy, '00100010'),
      patientId: this.getTagValue(dicomStudy, '00100020'),
      patientBirthDate: this.formatDicomDate(this.getTagValue(dicomStudy, '00100030')),
      patientSex: this.getTagValue(dicomStudy, '00100040'),
      accessionNumber: this.getTagValue(dicomStudy, '00080050'),
      referringPhysician: this.getTagValue(dicomStudy, '00080090'),
      numberOfSeries: parseInt(this.getTagValue(dicomStudy, '00201206') || '0', 10),
      numberOfInstances: parseInt(this.getTagValue(dicomStudy, '00201208') || '0', 10),
      modalities: this.getTagValue(dicomStudy, '00080061')?.split('\\') || [],
      viewerUrl: this.getViewerUrl(this.getTagValue(dicomStudy, '0020000D'))
    };

    return study;
  }

  /**
   * Get a tag value from DICOM metadata
   * @param {Object} dicomObject - DICOM metadata object
   * @param {string} tag - DICOM tag (without parentheses or commas)
   * @returns {string|null} - Tag value or null if not found
   */
  getTagValue(dicomObject, tag) {
    if (!dicomObject || !tag) return null;
    
    // Format tag for lookup
    const formattedTag = tag.replace(/[^0-9A-Fa-f]/g, '').toUpperCase();
    
    // Check if tag exists in the object
    if (dicomObject[formattedTag] && dicomObject[formattedTag].Value && dicomObject[formattedTag].Value.length > 0) {
      return dicomObject[formattedTag].Value[0];
    }
    
    return null;
  }

  /**
   * Format a DICOM date (YYYYMMDD) to ISO format (YYYY-MM-DD)
   * @param {string} dicomDate - DICOM date string
   * @returns {string} - Formatted date or original string if invalid
   */
  formatDicomDate(dicomDate) {
    if (!dicomDate || dicomDate.length !== 8) return dicomDate;
    
    try {
      const year = dicomDate.substring(0, 4);
      const month = dicomDate.substring(4, 6);
      const day = dicomDate.substring(6, 8);
      return `${year}-${month}-${day}`;
    } catch (error) {
      return dicomDate;
    }
  }

  /**
   * Format a DICOM time (HHMMSS.FFFFFF) to HH:MM:SS format
   * @param {string} dicomTime - DICOM time string
   * @returns {string} - Formatted time or original string if invalid
   */
  formatDicomTime(dicomTime) {
    if (!dicomTime || dicomTime.length < 6) return dicomTime;
    
    try {
      const hour = dicomTime.substring(0, 2);
      const minute = dicomTime.substring(2, 4);
      const second = dicomTime.substring(4, 6);
      return `${hour}:${minute}:${second}`;
    } catch (error) {
      return dicomTime;
    }
  }
}

module.exports = new DicomService();