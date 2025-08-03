/**
 * Cross-Hospital Controller
 * Handles API endpoints for cross-hospital data sharing
 */

const express = require('express');
const Joi = require('joi');
const { v4: uuidv4 } = require('uuid');
const CrossHospitalService = require('../services/CrossHospitalService');
const PatientService = require('../services/PatientService');
const ConsentService = require('../services/ConsentService');
const HospitalService = require('../services/HospitalService');
const AuditService = require('../services/AuditService');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

/**
 * @route GET /api/cross-hospital/status
 * @desc Get cross-hospital network status
 * @access Private (Admin, Hospital Admin)
 */
router.get('/status', 
  authenticate, 
  authorize(['admin', 'hospital_admin']), 
  async (req, res) => {
    try {
      const status = await CrossHospitalService.getNetworkStatus();
      
      res.status(200).json({
        success: true,
        data: status
      });
    } catch (error) {
      console.error('Error getting cross-hospital status:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get cross-hospital network status'
      });
    }
  }
);

/**
 * @route POST /api/cross-hospital/request-access
 * @desc Request access to patient records from another hospital
 * @access Private (Doctor, Nurse, Hospital Admin)
 */
router.post('/request-access',
  authenticate,
  authorize(['doctor', 'nurse', 'hospital_admin']),
  async (req, res) => {
    try {
      // Validate request body
      const schema = Joi.object({
        patient_global_id: Joi.string().required(),
        target_hospital_id: Joi.string().required(),
        purpose: Joi.string().required(),
        record_types: Joi.array().items(Joi.string()).min(1).required(),
        request_notes: Joi.string().allow('', null)
      });
      
      const { error, value } = schema.validate(req.body);
      if (error) {
        return res.status(400).json({
          success: false,
          error: error.details[0].message
        });
      }
      
      // Request access
      const accessRequest = await CrossHospitalService.requestPatientRecords(
        value.patient_global_id,
        req.hospital.id, // From auth middleware
        value.target_hospital_id,
        req.user.id, // From auth middleware
        value.purpose,
        value.record_types,
        value.request_notes
      );
      
      // Log cross-hospital access request
      AuditService.logCrossHospitalEvent({
        event_type: 'cross_hospital_access_request',
        user_id: req.user.id,
        requesting_hospital_id: req.hospital.id,
        target_hospital_id: value.target_hospital_id,
        patient_global_id: value.patient_global_id,
        purpose: value.purpose,
        record_types: value.record_types,
        request_id: accessRequest.id
      });
      
      res.status(200).json({
        success: true,
        data: accessRequest
      });
    } catch (error) {
      console.error('Error requesting cross-hospital access:', error);
      res.status(error.status || 500).json({
        success: false,
        error: error.message || 'Failed to request cross-hospital access'
      });
    }
  }
);

/**
 * @route GET /api/cross-hospital/access-requests
 * @desc Get access requests for the current hospital
 * @access Private (Hospital Admin)
 */
router.get('/access-requests',
  authenticate,
  authorize(['hospital_admin']),
  async (req, res) => {
    try {
      // Get query parameters
      const status = req.query.status;
      const limit = parseInt(req.query.limit) || 10;
      const offset = parseInt(req.query.offset) || 0;
      
      // Get access requests
      const accessRequests = await CrossHospitalService.getAccessRequests(
        req.hospital.id,
        status,
        limit,
        offset
      );
      
      res.status(200).json({
        success: true,
        data: accessRequests
      });
    } catch (error) {
      console.error('Error getting cross-hospital access requests:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get cross-hospital access requests'
      });
    }
  }
);

/**
 * @route POST /api/cross-hospital/approve-access
 * @desc Approve an access request from another hospital
 * @access Private (Hospital Admin)
 */
router.post('/approve-access/:requestId',
  authenticate,
  authorize(['hospital_admin']),
  async (req, res) => {
    try {
      const requestId = req.params.requestId;
      
      // Validate request body
      const schema = Joi.object({
        expiry_time: Joi.string().isoDate().required(),
        approved_record_types: Joi.array().items(Joi.string()).min(1).required()
      });
      
      const { error, value } = schema.validate(req.body);
      if (error) {
        return res.status(400).json({
          success: false,
          error: error.details[0].message
        });
      }
      
      // Approve access request
      const approvedRequest = await CrossHospitalService.approveAccessRequest(
        requestId,
        req.hospital.id,
        req.user.id,
        value.expiry_time,
        value.approved_record_types
      );
      
      // Log cross-hospital access approval
      AuditService.logCrossHospitalEvent({
        event_type: 'cross_hospital_access_approved',
        user_id: req.user.id,
        hospital_id: req.hospital.id,
        request_id: requestId,
        approved_record_types: value.approved_record_types,
        expiry_time: value.expiry_time
      });
      
      res.status(200).json({
        success: true,
        data: approvedRequest
      });
    } catch (error) {
      console.error('Error approving cross-hospital access:', error);
      res.status(error.status || 500).json({
        success: false,
        error: error.message || 'Failed to approve cross-hospital access'
      });
    }
  }
);

/**
 * @route POST /api/cross-hospital/deny-access
 * @desc Deny an access request from another hospital
 * @access Private (Hospital Admin)
 */
