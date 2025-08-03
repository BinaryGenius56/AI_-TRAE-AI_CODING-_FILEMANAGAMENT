/**
 * Patient Controller
 * Handles API endpoints for patient management
 */

const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const Joi = require('joi');

// Import services
const PatientService = require('../services/PatientService');
const AuditService = require('../services/AuditService');
const CrossHospitalService = require('../services/CrossHospitalService');

// Import middleware
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');

/**
 * @route GET /api/patients
 * @desc Get all patients with pagination and filtering
 * @access Private (Doctors, Nurses, Admins)
 */
router.get('/', authenticate, authorize(['doctor', 'nurse', 'admin']), async (req, res) => {
  try {
    const { page = 1, limit = 10, search, sortBy = 'last_name', sortOrder = 'asc' } = req.query;
    
    const patients = await PatientService.getPatients({
      page: parseInt(page, 10),
      limit: parseInt(limit, 10),
      search,
      sortBy,
      sortOrder
    });
    
    // Log audit event
    await AuditService.logDataAccess({
      userId: req.user.id,
      action: 'LIST',
      resourceType: 'patient',
      description: 'Retrieved patient list',
      metadata: { query: req.query }
    });
    
    return res.json(patients);
  } catch (error) {
    console.error('Error fetching patients:', error);
    return res.status(500).json({ error: 'Failed to fetch patients' });
  }
});

/**
 * @route GET /api/patients/:id
 * @desc Get a patient by ID
 * @access Private (Doctors, Nurses, Admins)
 */
router.get('/:id', authenticate, authorize(['doctor', 'nurse', 'admin']), async (req, res) => {
  try {
    const { id } = req.params;
    const patient = await PatientService.getPatientById(id);
    
    if (!patient) {
      return res.status(404).json({ error: 'Patient not found' });
    }
    
    // Log audit event
    await AuditService.logDataAccess({
      userId: req.user.id,
      action: 'READ',
      resourceType: 'patient',
      resourceId: id,
      description: 'Retrieved patient details',
      metadata: { patientId: id }
    });
    
    return res.json(patient);
  } catch (error) {
    console.error('Error fetching patient:', error);
    return res.status(500).json({ error: 'Failed to fetch patient' });
  }
});

/**
 * @route POST /api/patients
 * @desc Create a new patient
 * @access Private (Doctors, Admins)
 */
router.post('/', authenticate, authorize(['doctor', 'admin']), async (req, res) => {
  try {
    // Validate request body
    const schema = Joi.object({
      first_name: Joi.string().required(),
      last_name: Joi.string().required(),
      date_of_birth: Joi.date().required(),
      gender: Joi.string().valid('male', 'female', 'other', 'prefer_not_to_say'),
      address: Joi.string(),
      phone: Joi.string(),
      email: Joi.string().email(),
      emergency_contact: Joi.string(),
      blood_type: Joi.string().valid('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'),
      ssn: Joi.string(),
      insurance_info: Joi.string()
    });
    
    const { error, value } = schema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }
    
    // Generate global ID
    const globalId = uuidv4();
    
    // Create patient
    const patient = await PatientService.createPatient({
      ...value,
      global_id: globalId,
      hospital_id: req.user.hospital_id
    });
    
    // Log audit event
    await AuditService.logDataAccess({
      userId: req.user.id,
      action: 'CREATE',
      resourceType: 'patient',
      resourceId: patient.id,
      description: 'Created new patient record',
      metadata: { patientId: patient.id, globalId }
    });
    
    return res.status(201).json(patient);
  } catch (error) {
    console.error('Error creating patient:', error);
    return res.status(500).json({ error: 'Failed to create patient' });
  }
});

/**
 * @route PUT /api/patients/:id
 * @desc Update a patient
 * @access Private (Doctors, Admins)
 */
