/**
 * FHIR Controller
 * Handles API endpoints for FHIR protocol
 */

const express = require('express');
const Joi = require('joi');
const FhirService = require('../services/FhirService');
const AuditService = require('../services/AuditService');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

/**
 * @route GET /api/fhir/metadata
 * @desc Get FHIR server capability statement
 * @access Public
 */
router.get('/metadata', async (req, res) => {
  try {
    const capabilityStatement = await FhirService.getCapabilityStatement();
    
    res.status(200).json(capabilityStatement);
  } catch (error) {
    console.error('Error getting capability statement:', error);
    res.status(error.status || 500).json({
      resourceType: 'OperationOutcome',
      issue: [
        {
          severity: 'error',
          code: 'exception',
          diagnostics: error.message || 'Failed to get capability statement'
        }
      ]
    });
  }
});

/**
 * @route GET /api/fhir/Patient
 * @desc Search for patients
 * @access Private
 */
router.get('/Patient',
  authenticate,
  authorize(['doctor', 'nurse', 'admin']),
  async (req, res) => {
    try {
      // Extract search parameters
      const searchParams = {
        name: req.query.name,
        identifier: req.query.identifier,
        family: req.query.family,
        given: req.query.given,
        gender: req.query.gender,
        birthdate: req.query.birthdate,
        _count: req.query._count || 10,
        _page: req.query._page || 1
      };
      
      // Search for patients
      const bundle = await FhirService.searchPatients(searchParams);
      
      // Log FHIR search
      AuditService.logFhirEvent({
        event_type: 'fhir_search',
        resource_type: 'Patient',
        user_id: req.user.id,
        search_criteria: searchParams
      });
      
      res.status(200).json(bundle);
    } catch (error) {
      console.error('Error searching patients:', error);
      res.status(error.status || 500).json({
        resourceType: 'OperationOutcome',
        issue: [
          {
            severity: 'error',
            code: 'exception',
            diagnostics: error.message || 'Failed to search patients'
          }
        ]
      });
    }
  }
);

/**
 * @route GET /api/fhir/Patient/:id
 * @desc Get patient by ID
 * @access Private
 */
router.get('/Patient/:id',
  authenticate,
  authorize(['doctor', 'nurse', 'admin']),
  async (req, res) => {
    try {
      const patientId = req.params.id;
      
      // Get patient
      const patient = await FhirService.getPatient(patientId);
      
      // Log FHIR read
      AuditService.logFhirEvent({
        event_type: 'fhir_read',
        resource_type: 'Patient',
        resource_id: patientId,
        user_id: req.user.id
      });
      
      res.status(200).json(patient);
    } catch (error) {
      console.error('Error getting patient:', error);
      res.status(error.status || 500).json({
        resourceType: 'OperationOutcome',
        issue: [
          {
            severity: 'error',
            code: 'exception',
            diagnostics: error.message || 'Failed to get patient'
          }
        ]
      });
    }
  }
);

/**
 * @route POST /api/fhir/Patient
 * @desc Create a new patient
 * @access Private
 */
router.post('/Patient',
  authenticate,
  authorize(['doctor', 'admin']),
  async (req, res) => {
    try {
      // Validate request body
      if (!req.body || !req.body.resourceType || req.body.resourceType !== 'Patient') {
        return res.status(400).json({
          resourceType: 'OperationOutcome',
          issue: [
            {
              severity: 'error',
              code: 'invalid',
              diagnostics: 'Invalid resource type. Expected Patient.'
            }
          ]
        });
      }
      
      // Create patient
      const patient = await FhirService.createPatient(req.body);
      
      // Log FHIR create
      AuditService.logFhirEvent({
        event_type: 'fhir_create',
        resource_type: 'Patient',
        resource_id: patient.id,
        user_id: req.user.id
      });
      
      res.status(201).json(patient);
    } catch (error) {
      console.error('Error creating patient:', error);
      res.status(error.status || 500).json({
        resourceType: 'OperationOutcome',
        issue: [
          {
            severity: 'error',
            code: 'exception',
            diagnostics: error.message || 'Failed to create patient'
          }
        ]
      });
    }
  }
);

