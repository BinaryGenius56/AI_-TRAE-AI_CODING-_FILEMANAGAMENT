/**
 * Consent Service
 * Manages patient consent for data sharing between hospitals
 */

const { v4: uuidv4 } = require('uuid');
const config = require('../config/config');
const AuditService = require('./AuditService');

/**
 * Consent Service class for managing patient consent
 */
class ConsentService {
  constructor() {
    // This would be replaced with actual database models in a real implementation
    this.consents = [];
  }

  /**
   * Create a new patient consent record
   * @param {Object} consentData - Consent data
   * @param {string} consentData.patient_id - Patient ID
   * @param {string} consentData.granting_hospital_id - ID of hospital granting access
   * @param {string} consentData.receiving_hospital_id - ID of hospital receiving access
   * @param {Array} consentData.data_types - Types of data consented for sharing
   * @param {string} consentData.purpose - Purpose of data sharing
   * @param {Date} consentData.expiry_date - Expiry date of consent
   * @param {string} consentData.granted_by_user_id - ID of user who granted consent
   * @returns {Object} Created consent record
   */
  async createConsent(consentData) {
    try {
      // Validate consent data
      this.validateConsentData(consentData);
      
      // Create consent record
      const consent = {
        id: uuidv4(),
        ...consentData,
        status: 'active',
        created_at: new Date(),
        updated_at: new Date()
      };
      
      // In a real implementation, this would insert into the database
      this.consents.push(consent);
      
      // Log consent creation
      AuditService.logPatientConsentEvent({
        event_type: 'consent_created',
        patient_id: consent.patient_id,
        granting_hospital_id: consent.granting_hospital_id,
        receiving_hospital_id: consent.receiving_hospital_id,
        data_types: consent.data_types,
        purpose: consent.purpose,
        expiry_date: consent.expiry_date,
        granted_by_user_id: consent.granted_by_user_id
      });
      
      return consent;
    } catch (error) {
      console.error('Error creating consent:', error);
      throw error;
    }
  }

  /**
   * Get a consent record by ID
   * @param {string} consentId - Consent ID
   * @returns {Object|null} Consent record or null if not found
   */
  async getConsentById(consentId) {
    try {
      // In a real implementation, this would query the database
      const consent = this.consents.find(c => c.id === consentId);
      return consent || null;
    } catch (error) {
      console.error('Error getting consent by ID:', error);
      throw error;
    }
  }

  /**
   * Get consent records for a patient
   * @param {string} patientId - Patient ID
   * @returns {Array} Consent records
   */
  async getConsentsForPatient(patientId) {
    try {
      // In a real implementation, this would query the database
      return this.consents.filter(c => c.patient_id === patientId);
    } catch (error) {
      console.error('Error getting consents for patient:', error);
      throw error;
    }
  }

  /**
   * Get active consent records for a patient
   * @param {string} patientId - Patient ID
   * @returns {Array} Active consent records
   */
  async getActiveConsentsForPatient(patientId) {
    try {
      // In a real implementation, this would query the database
      return this.consents.filter(c => {
        return c.patient_id === patientId && 
               c.status === 'active' && 
               new Date(c.expiry_date) > new Date();
      });
    } catch (error) {
      console.error('Error getting active consents for patient:', error);
      throw error;
    }
  }

  /**
   * Check if consent exists for a specific data sharing scenario
   * @param {string} patientId - Patient ID
   * @param {string} grantingHospitalId - ID of hospital granting access
   * @param {string} receivingHospitalId - ID of hospital receiving access
   * @param {string} dataType - Type of data to check consent for
   * @returns {boolean} True if consent exists
   */
  async checkConsent(patientId, grantingHospitalId, receivingHospitalId, dataType) {
    try {
      // Get active consents for patient
      const activeConsents = await this.getActiveConsentsForPatient(patientId);
      
      // Check if any consent matches the criteria
      return activeConsents.some(consent => {
        return consent.granting_hospital_id === grantingHospitalId &&
               consent.receiving_hospital_id === receivingHospitalId &&
               consent.data_types.includes(dataType);
      });
    } catch (error) {
      console.error('Error checking consent:', error);
      throw error;
    }
  }

