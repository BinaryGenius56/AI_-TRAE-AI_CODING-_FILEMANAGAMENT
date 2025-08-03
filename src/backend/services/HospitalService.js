/**
 * Hospital Service
 * Handles business logic for hospital network management
 */

const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');
const config = require('../config/config');

// This would be replaced with actual database models in a real implementation
let hospitals = [];

/**
 * Hospital Service class for managing hospital network
 */
class HospitalService {
  /**
   * Get all hospitals
   * @returns {Array} List of hospitals
   */
  static async getHospitals() {
    try {
      // In a real implementation, this would query the database
      return hospitals.map(hospital => {
        // Don't return API secret
        const { api_secret, ...returnHospital } = hospital;
        return returnHospital;
      });
    } catch (error) {
      console.error('Error in getHospitals:', error);
      throw error;
    }
  }
  
  /**
   * Get a hospital by ID
   * @param {string} id - Hospital ID
   * @returns {Object|null} Hospital object or null if not found
   */
  static async getHospitalById(id) {
    try {
      // In a real implementation, this would query the database
      const hospital = hospitals.find(h => h.id === id);
      
      if (!hospital) {
        return null;
      }
      
      // Don't return API secret
      const { api_secret, ...returnHospital } = hospital;
      return returnHospital;
    } catch (error) {
      console.error('Error in getHospitalById:', error);
      throw error;
    }
  }
  
  /**
   * Get a hospital by API key
   * @param {string} apiKey - Hospital API key
   * @returns {Object|null} Hospital object or null if not found
   */
  static async getHospitalByApiKey(apiKey) {
    try {
      // In a real implementation, this would query the database
      const hospital = hospitals.find(h => h.api_key === apiKey);
      return hospital || null;
    } catch (error) {
      console.error('Error in getHospitalByApiKey:', error);
      throw error;
    }
  }
  
  /**
   * Register a new hospital
   * @param {Object} hospitalData - Hospital data
   * @returns {Object} Registered hospital
   */
  static async registerHospital(hospitalData) {
    try {
      // Generate API secret if not provided
      const apiSecret = await this.generateSecureSecret();
      
      // Create hospital object
      const hospital = {
        id: uuidv4(),
        ...hospitalData,
        api_secret: apiSecret,
        created_at: new Date(),
        updated_at: new Date()
      };
      
      // In a real implementation, this would insert into the database
      hospitals.push(hospital);
      
      // Don't return API secret
      const { api_secret, ...returnHospital } = hospital;
      return returnHospital;
    } catch (error) {
      console.error('Error in registerHospital:', error);
      throw error;
    }
  }
  
  /**
   * Update a hospital
   * @param {string} id - Hospital ID
   * @param {Object} hospitalData - Updated hospital data
   * @returns {Object} Updated hospital
   */
  static async updateHospital(id, hospitalData) {
    try {
      // Find hospital index
      const hospitalIndex = hospitals.findIndex(h => h.id === id);
      if (hospitalIndex === -1) {
        throw new Error('Hospital not found');
      }
      
      // Update hospital
      const updatedHospital = {
        ...hospitals[hospitalIndex],
        ...hospitalData,
        updated_at: new Date()
      };
      
      // In a real implementation, this would update the database
      hospitals[hospitalIndex] = updatedHospital;
      
      // Don't return API secret
      const { api_secret, ...returnHospital } = updatedHospital;
      return returnHospital;
    } catch (error) {
      console.error('Error in updateHospital:', error);
      throw error;
    }
  }
  
  /**
   * Update a hospital's status
   * @param {string} id - Hospital ID
   * @param {string} status - New status
   * @returns {boolean} Success status
   */
  static async updateHospitalStatus(id, status) {
    try {
      return await this.updateHospital(id, { status });
    } catch (error) {
      console.error('Error in updateHospitalStatus:', error);
      throw error;
    }
  }
  
  /**
   * Remove a hospital from the network
   * @param {string} id - Hospital ID
   * @returns {boolean} Success status
   */
  static async removeHospital(id) {
    try {
      // Find hospital index
      const hospitalIndex = hospitals.findIndex(h => h.id === id);
      if (hospitalIndex === -1) {
        throw new Error('Hospital not found');
      }
      
      // In a real implementation, this would delete from the database or mark as deleted
      hospitals.splice(hospitalIndex, 1);
      
      return true;
    } catch (error) {
      console.error('Error in removeHospital:', error);
      throw error;
    }
  }
  
  /**
   * Generate API credentials for a hospital
   * @returns {Object} API key and secret
   */
  static async generateApiCredentials() {
    try {
      const apiKey = `hosp_${this.generateRandomString(24)}`;
      const apiSecret = await this.generateSecureSecret();
      
      return { apiKey, apiSecret };
    } catch (error) {
      console.error('Error in generateApiCredentials:', error);
      throw error;
    }
  }
  
  /**
   * Verify API credentials
   * @param {string} apiKey - API key
   * @param {string} apiSecret - API secret
   * @returns {Object|null} Hospital if credentials are valid, null otherwise
   */
  static async verifyApiCredentials(apiKey, apiSecret) {
    try {
      const hospital = await this.getHospitalByApiKey(apiKey);
      
      if (!hospital || hospital.api_secret !== apiSecret) {
        return null;
      }
      
      return hospital;
    } catch (error) {
      console.error('Error in verifyApiCredentials:', error);
      throw error;
    }
  }
  
  /**
   * Generate a secure random string for API secret
   * @returns {string} Secure random string
   */
  static async generateSecureSecret() {
    try {
      return `secret_${this.generateRandomString(32)}`;
    } catch (error) {
      console.error('Error in generateSecureSecret:', error);
      throw error;
    }
  }
  
  /**
   * Generate a random string
   * @param {number} length - Length of the string
   * @returns {string} Random string
   */
  static generateRandomString(length) {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    const charactersLength = characters.length;
    
    for (let i = 0; i < length; i++) {
      result += characters.charAt(Math.floor(Math.random() * charactersLength));
    }
    
    return result;
  }
  
  /**
   * Get active hospitals
   * @returns {Array} List of active hospitals
   */
  static async getActiveHospitals() {
    try {
      // In a real implementation, this would query the database
      const activeHospitals = hospitals.filter(h => h.status === 'active');
      
      return activeHospitals.map(hospital => {
        // Don't return API secret
        const { api_secret, ...returnHospital } = hospital;
        return returnHospital;
      });
    } catch (error) {
      console.error('Error in getActiveHospitals:', error);
      throw error;
    }
  }
  
  /**
   * Check if a hospital exists by URL
   * @param {string} url - Hospital URL
   * @returns {boolean} True if hospital exists
   */
  static async hospitalExistsByUrl(url) {
    try {
      // In a real implementation, this would query the database
      const hospital = hospitals.find(h => h.url === url);
      return !!hospital;
    } catch (error) {
      console.error('Error in hospitalExistsByUrl:', error);
      throw error;
    }
  }
}

module.exports = HospitalService;