/**
 * Cross-Hospital Service
 * Handles secure record sharing between hospitals in the network
 */

const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const axios = require('axios');
const patientService = require('./PatientService');
const consentService = require('./ConsentService');
const hospitalService = require('./HospitalService');
const auditService = require('./AuditService');

class CrossHospitalService {
  constructor() {
    this.config = {
      tokenExpiryTime: '1h', // Default token expiry time
      encryptionKey: process.env.CROSS_HOSPITAL_ENCRYPTION_KEY,
      jwtSecret: process.env.CROSS_HOSPITAL_JWT_SECRET
    };
  }

  /**
   * Request patient records from another hospital
   * @param {string} patientGlobalId - Global patient identifier
   * @param {string} requestingHospitalId - ID of the requesting hospital
   * @param {string} targetHospitalId - ID of the hospital holding the records
   * @param {string} requestingUserId - ID of the user making the request
   * @param {string} purpose - Purpose of the request
   * @param {Array<string>} recordTypes - Types of records being requested
   * @returns {Promise<Object>} - Request result with access token if successful
   */
  async requestPatientRecords(patientGlobalId, requestingHospitalId, targetHospitalId, requestingUserId, purpose, recordTypes) {
    try {
      // Validate request parameters
      if (!patientGlobalId || !requestingHospitalId || !targetHospitalId || !requestingUserId || !purpose || !recordTypes) {
        throw new Error('Missing required parameters for cross-hospital record request');
      }

      // Get hospital information
      const requestingHospital = await hospitalService.getHospitalById(requestingHospitalId);
      const targetHospital = await hospitalService.getHospitalById(targetHospitalId);

      if (!requestingHospital || !targetHospital) {
        throw new Error('Invalid hospital information');
      }

      // Check if hospitals are in the same network
      if (!this.areHospitalsConnected(requestingHospital, targetHospital)) {
        throw new Error('Hospitals are not connected in the secure network');
      }

      // Check if patient exists at the requesting hospital
      const localPatient = await patientService.getPatientByGlobalId(patientGlobalId, requestingHospitalId);
      if (!localPatient) {
        throw new Error('Patient not found at the requesting hospital');
      }

      // Create request payload
      const requestPayload = {
        patientGlobalId,
        requestingHospitalId,
        requestingHospitalName: requestingHospital.name,
        requestingUserId,
        purpose,
        recordTypes,
        timestamp: new Date().toISOString(),
        requestId: crypto.randomUUID()
      };

      // Sign the request
      const signedRequest = this.signRequest(requestPayload);

      // Log the request attempt in audit trail
      await auditService.logCrossHospitalRequest({
        requestId: requestPayload.requestId,
        patientId: localPatient.id,
        patientGlobalId,
        requestingHospitalId,
        targetHospitalId,
        requestingUserId,
        purpose,
        recordTypes,
        status: 'initiated',
        timestamp: requestPayload.timestamp
      });

      // Send request to target hospital
      const response = await this.sendRecordRequest(targetHospital.apiEndpoint, signedRequest);

      // Update audit log with response
      await auditService.updateCrossHospitalRequestStatus(
        requestPayload.requestId,
        response.success ? 'approved' : 'denied',
        response.message
      );

      return response;
    } catch (error) {
      console.error('Error requesting patient records:', error);
      
      // Log the error in audit trail if we have enough information
      if (patientGlobalId && requestingHospitalId && targetHospitalId && requestingUserId) {
        await auditService.logCrossHospitalRequest({
          requestId: crypto.randomUUID(),
          patientGlobalId,
          requestingHospitalId,
          targetHospitalId,
          requestingUserId,
          purpose: purpose || 'unknown',
          recordTypes: recordTypes || [],
          status: 'error',
          message: error.message,
          timestamp: new Date().toISOString()
        });
      }
      
      throw error;
    }
  }