  /**
   * Revoke a consent record
   * @param {string} consentId - Consent ID
   * @param {string} revokedByUserId - ID of user revoking consent
   * @returns {Object} Updated consent record
   */
  async revokeConsent(consentId, revokedByUserId) {
    try {
      // Find consent index
      const consentIndex = this.consents.findIndex(c => c.id === consentId);
      if (consentIndex === -1) {
        throw new Error('Consent not found');
      }
      
      // Update consent status
      const updatedConsent = {
        ...this.consents[consentIndex],
        status: 'revoked',
        revoked_at: new Date(),
        revoked_by_user_id: revokedByUserId,
        updated_at: new Date()
      };
      
      // In a real implementation, this would update the database
      this.consents[consentIndex] = updatedConsent;
      
      // Log consent revocation
      AuditService.logPatientConsentEvent({
        event_type: 'consent_revoked',
        consent_id: consentId,
        patient_id: updatedConsent.patient_id,
        granting_hospital_id: updatedConsent.granting_hospital_id,
        receiving_hospital_id: updatedConsent.receiving_hospital_id,
        revoked_by_user_id: revokedByUserId
      });
      
      return updatedConsent;
    } catch (error) {
      console.error('Error revoking consent:', error);
      throw error;
    }
  }

  /**
   * Update a consent record
   * @param {string} consentId - Consent ID
   * @param {Object} consentData - Updated consent data
   * @param {string} updatedByUserId - ID of user updating consent
   * @returns {Object} Updated consent record
   */
  async updateConsent(consentId, consentData, updatedByUserId) {
    try {
      // Find consent index
      const consentIndex = this.consents.findIndex(c => c.id === consentId);
      if (consentIndex === -1) {
        throw new Error('Consent not found');
      }
      
      // Validate updated consent data
      this.validateConsentData({
        ...this.consents[consentIndex],
        ...consentData
      });
      
      // Update consent
      const updatedConsent = {
        ...this.consents[consentIndex],
        ...consentData,
        updated_at: new Date(),
        updated_by_user_id: updatedByUserId
      };
      
      // In a real implementation, this would update the database
      this.consents[consentIndex] = updatedConsent;
      
      // Log consent update
      AuditService.logPatientConsentEvent({
        event_type: 'consent_updated',
        consent_id: consentId,
        patient_id: updatedConsent.patient_id,
        granting_hospital_id: updatedConsent.granting_hospital_id,
        receiving_hospital_id: updatedConsent.receiving_hospital_id,
        data_types: updatedConsent.data_types,
        purpose: updatedConsent.purpose,
        expiry_date: updatedConsent.expiry_date,
        updated_by_user_id: updatedByUserId
      });
      
      return updatedConsent;
    } catch (error) {
      console.error('Error updating consent:', error);
      throw error;
    }
  }

  /**
   * Validate consent data
   * @param {Object} consentData - Consent data to validate
   * @throws {Error} If validation fails
   */
  validateConsentData(consentData) {
    // Check required fields
    const requiredFields = [
      'patient_id',
      'granting_hospital_id',
      'receiving_hospital_id',
      'data_types',
      'purpose',
      'expiry_date'
    ];
    
    for (const field of requiredFields) {
      if (!consentData[field]) {
        throw new Error(`Missing required field: ${field}`);
      }
    }
    
    // Validate data types
    if (!Array.isArray(consentData.data_types) || consentData.data_types.length === 0) {
      throw new Error('data_types must be a non-empty array');
    }
    
    // Validate expiry date
    const expiryDate = new Date(consentData.expiry_date);
    if (isNaN(expiryDate.getTime())) {
      throw new Error('Invalid expiry_date');
    }
    
    // Ensure expiry date is in the future
    if (expiryDate <= new Date()) {
      throw new Error('expiry_date must be in the future');
    }
  }

  /**
   * Get consent statistics
   * @returns {Object} Consent statistics
   */
  async getConsentStatistics() {
    try {
      const now = new Date();
      
      // Calculate statistics
      const statistics = {
        total: this.consents.length,
        active: this.consents.filter(c => c.status === 'active').length,
        expired: this.consents.filter(c => c.status === 'active' && new Date(c.expiry_date) <= now).length,
        revoked: this.consents.filter(c => c.status === 'revoked').length,
        byDataType: {},
        byHospital: {}
      };
      
      // Count by data type
      for (const consent of this.consents) {
        for (const dataType of consent.data_types) {
          if (!statistics.byDataType[dataType]) {
            statistics.byDataType[dataType] = 0;
          }
          statistics.byDataType[dataType]++;
        }
      }
      
      // Count by hospital
      for (const consent of this.consents) {
        // Count for granting hospital
        if (!statistics.byHospital[consent.granting_hospital_id]) {
          statistics.byHospital[consent.granting_hospital_id] = {
            granted: 0,
            received: 0
          };
        }
        statistics.byHospital[consent.granting_hospital_id].granted++;
        
        // Count for receiving hospital
        if (!statistics.byHospital[consent.receiving_hospital_id]) {
          statistics.byHospital[consent.receiving_hospital_id] = {
            granted: 0,
            received: 0
          };
        }
        statistics.byHospital[consent.receiving_hospital_id].received++;
      }
      
      return statistics;
    } catch (error) {
      console.error('Error getting consent statistics:', error);
      throw error;
    }
  }
}

module.exports = new ConsentService();