router.put('/:id', authenticate, authorize(['doctor', 'admin']), async (req, res) => {
  try {
    const { id } = req.params;
    
    // Validate request body
    const schema = Joi.object({
      first_name: Joi.string(),
      last_name: Joi.string(),
      date_of_birth: Joi.date(),
      gender: Joi.string().valid('male', 'female', 'other', 'prefer_not_to_say'),
      address: Joi.string(),
      phone: Joi.string(),
      email: Joi.string().email(),
      emergency_contact: Joi.string(),
      blood_type: Joi.string().valid('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'),
      insurance_info: Joi.string()
    });
    
    const { error, value } = schema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }
    
    // Check if patient exists
    const existingPatient = await PatientService.getPatientById(id);
    if (!existingPatient) {
      return res.status(404).json({ error: 'Patient not found' });
    }
    
    // Update patient
    const updatedPatient = await PatientService.updatePatient(id, value);
    
    // Log audit event
    await AuditService.logDataAccess({
      userId: req.user.id,
      action: 'UPDATE',
      resourceType: 'patient',
      resourceId: id,
      description: 'Updated patient record',
      metadata: { patientId: id, updatedFields: Object.keys(value) }
    });
    
    return res.json(updatedPatient);
  } catch (error) {
    console.error('Error updating patient:', error);
    return res.status(500).json({ error: 'Failed to update patient' });
  }
});

/**
 * @route DELETE /api/patients/:id
 * @desc Soft delete a patient
 * @access Private (Admins only)
 */
router.delete('/:id', authenticate, authorize(['admin']), async (req, res) => {
  try {
    const { id } = req.params;
    
    // Check if patient exists
    const existingPatient = await PatientService.getPatientById(id);
    if (!existingPatient) {
      return res.status(404).json({ error: 'Patient not found' });
    }
    
    // Soft delete patient
    await PatientService.softDeletePatient(id);
    
    // Log audit event
    await AuditService.logDataAccess({
      userId: req.user.id,
      action: 'DELETE',
      resourceType: 'patient',
      resourceId: id,
      description: 'Soft deleted patient record',
      metadata: { patientId: id }
    });
    
    return res.json({ message: 'Patient deleted successfully' });
  } catch (error) {
    console.error('Error deleting patient:', error);
    return res.status(500).json({ error: 'Failed to delete patient' });
  }
});

/**
 * @route POST /api/patients/:id/consent
 * @desc Create a consent record for cross-hospital access
 * @access Private (Patients, Doctors, Admins)
 */
router.post('/:id/consent', authenticate, authorize(['patient', 'doctor', 'admin']), async (req, res) => {
  try {
    const { id } = req.params;
    
    // Validate request body
    const schema = Joi.object({
      target_hospital_id: Joi.string().uuid().required(),
      consent_type: Joi.string().valid('full_access', 'read_only', 'specific_data').required(),
      specific_data_types: Joi.array().items(Joi.string()),
      start_date: Joi.date().default(new Date()),
      end_date: Joi.date().greater(Joi.ref('start_date')),
    });
    
    const { error, value } = schema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }
    
    // Check if patient exists
    const existingPatient = await PatientService.getPatientById(id);
    if (!existingPatient) {
      return res.status(404).json({ error: 'Patient not found' });
    }
    
    // If user is a patient, verify they are the same patient
    if (req.user.role === 'patient' && req.user.patient_id !== id) {
      return res.status(403).json({ error: 'Unauthorized to create consent for this patient' });
    }
    
    // Create consent record
    const consent = await PatientService.createConsent({
      patient_id: id,
      consenting_hospital_id: req.user.hospital_id,
      target_hospital_id: value.target_hospital_id,
      consent_type: value.consent_type,
      specific_data_types: value.specific_data_types,
      start_date: value.start_date,
      end_date: value.end_date,
      granted_by: req.user.id
    });
    
    // Log audit event
    await AuditService.logPatientConsent({
      userId: req.user.id,
      patientId: id,
      action: 'GRANT',
      consentType: value.consent_type,
      targetHospitalId: value.target_hospital_id,
      description: 'Created patient consent record',
      metadata: { consentId: consent.id }
    });
    
    return res.status(201).json(consent);
  } catch (error) {
    console.error('Error creating consent:', error);
    return res.status(500).json({ error: 'Failed to create consent' });
  }
});

/**
 * @route GET /api/patients/:id/consent
 * @desc Get all consent records for a patient
 * @access Private (Patients, Doctors, Admins)
 */
