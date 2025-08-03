/**
 * Consent Controller
 * Handles API endpoints for patient consent management
 */

const express = require('express');
const Joi = require('joi');
const ConsentService = require('../services/ConsentService');
const PatientService = require('../services/PatientService');
const AuditService = require('../services/AuditService');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

/**
 * @route GET /api/consents
 * @desc Get all consents with pagination and filtering
 * @access Private (Admin, Doctor, Nurse)
 */
router.get('/',
  authenticate,
  authorize(['admin', 'doctor', 'nurse', 'hospital_admin']),
  async (req, res) => {
    try {
      // Extract query parameters
      const options = {
        patientId: req.query.patient_id,
        hospitalId: req.query.hospital_id,
        consentType: req.query.consent_type,
        status: req.query.status,
        page: parseInt(req.query.page) || 1,
        limit: parseInt(req.query.limit) || 10,
        sortBy: req.query.sort_by || 'created_at',
        sortOrder: req.query.sort_order || 'desc'
      };
      
      // Get consents
      const consents = await ConsentService.getConsents(options);
      
      // Log consent search
      AuditService.logConsentEvent({
        event_type: 'consent_search',
        user_id: req.user.id,
        search_criteria: options
      });
      
      res.status(200).json({
        success: true,
        data: consents
      });
    } catch (error) {
      console.error('Error getting consents:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get consents'
      });
    }
  }
);

/**
 * @route GET /api/consents/:id
 * @desc Get a specific consent by ID
 * @access Private (Admin, Doctor, Nurse)
 */
router.get('/:id',
  authenticate,
  authorize(['admin', 'doctor', 'nurse', 'hospital_admin']),
  async (req, res) => {
    try {
      const consentId = req.params.id;
      
      // Get consent
      const consent = await ConsentService.getConsentById(consentId);
      
      if (!consent) {
        return res.status(404).json({
          success: false,
          error: 'Consent not found'
        });
      }
      
      // Log consent access
      AuditService.logConsentEvent({
        event_type: 'consent_access',
        user_id: req.user.id,
        consent_id: consentId
      });
      
      res.status(200).json({
        success: true,
        data: consent
      });
    } catch (error) {
      console.error('Error getting consent:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get consent'
      });
    }
  }
);

/**
 * @route GET /api/consents/patient/:patientId
 * @desc Get all consents for a specific patient
 * @access Private (Admin, Doctor, Nurse)
 */
router.get('/patient/:patientId',
  authenticate,
  authorize(['admin', 'doctor', 'nurse', 'hospital_admin']),
  async (req, res) => {
    try {
      const patientId = req.params.patientId;
      
      // Verify patient exists
      const patient = await PatientService.getPatientById(patientId);
      if (!patient) {
        return res.status(404).json({
          success: false,
          error: 'Patient not found'
        });
      }
      
      // Get patient consents
      const consents = await ConsentService.getConsentsByPatient(patientId);
      
      // Log consent access
      AuditService.logConsentEvent({
        event_type: 'patient_consents_access',
        user_id: req.user.id,
        patient_id: patientId
      });
      
      res.status(200).json({
        success: true,
        data: consents
      });
    } catch (error) {
      console.error('Error getting patient consents:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get patient consents'
      });
    }
  }
);

/**
 * @route GET /api/consents/active/patient/:patientId
 * @desc Get active consents for a specific patient
 * @access Private (Admin, Doctor, Nurse)
 */
router.get('/active/patient/:patientId',
  authenticate,
  authorize(['admin', 'doctor', 'nurse', 'hospital_admin']),
  async (req, res) => {
    try {
      const patientId = req.params.patientId;
      
      // Verify patient exists
      const patient = await PatientService.getPatientById(patientId);
      if (!patient) {
        return res.status(404).json({
          success: false,
          error: 'Patient not found'
        });
      }
      
      // Get active patient consents
      const consents = await ConsentService.getActiveConsentsByPatient(patientId);
      
      // Log consent access
      AuditService.logConsentEvent({
        event_type: 'active_consents_access',
        user_id: req.user.id,
        patient_id: patientId
      });
      
      res.status(200).json({
        success: true,
        data: consents
      });
    } catch (error) {
      console.error('Error getting active patient consents:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get active patient consents'
      });
    }
  }
);

/**
 * @route POST /api/consents
 * @desc Create a new consent
 * @access Private (Admin, Doctor)
 */
router.post('/',
  authenticate,
  authorize(['admin', 'doctor', 'hospital_admin']),
  async (req, res) => {
    try {
      // Validate request body
      const schema = Joi.object({
        patient_id: Joi.string().required(),
        consent_type: Joi.string().valid('full_access', 'limited_access', 'emergency_access', 'research_use').required(),
        granted_to_hospital_id: Joi.string().required(),
        data_types: Joi.array().items(Joi.string().valid(
          'demographics', 'medications', 'lab_results', 'imaging', 'diagnoses',
          'procedures', 'allergies', 'immunizations', 'vitals', 'notes'
        )).min(1).required(),
        start_date: Joi.date().iso().required(),
        end_date: Joi.date().iso().greater(Joi.ref('start_date')),
        purpose: Joi.string().required(),
        witness_name: Joi.string(),
        additional_notes: Joi.string()
      });
      
      const { error, value } = schema.validate(req.body);
      if (error) {
        return res.status(400).json({
          success: false,
          error: error.details[0].message
        });
      }
      
      // Verify patient exists
      const patient = await PatientService.getPatientById(value.patient_id);
      if (!patient) {
        return res.status(404).json({
          success: false,
          error: 'Patient not found'
        });
      }
      
      // Create consent
      const consentData = {
        ...value,
        status: 'active',
        created_by: req.user.id
      };
      
      const consent = await ConsentService.createConsent(consentData);
      
      // Log consent creation
      AuditService.logConsentEvent({
        event_type: 'consent_create',
        user_id: req.user.id,
        patient_id: value.patient_id,
        consent_id: consent.id,
        consent_type: value.consent_type,
        granted_to_hospital_id: value.granted_to_hospital_id
      });
      
      res.status(201).json({
        success: true,
        data: consent
      });
    } catch (error) {
      console.error('Error creating consent:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to create consent'
      });
    }
  }
);