/**
 * @route PUT /api/fhir/Patient/:id
 * @desc Update a patient
 * @access Private
 */
router.put('/Patient/:id',
  authenticate,
  authorize(['doctor', 'admin']),
  async (req, res) => {
    try {
      const patientId = req.params.id;
      
      // Validate request body
      if (!req.body || !req.body.resourceType || req.body.resourceType !== 'Patient') {
        return res.status(400).json({
          resourceType: 'OperationOutcome',
          issue: [
            {
              severity: 'error',
              code: 'invalid',
              diagnostics: 'Invalid resource type. Expected Patient.'
            }
          ]
        });
      }
      
      // Update patient
      const patient = await FhirService.updatePatient(patientId, req.body);
      
      // Log FHIR update
      AuditService.logFhirEvent({
        event_type: 'fhir_update',
        resource_type: 'Patient',
        resource_id: patientId,
        user_id: req.user.id
      });
      
      res.status(200).json(patient);
    } catch (error) {
      console.error('Error updating patient:', error);
      res.status(error.status || 500).json({
        resourceType: 'OperationOutcome',
        issue: [
          {
            severity: 'error',
            code: 'exception',
            diagnostics: error.message || 'Failed to update patient'
          }
        ]
      });
    }
  }
);

/**
 * @route GET /api/fhir/Observation
 * @desc Search for observations
 * @access Private
 */
router.get('/Observation',
  authenticate,
  authorize(['doctor', 'nurse']),
  async (req, res) => {
    try {
      // Extract search parameters
      const searchParams = {
        patient: req.query.patient,
        code: req.query.code,
        date: req.query.date,
        category: req.query.category,
        _count: req.query._count || 10,
        _page: req.query._page || 1
      };
      
      // Search for observations
      const bundle = await FhirService.searchObservations(searchParams);
      
      // Log FHIR search
      AuditService.logFhirEvent({
        event_type: 'fhir_search',
        resource_type: 'Observation',
        user_id: req.user.id,
        search_criteria: searchParams
      });
      
      res.status(200).json(bundle);
    } catch (error) {
      console.error('Error searching observations:', error);
      res.status(error.status || 500).json({
        resourceType: 'OperationOutcome',
        issue: [
          {
            severity: 'error',
            code: 'exception',
            diagnostics: error.message || 'Failed to search observations'
          }
        ]
      });
    }
  }
);

/**
 * @route GET /api/fhir/Observation/:id
 * @desc Get observation by ID
 * @access Private
 */
router.get('/Observation/:id',
  authenticate,
  authorize(['doctor', 'nurse']),
  async (req, res) => {
    try {
      const observationId = req.params.id;
      
      // Get observation
      const observation = await FhirService.getObservation(observationId);
      
      // Log FHIR read
      AuditService.logFhirEvent({
        event_type: 'fhir_read',
        resource_type: 'Observation',
        resource_id: observationId,
        user_id: req.user.id
      });
      
      res.status(200).json(observation);
    } catch (error) {
      console.error('Error getting observation:', error);
      res.status(error.status || 500).json({
        resourceType: 'OperationOutcome',
        issue: [
          {
            severity: 'error',
            code: 'exception',
            diagnostics: error.message || 'Failed to get observation'
          }
        ]
      });
    }
  }
);

/**
 * @route POST /api/fhir/Observation
 * @desc Create a new observation
 * @access Private
 */
router.post('/Observation',
  authenticate,
  authorize(['doctor', 'nurse']),
  async (req, res) => {
    try {
      // Validate request body
      if (!req.body || !req.body.resourceType || req.body.resourceType !== 'Observation') {
        return res.status(400).json({
          resourceType: 'OperationOutcome',
          issue: [
            {
              severity: 'error',
              code: 'invalid',
              diagnostics: 'Invalid resource type. Expected Observation.'
            }
          ]
        });
      }
      
      // Create observation
      const observation = await FhirService.createObservation(req.body);
      
      // Log FHIR create
      AuditService.logFhirEvent({
        event_type: 'fhir_create',
        resource_type: 'Observation',
        resource_id: observation.id,
        user_id: req.user.id
      });
      
      res.status(201).json(observation);
    } catch (error) {
      console.error('Error creating observation:', error);
      res.status(error.status || 500).json({
        resourceType: 'OperationOutcome',
        issue: [
          {
            severity: 'error',
            code: 'exception',
            diagnostics: error.message || 'Failed to create observation'
          }
        ]
      });
    }
  }
);