  /**
   * Process incoming record request from another hospital
   * @param {Object} request - The signed request object
   * @returns {Promise<Object>} - Response with access token if approved
   */
  async processRecordRequest(request) {
    try {
      // Verify request signature
      const verifiedRequest = this.verifyRequest(request);
      if (!verifiedRequest) {
        throw new Error('Invalid request signature');
      }

      const {
        patientGlobalId,
        requestingHospitalId,
        requestingHospitalName,
        requestingUserId,
        purpose,
        recordTypes,
        timestamp,
        requestId
      } = verifiedRequest;

      // Get local hospital ID
      const localHospitalId = await hospitalService.getLocalHospitalId();

      // Check if patient exists at this hospital
      const patient = await patientService.getPatientByGlobalId(patientGlobalId, localHospitalId);
      if (!patient) {
        return {
          success: false,
          message: 'Patient not found at this hospital',
          requestId
        };
      }

      // Check if request is recent (within last 5 minutes)
      const requestTime = new Date(timestamp);
      const now = new Date();
      const timeDiff = (now - requestTime) / 1000 / 60; // difference in minutes
      if (timeDiff > 5) {
        return {
          success: false,
          message: 'Request has expired',
          requestId
        };
      }

      // Check if requesting hospital is connected
      const requestingHospital = await hospitalService.getHospitalById(requestingHospitalId);
      if (!requestingHospital || !this.areHospitalsConnected(requestingHospital, { id: localHospitalId })) {
        return {
          success: false,
          message: 'Requesting hospital is not connected to this network',
          requestId
        };
      }

      // Log the incoming request in audit trail
      await auditService.logCrossHospitalRequest({
        requestId,
        patientId: patient.id,
        patientGlobalId,
        requestingHospitalId,
        targetHospitalId: localHospitalId,
        requestingUserId,
        purpose,
        recordTypes,
        status: 'received',
        timestamp: new Date().toISOString()
      });

      // Check if patient has given consent for sharing
      const hasConsent = await consentService.checkCrossHospitalConsent(
        patient.id,
        requestingHospitalId,
        recordTypes
      );

      if (!hasConsent) {
        // Update audit log with denial
        await auditService.updateCrossHospitalRequestStatus(
          requestId,
          'denied',
          'Patient has not provided consent for sharing these records'
        );

        return {
          success: false,
          message: 'Patient has not provided consent for sharing these records',
          requestId
        };
      }

      // Generate access token for the requesting hospital
      const accessToken = this.generateAccessToken({
        patientId: patient.id,
        patientGlobalId,
        requestingHospitalId,
        requestingUserId,
        recordTypes,
        purpose,
        requestId
      });

      // Update audit log with approval
      await auditService.updateCrossHospitalRequestStatus(
        requestId,
        'approved',
        'Access token generated'
      );

      // Return success response with access token
      return {
        success: true,
        message: 'Access granted',
        accessToken,
        expiresIn: this.config.tokenExpiryTime,
        requestId
      };
    } catch (error) {
      console.error('Error processing record request:', error);
      
      // Try to extract requestId for audit logging
      let requestId = 'unknown';
      try {
        if (request && request.payload) {
          const payload = typeof request.payload === 'string' 
            ? JSON.parse(request.payload) 
            : request.payload;
          requestId = payload.requestId || 'unknown';
        }
      } catch (e) {
        // Ignore parsing errors
      }
      
      // Log the error in audit trail
      await auditService.logCrossHospitalRequest({
        requestId,
        status: 'error',
        message: error.message,
        timestamp: new Date().toISOString()
      });
      
      return {
        success: false,
        message: 'Error processing request: ' + error.message,
        requestId
      };
    }
  }

  /**
   * Retrieve patient records using an access token
   * @param {string} accessToken - The access token
   * @returns {Promise<Object>} - Patient records
   */
  async retrieveRecordsWithToken(accessToken) {
    try {
      // Verify and decode the access token
      const decoded = this.verifyAccessToken(accessToken);
      if (!decoded) {
        throw new Error('Invalid or expired access token');
      }

      const {
        patientId,
        patientGlobalId,
        requestingHospitalId,
        requestingUserId,
        recordTypes,
        purpose,
        requestId
      } = decoded;

      // Get local hospital ID
      const localHospitalId = await hospitalService.getLocalHospitalId();

      // Log the record access in audit trail
      await auditService.logCrossHospitalAccess({
        requestId,
        patientId,
        patientGlobalId,
        requestingHospitalId,
        providingHospitalId: localHospitalId,
        requestingUserId,
        recordTypes,
        purpose,
        timestamp: new Date().toISOString()
      });

      // Retrieve the requested records
      const records = {};

      // Process each requested record type
      for (const recordType of recordTypes) {
        switch (recordType) {
          case 'demographics':
            records.demographics = await patientService.getPatientDemographics(patientId);
            break;
          case 'medications':
            const medicationService = require('./MedicationService');
            records.medications = await medicationService.getPatientMedications(patientId);
            break;
          case 'documents':
            const documentService = require('./DocumentService');
            records.documents = await documentService.getPatientDocuments(patientId);
            break;
          case 'medicalRecords':
            const medicalRecordService = require('./MedicalRecordService');
            records.medicalRecords = await medicalRecordService.getPatientMedicalRecords(patientId);
            break;
          // Add more record types as needed
          default:
            // Skip unknown record types
            break;
        }
      }

      // Return the records
      return {
        success: true,
        patientGlobalId,
        requestId,
        records
      };
    } catch (error) {
      console.error('Error retrieving records with token:', error);
      
      // Try to extract information from the token for audit logging
      let requestId = 'unknown';
      let patientId = null;
      try {
        const decoded = jwt.decode(accessToken);
        if (decoded) {
          requestId = decoded.requestId || 'unknown';
          patientId = decoded.patientId;
        }
      } catch (e) {
        // Ignore decoding errors
      }
      
      // Log the error in audit trail
      if (patientId) {
        await auditService.logCrossHospitalAccess({
          requestId,
          patientId,
          status: 'error',
          message: error.message,
          timestamp: new Date().toISOString()
        });
      }
      
      throw error;
    }
  }

