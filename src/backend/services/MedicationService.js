const { v4: uuidv4 } = require('uuid');
const db = require('../database/connection');
const { encryptData, decryptData } = require('../security/encryption');
const AccessTokenService = require('./AccessTokenService');
const PatientService = require('./PatientService');
const HospitalService = require('./HospitalService');
const axios = require('axios');

/**
 * Service for medication management operations
 */
class MedicationService {
  /**
   * Get medications based on filters
   * @param {Object} filters - Filters for medications (patientId, active, etc.)
   * @returns {Promise<Array>} List of medications
   */
  static async getMedications(filters = {}) {
    try {
      let query = 'SELECT * FROM patient_medications WHERE 1=1';
      const params = [];
      
      if (filters.patientId) {
        query += ' AND patient_id = $' + (params.length + 1);
        params.push(filters.patientId);
      }
      
      if (filters.active !== undefined) {
        query += ' AND active = $' + (params.length + 1);
        params.push(filters.active);
      }
      
      if (filters.hospitalId) {
        query += ' AND hospital_id = $' + (params.length + 1);
        params.push(filters.hospitalId);
      }
      
      query += ' ORDER BY start_date DESC';
      
      const result = await db.query(query, params);
      return result.rows.map(this.mapMedicationFromDb);
    } catch (error) {
      console.error('Error in getMedications:', error);
      throw error;
    }
  }
  
  /**
   * Get medication by ID
   * @param {string} id - Medication ID
   * @returns {Promise<Object|null>} Medication object or null if not found
   */
  static async getMedicationById(id) {
    try {
      const query = 'SELECT * FROM patient_medications WHERE id = $1';
      const result = await db.query(query, [id]);
      
      if (result.rows.length === 0) {
        return null;
      }
      
      return this.mapMedicationFromDb(result.rows[0]);
    } catch (error) {
      console.error('Error in getMedicationById:', error);
      throw error;
    }
  }
  
  /**
   * Create a new medication record
   * @param {Object} medicationData - Medication data
   * @returns {Promise<Object>} Created medication
   */
  static async createMedication(medicationData) {
    try {
      const id = uuidv4();
      const now = new Date();
      
      const query = `
        INSERT INTO patient_medications (
          id, patient_id, hospital_id, name, rxnorm_code, dosage, frequency, 
          route, start_date, end_date, prescribed_by, active, created_at, 
          created_by, updated_at, updated_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
        RETURNING *
      `;
      
      const params = [
        id,
        medicationData.patientId,
        medicationData.hospitalId,
        medicationData.name,
        medicationData.rxnormCode || null,
        medicationData.dosage,
        medicationData.frequency,
        medicationData.route,
        new Date(medicationData.startDate),
        medicationData.endDate ? new Date(medicationData.endDate) : null,
        medicationData.prescribedBy,
        medicationData.active !== undefined ? medicationData.active : true,
        now,
        medicationData.createdBy,
        now,
        medicationData.createdBy
      ];
      
      const result = await db.query(query, params);
      return this.mapMedicationFromDb(result.rows[0]);
    } catch (error) {
      console.error('Error in createMedication:', error);
      throw error;
    }
  }
  
  /**
   * Update a medication record
   * @param {string} id - Medication ID
   * @param {Object} medicationData - Updated medication data
   * @returns {Promise<Object>} Updated medication
   */
  static async updateMedication(id, medicationData) {
    try {
      // Get existing medication to merge with updates
      const existingMedication = await this.getMedicationById(id);
      if (!existingMedication) {
        throw new Error('Medication not found');
      }
      
      // Build update query dynamically based on provided fields
      const updates = [];
      const params = [id]; // First param is always the ID
      let paramIndex = 2;
      
      const fields = {
        name: medicationData.name,
        rxnorm_code: medicationData.rxnormCode,
        dosage: medicationData.dosage,
        frequency: medicationData.frequency,
        route: medicationData.route,
        start_date: medicationData.startDate ? new Date(medicationData.startDate) : undefined,
        end_date: medicationData.endDate === null ? null : 
                 medicationData.endDate ? new Date(medicationData.endDate) : undefined,
        prescribed_by: medicationData.prescribedBy,
        active: medicationData.active,
        updated_at: new Date(),
        updated_by: medicationData.updatedBy
      };
      
      // Add each defined field to the update query
      for (const [key, value] of Object.entries(fields)) {
        if (value !== undefined) {
          updates.push(`${key} = $${paramIndex}`);
          params.push(value);
          paramIndex++;
        }
      }
      
      // If no updates provided, return existing medication
      if (updates.length === 0) {
        return existingMedication;
      }
      
      const query = `
        UPDATE patient_medications
        SET ${updates.join(', ')}
        WHERE id = $1
        RETURNING *
      `;
      
      const result = await db.query(query, params);
      return this.mapMedicationFromDb(result.rows[0]);
    } catch (error) {
      console.error('Error in updateMedication:', error);
      throw error;
    }
  }
  