router.post('/deny-access/:requestId',
  authenticate,
  authorize(['hospital_admin']),
  async (req, res) => {
    try {
      const requestId = req.params.requestId;
      
      // Validate request body
      const schema = Joi.object({
        denial_reason: Joi.string().required()
      });
      
      const { error, value } = schema.validate(req.body);
      if (error) {
        return res.status(400).json({
          success: false,
          error: error.details[0].message
        });
      }
      
      // Deny access request
      const deniedRequest = await CrossHospitalService.denyAccessRequest(
        requestId,
        req.hospital.id,
        req.user.id,
        value.denial_reason
      );
      
      // Log cross-hospital access denial
      AuditService.logCrossHospitalEvent({
        event_type: 'cross_hospital_access_denied',
        user_id: req.user.id,
        hospital_id: req.hospital.id,
        request_id: requestId,
        denial_reason: value.denial_reason
      });
      
      res.status(200).json({
        success: true,
        data: deniedRequest
      });
    } catch (error) {
      console.error('Error denying cross-hospital access:', error);
      res.status(error.status || 500).json({
        success: false,
        error: error.message || 'Failed to deny cross-hospital access'
      });
    }
  }
);

/**
 * @route GET /api/cross-hospital/patient/:globalId
 * @desc Get patient data from another hospital using an access token
 * @access Private (Doctor, Nurse, Hospital Admin)
 */
router.get('/patient/:globalId',
  authenticate,
  authorize(['doctor', 'nurse', 'hospital_admin']),
  async (req, res) => {
    try {
      const globalId = req.params.globalId;
      const accessToken = req.headers['x-access-token'];
      
      if (!accessToken) {
        return res.status(401).json({
          success: false,
          error: 'Access token is required'
        });
      }
      
      // Get patient data
      const patientData = await CrossHospitalService.getPatientDataWithToken(
        globalId,
        accessToken,
        req.hospital.id,
        req.user.id
      );
      
      // Log cross-hospital data access
      AuditService.logCrossHospitalEvent({
        event_type: 'cross_hospital_data_access',
        user_id: req.user.id,
        hospital_id: req.hospital.id,
        patient_global_id: globalId,
        data_types: patientData.data_types
      });
      
      res.status(200).json({
        success: true,
        data: patientData
      });
    } catch (error) {
      console.error('Error getting cross-hospital patient data:', error);
      res.status(error.status || 500).json({
        success: false,
        error: error.message || 'Failed to get cross-hospital patient data'
      });
    }
  }
);

/**
 * @route POST /api/cross-hospital/revoke-access
 * @desc Revoke an approved access token
 * @access Private (Hospital Admin)
 */
router.post('/revoke-access/:tokenId',
  authenticate,
  authorize(['hospital_admin']),
  async (req, res) => {
    try {
      const tokenId = req.params.tokenId;
      
      // Revoke access token
      const revokedToken = await CrossHospitalService.revokeAccessToken(
        tokenId,
        req.hospital.id,
        req.user.id
      );
      
      // Log cross-hospital access revocation
      AuditService.logCrossHospitalEvent({
        event_type: 'cross_hospital_access_revoked',
        user_id: req.user.id,
        hospital_id: req.hospital.id,
        token_id: tokenId
      });
      
      res.status(200).json({
        success: true,
        data: revokedToken
      });
    } catch (error) {
      console.error('Error revoking cross-hospital access:', error);
      res.status(error.status || 500).json({
        success: false,
        error: error.message || 'Failed to revoke cross-hospital access'
      });
    }
  }
);

/**
 * @route GET /api/cross-hospital/active-tokens
 * @desc Get active access tokens for the current hospital
 * @access Private (Hospital Admin)
 */
router.get('/active-tokens',
  authenticate,
  authorize(['hospital_admin']),
  async (req, res) => {
    try {
      // Get active tokens
      const activeTokens = await CrossHospitalService.getActiveTokens(req.hospital.id);
      
      res.status(200).json({
        success: true,
        data: activeTokens
      });
    } catch (error) {
      console.error('Error getting active cross-hospital tokens:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get active cross-hospital tokens'
      });
    }
  }
);

/**
 * @route GET /api/cross-hospital/audit-log
 * @desc Get cross-hospital access audit log
 * @access Private (Hospital Admin)
 */
router.get('/audit-log',
  authenticate,
  authorize(['hospital_admin']),
  async (req, res) => {
    try {
      // Get query parameters
      const startDate = req.query.start_date ? new Date(req.query.start_date) : null;
      const endDate = req.query.end_date ? new Date(req.query.end_date) : null;
      const eventType = req.query.event_type;
      const limit = parseInt(req.query.limit) || 100;
      const offset = parseInt(req.query.offset) || 0;
      
      // Get audit log
      const auditLog = await AuditService.searchAuditLog({
        event_category: 'cross_hospital',
        event_type: eventType,
        hospital_id: req.hospital.id,
        start_date: startDate,
        end_date: endDate,
        limit,
        offset
      });
      
      res.status(200).json({
        success: true,
        data: auditLog
      });
    } catch (error) {
      console.error('Error getting cross-hospital audit log:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get cross-hospital audit log'
      });
    }
  }
);

module.exports = router;