  /**
   * Revoke an access token
   * @param {string} accessToken - The access token to revoke
   * @param {string} reason - Reason for revocation
   * @returns {Promise<Object>} - Revocation result
   */
  async revokeAccessToken(accessToken, reason) {
    try {
      // Verify the token first
      const decoded = this.verifyAccessToken(accessToken);
      if (!decoded) {
        throw new Error('Invalid or expired access token');
      }

      const { requestId, patientId, requestingHospitalId, requestingUserId } = decoded;

      // Add token to revocation list
      // In a real implementation, this would add the token to a blacklist or revocation database
      // For this example, we'll just log the revocation

      // Log the revocation in audit trail
      await auditService.logTokenRevocation({
        requestId,
        patientId,
        requestingHospitalId,
        requestingUserId,
        reason,
        timestamp: new Date().toISOString()
      });

      return {
        success: true,
        message: 'Access token revoked successfully',
        requestId
      };
    } catch (error) {
      console.error('Error revoking access token:', error);
      throw error;
    }
  }

  /**
   * Check if patient has records at a specific hospital
   * @param {string} patientGlobalId - Global patient identifier
   * @param {string} hospitalId - Hospital ID to check
   * @returns {Promise<boolean>} - Whether patient has records at the hospital
   */
  async checkPatientExistsAtHospital(patientGlobalId, hospitalId) {
    try {
      // Get hospital information
      const hospital = await hospitalService.getHospitalById(hospitalId);
      if (!hospital) {
        throw new Error('Hospital not found');
      }

      // Create request payload
      const requestPayload = {
        patientGlobalId,
        requestType: 'existence_check',
        timestamp: new Date().toISOString(),
        requestId: crypto.randomUUID()
      };

      // Sign the request
      const signedRequest = this.signRequest(requestPayload);

      // Send request to hospital
      const response = await this.sendExistenceCheckRequest(hospital.apiEndpoint, signedRequest);

      return response.exists;
    } catch (error) {
      console.error('Error checking patient existence at hospital:', error);
      return false; // Default to false in case of error
    }
  }

  /**
   * Process patient existence check request
   * @param {Object} request - The signed request object
   * @returns {Promise<Object>} - Response indicating if patient exists
   */
  async processExistenceCheckRequest(request) {
    try {
      // Verify request signature
      const verifiedRequest = this.verifyRequest(request);
      if (!verifiedRequest) {
        throw new Error('Invalid request signature');
      }

      const { patientGlobalId, requestType, timestamp, requestId } = verifiedRequest;

      // Verify this is an existence check request
      if (requestType !== 'existence_check') {
        throw new Error('Invalid request type');
      }

      // Check if request is recent (within last 5 minutes)
      const requestTime = new Date(timestamp);
      const now = new Date();
      const timeDiff = (now - requestTime) / 1000 / 60; // difference in minutes
      if (timeDiff > 5) {
        return {
          success: false,
          message: 'Request has expired',
          requestId
        };
      }

      // Get local hospital ID
      const localHospitalId = await hospitalService.getLocalHospitalId();

      // Check if patient exists at this hospital
      const patient = await patientService.getPatientByGlobalId(patientGlobalId, localHospitalId);

      return {
        success: true,
        exists: !!patient,
        requestId
      };
    } catch (error) {
      console.error('Error processing existence check request:', error);
      return {
        success: false,
        message: 'Error processing request: ' + error.message,
        exists: false
      };
    }
  }