/**
 * @route PUT /api/consents/:id
 * @desc Update a consent
 * @access Private (Admin, Doctor)
 */
router.put('/:id',
  authenticate,
  authorize(['admin', 'doctor', 'hospital_admin']),
  async (req, res) => {
    try {
      const consentId = req.params.id;
      
      // Validate request body
      const schema = Joi.object({
        consent_type: Joi.string().valid('full_access', 'limited_access', 'emergency_access', 'research_use'),
        data_types: Joi.array().items(Joi.string().valid(
          'demographics', 'medications', 'lab_results', 'imaging', 'diagnoses',
          'procedures', 'allergies', 'immunizations', 'vitals', 'notes'
        )).min(1),
        end_date: Joi.date().iso(),
        purpose: Joi.string(),
        additional_notes: Joi.string()
      });
      
      const { error, value } = schema.validate(req.body);
      if (error) {
        return res.status(400).json({
          success: false,
          error: error.details[0].message
        });
      }
      
      // Check if consent exists
      const existingConsent = await ConsentService.getConsentById(consentId);
      if (!existingConsent) {
        return res.status(404).json({
          success: false,
          error: 'Consent not found'
        });
      }
      
      // Update consent
      const updatedConsent = await ConsentService.updateConsent(consentId, value);
      
      // Log consent update
      AuditService.logConsentEvent({
        event_type: 'consent_update',
        user_id: req.user.id,
        consent_id: consentId,
        updates: value
      });
      
      res.status(200).json({
        success: true,
        data: updatedConsent
      });
    } catch (error) {
      console.error('Error updating consent:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to update consent'
      });
    }
  }
);

/**
 * @route DELETE /api/consents/:id
 * @desc Revoke a consent
 * @access Private (Admin, Doctor, Patient)
 */
router.delete('/:id',
  authenticate,
  authorize(['admin', 'doctor', 'patient', 'hospital_admin']),
  async (req, res) => {
    try {
      const consentId = req.params.id;
      
      // Check if consent exists
      const existingConsent = await ConsentService.getConsentById(consentId);
      if (!existingConsent) {
        return res.status(404).json({
          success: false,
          error: 'Consent not found'
        });
      }
      
      // If user is a patient, verify they are revoking their own consent
      if (req.user.role === 'patient' && existingConsent.patient_id !== req.user.id) {
        return res.status(403).json({
          success: false,
          error: 'You can only revoke your own consents'
        });
      }
      
      // Revoke consent
      const revokeData = {
        status: 'revoked',
        revoked_at: new Date().toISOString(),
        revoked_by: req.user.id,
        revocation_reason: req.body.reason || 'User requested revocation'
      };
      
      const revokedConsent = await ConsentService.revokeConsent(consentId, revokeData);
      
      // Log consent revocation
      AuditService.logConsentEvent({
        event_type: 'consent_revoke',
        user_id: req.user.id,
        consent_id: consentId,
        patient_id: existingConsent.patient_id,
        revocation_reason: revokeData.revocation_reason
      });
      
      res.status(200).json({
        success: true,
        data: revokedConsent
      });
    } catch (error) {
      console.error('Error revoking consent:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to revoke consent'
      });
    }
  }
);

/**
 * @route GET /api/consents/check
 * @desc Check if consent exists for a specific patient and hospital
 * @access Private (Admin, Doctor, Nurse)
 */
router.get('/check',
  authenticate,
  authorize(['admin', 'doctor', 'nurse', 'hospital_admin']),
  async (req, res) => {
    try {
      // Validate query parameters
      const schema = Joi.object({
        patient_id: Joi.string().required(),
        hospital_id: Joi.string().required(),
        data_type: Joi.string().valid(
          'demographics', 'medications', 'lab_results', 'imaging', 'diagnoses',
          'procedures', 'allergies', 'immunizations', 'vitals', 'notes'
        ).required()
      });
      
      const { error, value } = schema.validate(req.query);
      if (error) {
        return res.status(400).json({
          success: false,
          error: error.details[0].message
        });
      }
      
      // Check consent
      const hasConsent = await ConsentService.checkConsent(
        value.patient_id,
        value.hospital_id,
        value.data_type
      );
      
      // Log consent check
      AuditService.logConsentEvent({
        event_type: 'consent_check',
        user_id: req.user.id,
        patient_id: value.patient_id,
        hospital_id: value.hospital_id,
        data_type: value.data_type,
        has_consent: hasConsent
      });
      
      res.status(200).json({
        success: true,
        data: {
          has_consent: hasConsent
        }
      });
    } catch (error) {
      console.error('Error checking consent:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to check consent'
      });
    }
  }
);

/**
 * @route GET /api/consents/stats
 * @desc Get consent statistics
 * @access Private (Admin, Hospital Admin)
 */
router.get('/stats',
  authenticate,
  authorize(['admin', 'hospital_admin']),
  async (req, res) => {
    try {
      // Get consent statistics
      const stats = await ConsentService.getConsentStatistics();
      
      // Log stats access
      AuditService.logConsentEvent({
        event_type: 'consent_stats_access',
        user_id: req.user.id
      });
      
      res.status(200).json({
        success: true,
        data: stats
      });
    } catch (error) {
      console.error('Error getting consent statistics:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get consent statistics'
      });
    }
  }
);

module.exports = router;