router.get('/:id/consent', authenticate, authorize(['patient', 'doctor', 'admin']), async (req, res) => {
  try {
    const { id } = req.params;
    
    // Check if patient exists
    const existingPatient = await PatientService.getPatientById(id);
    if (!existingPatient) {
      return res.status(404).json({ error: 'Patient not found' });
    }
    
    // If user is a patient, verify they are the same patient
    if (req.user.role === 'patient' && req.user.patient_id !== id) {
      return res.status(403).json({ error: 'Unauthorized to view consent records for this patient' });
    }
    
    // Get consent records
    const consents = await PatientService.getPatientConsents(id);
    
    // Log audit event
    await AuditService.logDataAccess({
      userId: req.user.id,
      action: 'LIST',
      resourceType: 'patient_consent',
      resourceId: id,
      description: 'Retrieved patient consent records',
      metadata: { patientId: id }
    });
    
    return res.json(consents);
  } catch (error) {
    console.error('Error fetching consent records:', error);
    return res.status(500).json({ error: 'Failed to fetch consent records' });
  }
});

/**
 * @route DELETE /api/patients/:patientId/consent/:consentId
 * @desc Revoke a consent record
 * @access Private (Patients, Doctors, Admins)
 */
router.delete('/:patientId/consent/:consentId', authenticate, authorize(['patient', 'doctor', 'admin']), async (req, res) => {
  try {
    const { patientId, consentId } = req.params;
    
    // Check if patient exists
    const existingPatient = await PatientService.getPatientById(patientId);
    if (!existingPatient) {
      return res.status(404).json({ error: 'Patient not found' });
    }
    
    // If user is a patient, verify they are the same patient
    if (req.user.role === 'patient' && req.user.patient_id !== patientId) {
      return res.status(403).json({ error: 'Unauthorized to revoke consent for this patient' });
    }
    
    // Check if consent exists
    const existingConsent = await PatientService.getConsentById(consentId);
    if (!existingConsent) {
      return res.status(404).json({ error: 'Consent record not found' });
    }
    
    // Verify consent belongs to patient
    if (existingConsent.patient_id !== patientId) {
      return res.status(400).json({ error: 'Consent record does not belong to this patient' });
    }
    
    // Revoke consent
    await PatientService.revokeConsent(consentId);
    
    // Revoke any active cross-hospital tokens
    await CrossHospitalService.revokeTokensByConsent(consentId);
    
    // Log audit event
    await AuditService.logPatientConsent({
      userId: req.user.id,
      patientId,
      action: 'REVOKE',
      consentType: existingConsent.consent_type,
      targetHospitalId: existingConsent.target_hospital_id,
      description: 'Revoked patient consent record',
      metadata: { consentId }
    });
    
    return res.json({ message: 'Consent revoked successfully' });
  } catch (error) {
    console.error('Error revoking consent:', error);
    return res.status(500).json({ error: 'Failed to revoke consent' });
  }
});

/**
 * @route GET /api/patients/global/:globalId
 * @desc Get a patient by global ID (for cross-hospital access)
 * @access Private (Cross-hospital access with valid token)
 */
router.get('/global/:globalId', authenticate, async (req, res) => {
  try {
    const { globalId } = req.params;
    const { access_token } = req.query;
    
    if (!access_token) {
      return res.status(401).json({ error: 'Access token required' });
    }
    
    // Verify cross-hospital access token
    const tokenData = await CrossHospitalService.verifyAccessToken(access_token);
    if (!tokenData) {
      return res.status(401).json({ error: 'Invalid or expired access token' });
    }
    
    // Get patient by global ID
    const patient = await PatientService.getPatientByGlobalId(globalId);
    if (!patient) {
      return res.status(404).json({ error: 'Patient not found' });
    }
    
    // Verify token is for this patient
    if (patient.global_id !== tokenData.patient_global_id) {
      return res.status(403).json({ error: 'Access token not valid for this patient' });
    }
    
    // Log cross-hospital access
    await AuditService.logCrossHospitalAccess({
      requestingHospitalId: tokenData.requesting_hospital_id,
      patientId: patient.id,
      action: 'READ',
      resourceType: 'patient',
      description: 'Cross-hospital access to patient record',
      metadata: { globalId, tokenId: tokenData.id }
    });
    
    return res.json(patient);
  } catch (error) {
    console.error('Error in cross-hospital patient access:', error);
    return res.status(500).json({ error: 'Failed to access patient record' });
  }
});

module.exports = router;