  /**
   * Check if a user has access to a patient's data
   * @param {string} userId - User ID
   * @param {string} patientId - Patient ID
   * @returns {Promise<boolean>} Whether user has access
   */
  static async checkPatientAccess(userId, patientId) {
    try {
      // Get user's hospital ID
      const userQuery = 'SELECT hospital_id, role FROM users WHERE id = $1';
      const userResult = await db.query(userQuery, [userId]);
      
      if (userResult.rows.length === 0) {
        return false;
      }
      
      const { hospital_id: userHospitalId, role } = userResult.rows[0];
      
      // System admins have access to all patients
      if (role === 'admin') {
        return true;
      }
      
      // Check if patient belongs to user's hospital
      const patientQuery = 'SELECT hospital_id FROM patients WHERE id = $1';
      const patientResult = await db.query(patientQuery, [patientId]);
      
      if (patientResult.rows.length === 0) {
        return false;
      }
      
      const { hospital_id: patientHospitalId } = patientResult.rows[0];
      
      // If patient is from user's hospital, grant access
      if (patientHospitalId === userHospitalId) {
        return true;
      }
      
      // Check if there's a valid access token for cross-hospital access
      const hasValidToken = await AccessTokenService.checkValidAccessToken({
        userId,
        patientId,
        resourceType: 'patient_medications'
      });
      
      return hasValidToken;
    } catch (error) {
      console.error('Error in checkPatientAccess:', error);
      throw error;
    }
  }
  
  /**
   * Validate medication against drug database
   * @param {string} name - Medication name
   * @param {string} rxnormCode - RxNorm code
   * @returns {Promise<boolean>} Whether medication is valid
   */
  static async validateMedication(name, rxnormCode) {
    try {
      // If RxNorm code is provided, validate against RxNorm API
      if (rxnormCode) {
        // In a real implementation, this would call the RxNorm API
        // For demo purposes, we'll simulate a validation check
        const isValid = rxnormCode.startsWith('RX') && rxnormCode.length >= 6;
        return isValid;
      }
      
      // If only name is provided, check against our medication database
      const query = 'SELECT COUNT(*) FROM medications WHERE LOWER(name) = LOWER($1)';
      const result = await db.query(query, [name]);
      
      return parseInt(result.rows[0].count) > 0;
    } catch (error) {
      console.error('Error in validateMedication:', error);
      // Default to true in case of API failure to not block medication entry
      // In production, this behavior might be different based on requirements
      return true;
    }
  }
  
  /**
   * Scan medication barcode/QR code
   * @param {string} barcode - Medication barcode
   * @returns {Promise<Object|null>} Medication information or null if not found
   */
  static async scanMedicationBarcode(barcode) {
    try {
      // In a real implementation, this would validate the barcode against a medication database
      // or call an external API like the FDA NDC Directory or RxNorm
      
      // For demo purposes, we'll check our local database
      const query = 'SELECT * FROM medications WHERE barcode = $1';
      const result = await db.query(query, [barcode]);
      
      if (result.rows.length === 0) {
        return null;
      }
      
      return {
        id: result.rows[0].id,
        name: result.rows[0].name,
        rxnormCode: result.rows[0].rxnorm_code,
        form: result.rows[0].form,
        strength: result.rows[0].strength,
        manufacturer: result.rows[0].manufacturer,
        expirationDate: result.rows[0].expiration_date,
        lotNumber: result.rows[0].lot_number,
        isValid: true
      };
    } catch (error) {
      console.error('Error in scanMedicationBarcode:', error);
      throw error;
    }
  }
  
  /**
   * Search medications in drug database
   * @param {string} query - Search query
   * @returns {Promise<Array>} List of matching medications
   */
  static async searchMedications(query) {
    try {
      // In a real implementation, this would search an external API like RxNorm
      // For demo purposes, we'll search our local database
      
      const searchQuery = `
        SELECT * FROM medications 
        WHERE 
          LOWER(name) LIKE LOWER($1) OR
          LOWER(rxnorm_code) LIKE LOWER($1)
        LIMIT 20
      `;
      
      const result = await db.query(searchQuery, [`%${query}%`]);
      
      return result.rows.map(row => ({
        id: row.id,
        name: row.name,
        rxnormCode: row.rxnorm_code,
        form: row.form,
        strength: row.strength,
        manufacturer: row.manufacturer
      }));
    } catch (error) {
      console.error('Error in searchMedications:', error);
      throw error;
    }
  }
  
  /**
   * Get patient medication history
   * @param {string} patientId - Patient ID
   * @param {Object} options - Query options (limit, offset, etc.)
   * @returns {Promise<Array>} Medication history
   */
  static async getPatientMedicationHistory(patientId, options = {}) {
    try {
      const { limit = 50, offset = 0, includeInactive = false } = options;
      
      let query = `
        SELECT * FROM patient_medications 
        WHERE patient_id = $1
      `;
      
      const params = [patientId];
      
      if (!includeInactive) {
        query += ' AND active = true';
      }
      
      query += ' ORDER BY start_date DESC LIMIT $2 OFFSET $3';
      params.push(limit, offset);
      
      const result = await db.query(query, params);
      return result.rows.map(this.mapMedicationFromDb);
    } catch (error) {
      console.error('Error in getPatientMedicationHistory:', error);
      throw error;
    }
  }
  
  /**
   * Map database medication record to API format
   * @param {Object} dbRecord - Database record
   * @returns {Object} Formatted medication object
   */
  static mapMedicationFromDb(dbRecord) {
    return {
      id: dbRecord.id,
      patientId: dbRecord.patient_id,
      hospitalId: dbRecord.hospital_id,
      name: dbRecord.name,
      rxnormCode: dbRecord.rxnorm_code,
      dosage: dbRecord.dosage,
      frequency: dbRecord.frequency,
      route: dbRecord.route,
      startDate: dbRecord.start_date,
      endDate: dbRecord.end_date,
      prescribedBy: dbRecord.prescribed_by,
      active: dbRecord.active,
      createdAt: dbRecord.created_at,
      createdBy: dbRecord.created_by,
      updatedAt: dbRecord.updated_at,
      updatedBy: dbRecord.updated_by
    };
  }
}

module.exports = MedicationService;