/**
 * @route GET /api/fhir/MedicationRequest
 * @desc Search for medication requests
 * @access Private
 */
router.get('/MedicationRequest',
  authenticate,
  authorize(['doctor', 'pharmacist']),
  async (req, res) => {
    try {
      // Extract search parameters
      const searchParams = {
        patient: req.query.patient,
        status: req.query.status,
        authoredon: req.query.authoredon,
        _count: req.query._count || 10,
        _page: req.query._page || 1
      };
      
      // Search for medication requests
      const bundle = await FhirService.searchMedicationRequests(searchParams);
      
      // Log FHIR search
      AuditService.logFhirEvent({
        event_type: 'fhir_search',
        resource_type: 'MedicationRequest',
        user_id: req.user.id,
        search_criteria: searchParams
      });
      
      res.status(200).json(bundle);
    } catch (error) {
      console.error('Error searching medication requests:', error);
      res.status(error.status || 500).json({
        resourceType: 'OperationOutcome',
        issue: [
          {
            severity: 'error',
            code: 'exception',
            diagnostics: error.message || 'Failed to search medication requests'
          }
        ]
      });
    }
  }
);

/**
 * @route POST /api/fhir/MedicationRequest
 * @desc Create a new medication request
 * @access Private
 */
router.post('/MedicationRequest',
  authenticate,
  authorize(['doctor']),
  async (req, res) => {
    try {
      // Validate request body
      if (!req.body || !req.body.resourceType || req.body.resourceType !== 'MedicationRequest') {
        return res.status(400).json({
          resourceType: 'OperationOutcome',
          issue: [
            {
              severity: 'error',
              code: 'invalid',
              diagnostics: 'Invalid resource type. Expected MedicationRequest.'
            }
          ]
        });
      }
      
      // Create medication request
      const medicationRequest = await FhirService.createMedicationRequest(req.body);
      
      // Log FHIR create
      AuditService.logFhirEvent({
        event_type: 'fhir_create',
        resource_type: 'MedicationRequest',
        resource_id: medicationRequest.id,
        user_id: req.user.id
      });
      
      res.status(201).json(medicationRequest);
    } catch (error) {
      console.error('Error creating medication request:', error);
      res.status(error.status || 500).json({
        resourceType: 'OperationOutcome',
        issue: [
          {
            severity: 'error',
            code: 'exception',
            diagnostics: error.message || 'Failed to create medication request'
          }
        ]
      });
    }
  }
);

/**
 * @route GET /api/fhir/DocumentReference
 * @desc Search for document references
 * @access Private
 */
router.get('/DocumentReference',
  authenticate,
  authorize(['doctor', 'nurse', 'admin']),
  async (req, res) => {
    try {
      // Extract search parameters
      const searchParams = {
        patient: req.query.patient,
        type: req.query.type,
        date: req.query.date,
        status: req.query.status,
        _count: req.query._count || 10,
        _page: req.query._page || 1
      };
      
      // Search for document references
      const bundle = await FhirService.searchDocumentReferences(searchParams);
      
      // Log FHIR search
      AuditService.logFhirEvent({
        event_type: 'fhir_search',
        resource_type: 'DocumentReference',
        user_id: req.user.id,
        search_criteria: searchParams
      });
      
      res.status(200).json(bundle);
    } catch (error) {
      console.error('Error searching document references:', error);
      res.status(error.status || 500).json({
        resourceType: 'OperationOutcome',
        issue: [
          {
            severity: 'error',
            code: 'exception',
            diagnostics: error.message || 'Failed to search document references'
          }
        ]
      });
    }
  }
);