  /**
   * Sign a request payload
   * @param {Object} payload - Request payload
   * @returns {Object} - Signed request
   */
  signRequest(payload) {
    // Convert payload to string if it's an object
    const payloadString = typeof payload === 'string' ? payload : JSON.stringify(payload);

    // Create HMAC signature
    const signature = crypto
      .createHmac('sha256', this.config.encryptionKey)
      .update(payloadString)
      .digest('hex');

    return {
      payload,
      signature
    };
  }

  /**
   * Verify a signed request
   * @param {Object} signedRequest - The signed request object
   * @returns {Object|null} - Verified payload or null if invalid
   */
  verifyRequest(signedRequest) {
    try {
      const { payload, signature } = signedRequest;

      // Convert payload to string if it's an object
      const payloadString = typeof payload === 'string' ? payload : JSON.stringify(payload);

      // Create HMAC signature for comparison
      const expectedSignature = crypto
        .createHmac('sha256', this.config.encryptionKey)
        .update(payloadString)
        .digest('hex');

      // Compare signatures
      if (signature === expectedSignature) {
        return typeof payload === 'string' ? JSON.parse(payload) : payload;
      }

      return null;
    } catch (error) {
      console.error('Error verifying request:', error);
      return null;
    }
  }

  /**
   * Generate an access token for cross-hospital record access
   * @param {Object} tokenData - Data to include in the token
   * @returns {string} - JWT access token
   */
  generateAccessToken(tokenData) {
    return jwt.sign(tokenData, this.config.jwtSecret, {
      expiresIn: this.config.tokenExpiryTime
    });
  }

  /**
   * Verify and decode an access token
   * @param {string} token - JWT access token
   * @returns {Object|null} - Decoded token payload or null if invalid
   */
  verifyAccessToken(token) {
    try {
      return jwt.verify(token, this.config.jwtSecret);
    } catch (error) {
      console.error('Error verifying access token:', error);
      return null;
    }
  }

  /**
   * Check if two hospitals are connected in the network
   * @param {Object} hospital1 - First hospital
   * @param {Object} hospital2 - Second hospital
   * @returns {boolean} - Whether hospitals are connected
   */
  areHospitalsConnected(hospital1, hospital2) {
    // In a real implementation, this would check network connectivity and trust relationships
    // For this example, we'll assume all hospitals in the system are connected
    return true;
  }

  /**
   * Send a record request to another hospital
   * @param {string} endpoint - Hospital API endpoint
   * @param {Object} signedRequest - Signed request object
   * @returns {Promise<Object>} - Response from the hospital
   */
  async sendRecordRequest(endpoint, signedRequest) {
    try {
      // In a real implementation, this would make an HTTPS request to the hospital's API
      // For this example, we'll simulate a successful response
      
      // Simulate network request
      // const response = await axios.post(`${endpoint}/api/cross-hospital/request`, signedRequest);
      // return response.data;
      
      // Simulated response
      return {
        success: true,
        message: 'Access granted',
        accessToken: 'simulated_access_token',
        expiresIn: this.config.tokenExpiryTime,
        requestId: typeof signedRequest.payload === 'string' 
          ? JSON.parse(signedRequest.payload).requestId 
          : signedRequest.payload.requestId
      };
    } catch (error) {
      console.error('Error sending record request:', error);
      throw error;
    }
  }

  /**
   * Send an existence check request to another hospital
   * @param {string} endpoint - Hospital API endpoint
   * @param {Object} signedRequest - Signed request object
   * @returns {Promise<Object>} - Response from the hospital
   */
  async sendExistenceCheckRequest(endpoint, signedRequest) {
    try {
      // In a real implementation, this would make an HTTPS request to the hospital's API
      // For this example, we'll simulate a response
      
      // Simulate network request
      // const response = await axios.post(`${endpoint}/api/cross-hospital/check-existence`, signedRequest);
      // return response.data;
      
      // Simulated response - randomly determine if patient exists
      const exists = Math.random() > 0.5;
      
      return {
        success: true,
        exists,
        requestId: typeof signedRequest.payload === 'string' 
          ? JSON.parse(signedRequest.payload).requestId 
          : signedRequest.payload.requestId
      };
    } catch (error) {
      console.error('Error sending existence check request:', error);
      throw error;
    }
  }
}

module.exports = new CrossHospitalService();