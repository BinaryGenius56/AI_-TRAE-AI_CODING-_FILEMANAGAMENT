/**
 * Patient Service
 * Handles business logic for patient management
 */

const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');
const config = require('../config/config');

// This would be replaced with actual database models in a real implementation
let patients = [];
let consents = [];

/**
 * Patient Service class for managing patient data
 */
class PatientService {
  /**
   * Get patients with pagination and filtering
   * @param {Object} options - Query options
   * @param {number} options.page - Page number
   * @param {number} options.limit - Items per page
   * @param {string} options.search - Search term
   * @param {string} options.sortBy - Field to sort by
   * @param {string} options.sortOrder - Sort order (asc/desc)
   * @returns {Object} Paginated patients
   */
  static async getPatients({ page = 1, limit = 10, search, sortBy = 'last_name', sortOrder = 'asc' }) {
    try {
      // In a real implementation, this would query the database
      let filteredPatients = [...patients];
      
      // Apply search filter if provided
      if (search) {
        const searchLower = search.toLowerCase();
        filteredPatients = filteredPatients.filter(patient => 
          patient.first_name.toLowerCase().includes(searchLower) ||
          patient.last_name.toLowerCase().includes(searchLower) ||
          patient.global_id.toLowerCase().includes(searchLower)
        );
      }
      
      // Apply sorting
      filteredPatients.sort((a, b) => {
        if (sortOrder === 'asc') {
          return a[sortBy] > b[sortBy] ? 1 : -1;
        } else {
          return a[sortBy] < b[sortBy] ? 1 : -1;
        }
      });
      
      // Apply pagination
      const startIndex = (page - 1) * limit;
      const endIndex = page * limit;
      const paginatedPatients = filteredPatients.slice(startIndex, endIndex);
      
      return {
        data: paginatedPatients,
        pagination: {
          total: filteredPatients.length,
          page,
          limit,
          pages: Math.ceil(filteredPatients.length / limit)
        }
      };
    } catch (error) {
      console.error('Error in getPatients:', error);
      throw error;
    }
  }
  
  /**
   * Get a patient by ID
   * @param {string} id - Patient ID
   * @returns {Object|null} Patient object or null if not found
   */
  static async getPatientById(id) {
    try {
      // In a real implementation, this would query the database
      const patient = patients.find(p => p.id === id);
      return patient || null;
    } catch (error) {
      console.error('Error in getPatientById:', error);
      throw error;
    }
  }
  
  /**
   * Get a patient by global ID
   * @param {string} globalId - Global patient ID
   * @returns {Object|null} Patient object or null if not found
   */
  static async getPatientByGlobalId(globalId) {
    try {
      // In a real implementation, this would query the database
      const patient = patients.find(p => p.global_id === globalId);
      return patient || null;
    } catch (error) {
      console.error('Error in getPatientByGlobalId:', error);
      throw error;
    }
  }
  
  /**
   * Create a new patient
   * @param {Object} patientData - Patient data
   * @returns {Object} Created patient
   */
  static async createPatient(patientData) {
    try {
      const { ssn, insurance_info, ...publicData } = patientData;
      
      // Encrypt sensitive data if provided
      let encrypted_ssn = null;
      let encrypted_insurance_info = null;
      
      if (ssn) {
        encrypted_ssn = this.encryptSensitiveData(ssn);
      }
      
      if (insurance_info) {
        encrypted_insurance_info = this.encryptSensitiveData(insurance_info);
      }
      
      // Create patient object
      const patient = {
        id: uuidv4(),
        ...publicData,
        encrypted_ssn,
        encrypted_insurance_info,
        created_at: new Date(),
        updated_at: new Date()
      };
      
      // In a real implementation, this would insert into the database
      patients.push(patient);
      
      // Return patient without encrypted fields
      const { encrypted_ssn: _, encrypted_insurance_info: __, ...returnPatient } = patient;
      return returnPatient;
    } catch (error) {
      console.error('Error in createPatient:', error);
      throw error;
    }
  }
  
  /**
   * Update a patient
   * @param {string} id - Patient ID
   * @param {Object} patientData - Updated patient data
   * @returns {Object} Updated patient
   */
  static async updatePatient(id, patientData) {
    try {
      // Find patient index
      const patientIndex = patients.findIndex(p => p.id === id);
      if (patientIndex === -1) {
        throw new Error('Patient not found');
      }
      
      const { ssn, insurance_info, ...publicData } = patientData;
      
      // Get current patient data
      const currentPatient = { ...patients[patientIndex] };
      
      // Update encrypted fields if provided
      if (ssn) {
        currentPatient.encrypted_ssn = this.encryptSensitiveData(ssn);
      }
      
      if (insurance_info) {
        currentPatient.encrypted_insurance_info = this.encryptSensitiveData(insurance_info);
      }
      
      // Update patient
      const updatedPatient = {
        ...currentPatient,
        ...publicData,
        updated_at: new Date()
      };
      
      // In a real implementation, this would update the database
      patients[patientIndex] = updatedPatient;
      
      // Return patient without encrypted fields
      const { encrypted_ssn: _, encrypted_insurance_info: __, ...returnPatient } = updatedPatient;
      return returnPatient;
    } catch (error) {
      console.error('Error in updatePatient:', error);
      throw error;
    }
  }
  