/**
 * @route POST /api/fhir/DocumentReference
 * @desc Create a new document reference
 * @access Private
 */
router.post('/DocumentReference',
  authenticate,
  authorize(['doctor', 'admin']),
  async (req, res) => {
    try {
      // Validate request body
      if (!req.body || !req.body.resourceType || req.body.resourceType !== 'DocumentReference') {
        return res.status(400).json({
          resourceType: 'OperationOutcome',
          issue: [
            {
              severity: 'error',
              code: 'invalid',
              diagnostics: 'Invalid resource type. Expected DocumentReference.'
            }
          ]
        });
      }
      
      // Create document reference
      const documentReference = await FhirService.createDocumentReference(req.body);
      
      // Log FHIR create
      AuditService.logFhirEvent({
        event_type: 'fhir_create',
        resource_type: 'DocumentReference',
        resource_id: documentReference.id,
        user_id: req.user.id
      });
      
      res.status(201).json(documentReference);
    } catch (error) {
      console.error('Error creating document reference:', error);
      res.status(error.status || 500).json({
        resourceType: 'OperationOutcome',
        issue: [
          {
            severity: 'error',
            code: 'exception',
            diagnostics: error.message || 'Failed to create document reference'
          }
        ]
      });
    }
  }
);

/**
 * @route GET /api/fhir/$export
 * @desc Export FHIR resources for cross-hospital sharing
 * @access Private
 */
router.get('/$export',
  authenticate,
  authorize(['admin', 'hospital_admin']),
  async (req, res) => {
    try {
      // Extract parameters
      const params = {
        _type: req.query._type,
        _since: req.query._since,
        patient: req.query.patient
      };
      
      // Start export operation
      const exportOperation = await FhirService.startExport(params);
      
      // Log FHIR export
      AuditService.logFhirEvent({
        event_type: 'fhir_export',
        user_id: req.user.id,
        export_params: params
      });
      
      // Set Content-Location header with the URL to check export status
      res.setHeader('Content-Location', `/api/fhir/$export-status/${exportOperation.id}`);
      
      res.status(202).end();
    } catch (error) {
      console.error('Error starting export:', error);
      res.status(error.status || 500).json({
        resourceType: 'OperationOutcome',
        issue: [
          {
            severity: 'error',
            code: 'exception',
            diagnostics: error.message || 'Failed to start export'
          }
        ]
      });
    }
  }
);

/**
 * @route GET /api/fhir/$export-status/:id
 * @desc Check status of an export operation
 * @access Private
 */
router.get('/$export-status/:id',
  authenticate,
  authorize(['admin', 'hospital_admin']),
  async (req, res) => {
    try {
      const exportId = req.params.id;
      
      // Get export status
      const exportStatus = await FhirService.getExportStatus(exportId);
      
      if (exportStatus.status === 'completed') {
        // Export is complete, return output URLs
        res.status(200).json({
          transactionTime: exportStatus.transactionTime,
          request: exportStatus.request,
          requiresAccessToken: true,
          output: exportStatus.output
        });
      } else if (exportStatus.status === 'in-progress') {
        // Export is still in progress
        res.setHeader('X-Progress', exportStatus.progress || '0');
        res.setHeader('Retry-After', '120');
        res.status(202).end();
      } else {
        // Export failed
        res.status(500).json({
          resourceType: 'OperationOutcome',
          issue: [
            {
              severity: 'error',
              code: 'exception',
              diagnostics: exportStatus.error || 'Export failed'
            }
          ]
        });
      }
    } catch (error) {
      console.error('Error checking export status:', error);
      res.status(error.status || 500).json({
        resourceType: 'OperationOutcome',
        issue: [
          {
            severity: 'error',
            code: 'exception',
            diagnostics: error.message || 'Failed to check export status'
          }
        ]
      });
    }
  }
);

/**
 * @route GET /api/fhir/$export-download/:id
 * @desc Download exported FHIR resources
 * @access Private
 */