  /**
   * Soft delete a patient
   * @param {string} id - Patient ID
   * @returns {boolean} Success status
   */
  static async softDeletePatient(id) {
    try {
      // Find patient index
      const patientIndex = patients.findIndex(p => p.id === id);
      if (patientIndex === -1) {
        throw new Error('Patient not found');
      }
      
      // In a real implementation, this would update the deleted_at field in the database
      // For this mock implementation, we'll remove the patient from the array
      patients.splice(patientIndex, 1);
      
      return true;
    } catch (error) {
      console.error('Error in softDeletePatient:', error);
      throw error;
    }
  }
  
  /**
   * Create a consent record for cross-hospital access
   * @param {Object} consentData - Consent data
   * @returns {Object} Created consent record
   */
  static async createConsent(consentData) {
    try {
      // Create consent object
      const consent = {
        id: uuidv4(),
        ...consentData,
        status: 'active',
        created_at: new Date(),
        updated_at: new Date()
      };
      
      // In a real implementation, this would insert into the database
      consents.push(consent);
      
      return consent;
    } catch (error) {
      console.error('Error in createConsent:', error);
      throw error;
    }
  }
  
  /**
   * Get all consent records for a patient
   * @param {string} patientId - Patient ID
   * @returns {Array} Consent records
   */
  static async getPatientConsents(patientId) {
    try {
      // In a real implementation, this would query the database
      const patientConsents = consents.filter(c => c.patient_id === patientId && c.status === 'active');
      return patientConsents;
    } catch (error) {
      console.error('Error in getPatientConsents:', error);
      throw error;
    }
  }
  
  /**
   * Get a consent record by ID
   * @param {string} consentId - Consent ID
   * @returns {Object|null} Consent record or null if not found
   */
  static async getConsentById(consentId) {
    try {
      // In a real implementation, this would query the database
      const consent = consents.find(c => c.id === consentId);
      return consent || null;
    } catch (error) {
      console.error('Error in getConsentById:', error);
      throw error;
    }
  }
  
  /**
   * Revoke a consent record
   * @param {string} consentId - Consent ID
   * @returns {boolean} Success status
   */
  static async revokeConsent(consentId) {
    try {
      // Find consent index
      const consentIndex = consents.findIndex(c => c.id === consentId);
      if (consentIndex === -1) {
        throw new Error('Consent record not found');
      }
      
      // Update consent status
      consents[consentIndex] = {
        ...consents[consentIndex],
        status: 'revoked',
        updated_at: new Date()
      };
      
      return true;
    } catch (error) {
      console.error('Error in revokeConsent:', error);
      throw error;
    }
  }
  
  /**
   * Check if a patient has given consent for a hospital
   * @param {string} patientId - Patient ID
   * @param {string} hospitalId - Hospital ID
   * @returns {Object|null} Consent record or null if not found
   */
  static async checkPatientConsent(patientId, hospitalId) {
    try {
      // In a real implementation, this would query the database
      const consent = consents.find(c => 
        c.patient_id === patientId && 
        c.target_hospital_id === hospitalId && 
        c.status === 'active' &&
        (!c.end_date || new Date(c.end_date) > new Date())
      );
      
      return consent || null;
    } catch (error) {
      console.error('Error in checkPatientConsent:', error);
      throw error;
    }
  }
  
  /**
   * Encrypt sensitive data
   * @param {string} data - Data to encrypt
   * @returns {string} Encrypted data
   */
  static encryptSensitiveData(data) {
    try {
      // In a real implementation, this would use a proper encryption method
      // For this mock implementation, we'll just return a placeholder
      return `encrypted:${data}`;
    } catch (error) {
      console.error('Error in encryptSensitiveData:', error);
      throw error;
    }
  }
  
  /**
   * Decrypt sensitive data
   * @param {string} encryptedData - Encrypted data
   * @returns {string} Decrypted data
   */
  static decryptSensitiveData(encryptedData) {
    try {
      // In a real implementation, this would use a proper decryption method
      // For this mock implementation, we'll just return the data after the prefix
      if (encryptedData && encryptedData.startsWith('encrypted:')) {
        return encryptedData.substring(10);
      }
      return null;
    } catch (error) {
      console.error('Error in decryptSensitiveData:', error);
      throw error;
    }
  }
}

module.exports = PatientService;