router.get('/$export-download/:id',
  authenticate,
  authorize(['admin', 'hospital_admin']),
  async (req, res) => {
    try {
      const exportId = req.params.id;
      
      // Get export file
      const exportFile = await FhirService.getExportFile(exportId);
      
      // Log FHIR export download
      AuditService.logFhirEvent({
        event_type: 'fhir_export_download',
        user_id: req.user.id,
        export_id: exportId
      });
      
      // Set response headers
      res.setHeader('Content-Type', 'application/fhir+ndjson');
      res.setHeader('Content-Disposition', `attachment; filename=${exportId}.ndjson`);
      
      // Send file
      res.send(exportFile);
    } catch (error) {
      console.error('Error downloading export file:', error);
      res.status(error.status || 500).json({
        resourceType: 'OperationOutcome',
        issue: [
          {
            severity: 'error',
            code: 'exception',
            diagnostics: error.message || 'Failed to download export file'
          }
        ]
      });
    }
  }
);

/**
 * @route POST /api/fhir/$import
 * @desc Import FHIR resources from cross-hospital sharing
 * @access Private
 */
router.post('/$import',
  authenticate,
  authorize(['admin', 'hospital_admin']),
  async (req, res) => {
    try {
      // Validate request body
      const schema = Joi.object({
        inputFormat: Joi.string().required(),
        inputSource: Joi.object({
          type: Joi.string().required(),
          url: Joi.string().required(),
          accessToken: Joi.string().required()
        }).required(),
        storageDetail: Joi.object({
          type: Joi.string().required(),
          patientMapping: Joi.object().pattern(Joi.string(), Joi.string()).required()
        }).required()
      });
      
      const { error, value } = schema.validate(req.body);
      if (error) {
        return res.status(400).json({
          resourceType: 'OperationOutcome',
          issue: [
            {
              severity: 'error',
              code: 'invalid',
              diagnostics: error.details[0].message
            }
          ]
        });
      }
      
      // Start import operation
      const importOperation = await FhirService.startImport(value);
      
      // Log FHIR import
      AuditService.logFhirEvent({
        event_type: 'fhir_import',
        user_id: req.user.id,
        import_params: value
      });
      
      // Set Content-Location header with the URL to check import status
      res.setHeader('Content-Location', `/api/fhir/$import-status/${importOperation.id}`);
      
      res.status(202).end();
    } catch (error) {
      console.error('Error starting import:', error);
      res.status(error.status || 500).json({
        resourceType: 'OperationOutcome',
        issue: [
          {
            severity: 'error',
            code: 'exception',
            diagnostics: error.message || 'Failed to start import'
          }
        ]
      });
    }
  }
);

/**
 * @route GET /api/fhir/$import-status/:id
 * @desc Check status of an import operation
 * @access Private
 */
router.get('/$import-status/:id',
  authenticate,
  authorize(['admin', 'hospital_admin']),
  async (req, res) => {
    try {
      const importId = req.params.id;
      
      // Get import status
      const importStatus = await FhirService.getImportStatus(importId);
      
      if (importStatus.status === 'completed') {
        // Import is complete, return summary
        res.status(200).json({
          transactionTime: importStatus.transactionTime,
          request: importStatus.request,
          output: importStatus.output
        });
      } else if (importStatus.status === 'in-progress') {
        // Import is still in progress
        res.setHeader('X-Progress', importStatus.progress || '0');
        res.setHeader('Retry-After', '120');
        res.status(202).end();
      } else {
        // Import failed
        res.status(500).json({
          resourceType: 'OperationOutcome',
          issue: [
            {
              severity: 'error',
              code: 'exception',
              diagnostics: importStatus.error || 'Import failed'
            }
          ]
        });
      }
    } catch (error) {
      console.error('Error checking import status:', error);
      res.status(error.status || 500).json({
        resourceType: 'OperationOutcome',
        issue: [
          {
            severity: 'error',
            code: 'exception',
            diagnostics: error.message || 'Failed to check import status'
          }
        ]
      });
    }
  }
);

module.exports = router;