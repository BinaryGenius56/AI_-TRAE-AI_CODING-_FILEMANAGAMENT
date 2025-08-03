/**
 * DICOM Controller
 * Handles API endpoints for DICOM medical imaging
 */

const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const Joi = require('joi');
const { v4: uuidv4 } = require('uuid');
const DicomService = require('../services/DicomService');
const PatientService = require('../services/PatientService');
const AuditService = require('../services/AuditService');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

// Configure multer for DICOM file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, DicomService.tempDir);
  },
  filename: (req, file, cb) => {
    cb(null, `${uuidv4()}${path.extname(file.originalname)}`);
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: DicomService.maxFileSize
  },
  fileFilter: (req, file, cb) => {
    // Accept DICOM files and common image formats that might contain DICOM data
    const filetypes = /dcm|dicom|ima|img/;
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = filetypes.test(file.mimetype);
    
    if (extname || mimetype || file.mimetype === 'application/octet-stream') {
      return cb(null, true);
    }
    
    cb(new Error('Only DICOM files are allowed'));
  }
});

/**
 * @route GET /api/dicom/studies
 * @desc Search for DICOM studies
 * @access Private (Doctor, Radiologist)
 */
router.get('/studies',
  authenticate,
  authorize(['doctor', 'radiologist']),
  async (req, res) => {
    try {
      // Get query parameters
      const query = {
        patientId: req.query.patient_id,
        patientName: req.query.patient_name,
        modality: req.query.modality,
        studyDate: req.query.study_date,
        limit: parseInt(req.query.limit) || 10,
        offset: parseInt(req.query.offset) || 0
      };
      
      // Search for studies
      const studies = await DicomService.searchStudies(query);
      
      // Log DICOM search
      AuditService.logDicomEvent({
        event_type: 'dicom_search',
        user_id: req.user.id,
        search_criteria: query
      });
      
      res.status(200).json({
        success: true,
        data: studies
      });
    } catch (error) {
      console.error('Error searching DICOM studies:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to search DICOM studies'
      });
    }
  }
);

/**
 * @route GET /api/dicom/studies/:studyInstanceUID
 * @desc Get DICOM study metadata
 * @access Private (Doctor, Radiologist)
 */
router.get('/studies/:studyInstanceUID',
  authenticate,
  authorize(['doctor', 'radiologist']),
  async (req, res) => {
    try {
      const studyInstanceUID = req.params.studyInstanceUID;
      
      // Get study metadata
      const studyMetadata = await DicomService.getStudyMetadata(studyInstanceUID);
      
      // Log DICOM study access
      AuditService.logDicomEvent({
        event_type: 'dicom_study_access',
        user_id: req.user.id,
        study_instance_uid: studyInstanceUID
      });
      
      res.status(200).json({
        success: true,
        data: studyMetadata
      });
    } catch (error) {
      console.error('Error getting DICOM study metadata:', error);
      res.status(error.status || 500).json({
        success: false,
        error: error.message || 'Failed to get DICOM study metadata'
      });
    }
  }
);

/**
 * @route GET /api/dicom/studies/:studyInstanceUID/series/:seriesInstanceUID
 * @desc Get DICOM series metadata
 * @access Private (Doctor, Radiologist)
 */
router.get('/studies/:studyInstanceUID/series/:seriesInstanceUID',
  authenticate,
  authorize(['doctor', 'radiologist']),
  async (req, res) => {
    try {
      const studyInstanceUID = req.params.studyInstanceUID;
      const seriesInstanceUID = req.params.seriesInstanceUID;
      
      // Get series metadata
      const seriesMetadata = await DicomService.getSeriesMetadata(studyInstanceUID, seriesInstanceUID);
      
      // Log DICOM series access
      AuditService.logDicomEvent({
        event_type: 'dicom_series_access',
        user_id: req.user.id,
        study_instance_uid: studyInstanceUID,
        series_instance_uid: seriesInstanceUID
      });
      
      res.status(200).json({
        success: true,
        data: seriesMetadata
      });
    } catch (error) {
      console.error('Error getting DICOM series metadata:', error);
      res.status(error.status || 500).json({
        success: false,
        error: error.message || 'Failed to get DICOM series metadata'
      });
    }
  }
);

/**
 * @route GET /api/dicom/studies/:studyInstanceUID/series/:seriesInstanceUID/instances/:sopInstanceUID
 * @desc Get DICOM instance
 * @access Private (Doctor, Radiologist)
 */
router.get('/studies/:studyInstanceUID/series/:seriesInstanceUID/instances/:sopInstanceUID',
  authenticate,
  authorize(['doctor', 'radiologist']),
  async (req, res) => {
    try {
      const studyInstanceUID = req.params.studyInstanceUID;
      const seriesInstanceUID = req.params.seriesInstanceUID;
      const sopInstanceUID = req.params.sopInstanceUID;
      
      // Get DICOM instance
      const dicomData = await DicomService.retrieveDicomFile(
        studyInstanceUID,
        seriesInstanceUID,
        sopInstanceUID,
        req.user.id
      );
      
      // Set response headers
      res.setHeader('Content-Type', 'application/dicom');
      res.setHeader('Content-Disposition', `attachment; filename=${sopInstanceUID}.dcm`);
      
      // Send file
      res.send(dicomData);
    } catch (error) {
      console.error('Error getting DICOM instance:', error);
      res.status(error.status || 500).json({
        success: false,
        error: error.message || 'Failed to get DICOM instance'
      });
    }
  }
);

/**
 * @route POST /api/dicom/upload
 * @desc Upload DICOM file
 * @access Private (Doctor, Radiologist, Technician)
 */
router.post('/upload',
  authenticate,
  authorize(['doctor', 'radiologist', 'technician']),
  upload.single('dicomFile'),
  async (req, res) => {
    try {
      // Validate request body
      const schema = Joi.object({
        patient_id: Joi.string().required(),
        study_description: Joi.string().allow('', null),
        modality: Joi.string().allow('', null),
        study_date: Joi.string().isoDate().allow('', null)
      });
      
      const { error, value } = schema.validate(req.body);
      if (error) {
        // Remove uploaded file
        if (req.file) {
          fs.unlinkSync(req.file.path);
        }
        
        return res.status(400).json({
          success: false,
          error: error.details[0].message
        });
      }
      
      // Check if file was uploaded
      if (!req.file) {
        return res.status(400).json({
          success: false,
          error: 'No DICOM file uploaded'
        });
      }
      
      // Read file data
      const fileData = fs.readFileSync(req.file.path);
      
      // Extract metadata from file (placeholder for actual implementation)
      // In a real implementation, this would use a DICOM parsing library
      const metadata = {
        studyInstanceUID: uuidv4(),
        seriesInstanceUID: uuidv4(),
        sopInstanceUID: uuidv4(),
        modality: value.modality || 'OT', // Other
        studyDate: value.study_date || new Date().toISOString().split('T')[0],
        studyDescription: value.study_description || 'Uploaded study'
      };
      
      // Store DICOM file
      const dicomRecord = await DicomService.storeDicomFile(
        fileData,
        metadata,
        value.patient_id,
        req.user.id
      );
      
      // Remove temporary file
      fs.unlinkSync(req.file.path);
      
      res.status(201).json({
        success: true,
        data: dicomRecord
      });
    } catch (error) {
      console.error('Error uploading DICOM file:', error);
      
      // Remove uploaded file if it exists
      if (req.file) {
        fs.unlinkSync(req.file.path);
      }
      
      res.status(error.status || 500).json({
        success: false,
        error: error.message || 'Failed to upload DICOM file'
      });
    }
  }
);

/**
 * @route DELETE /api/dicom/studies/:studyInstanceUID/series/:seriesInstanceUID/instances/:sopInstanceUID
 * @desc Delete DICOM instance
 * @access Private (Admin, Hospital Admin)
 */
router.delete('/studies/:studyInstanceUID/series/:seriesInstanceUID/instances/:sopInstanceUID',
  authenticate,
  authorize(['admin', 'hospital_admin']),
  async (req, res) => {
    try {
      const studyInstanceUID = req.params.studyInstanceUID;
      const seriesInstanceUID = req.params.seriesInstanceUID;
      const sopInstanceUID = req.params.sopInstanceUID;
      
      // Delete DICOM instance
      await DicomService.deleteDicomInstance(
        studyInstanceUID,
        seriesInstanceUID,
        sopInstanceUID,
        req.user.id
      );
      
      res.status(200).json({
        success: true,
        message: 'DICOM instance deleted successfully'
      });
    } catch (error) {
      console.error('Error deleting DICOM instance:', error);
      res.status(error.status || 500).json({
        success: false,
        error: error.message || 'Failed to delete DICOM instance'
      });
    }
  }
);

/**
 * @route POST /api/dicom/export/:studyInstanceUID
 * @desc Export DICOM study for cross-hospital sharing
 * @access Private (Doctor, Radiologist, Hospital Admin)
 */
router.post('/export/:studyInstanceUID',
  authenticate,
  authorize(['doctor', 'radiologist', 'hospital_admin']),
  async (req, res) => {
    try {
      const studyInstanceUID = req.params.studyInstanceUID;
      
      // Export DICOM study
      const exportData = await DicomService.exportDicomData(
        studyInstanceUID,
        req.user.id
      );
      
      res.status(200).json({
        success: true,
        data: exportData
      });
    } catch (error) {
      console.error('Error exporting DICOM study:', error);
      res.status(error.status || 500).json({
        success: false,
        error: error.message || 'Failed to export DICOM study'
      });
    }
  }
);

/**
 * @route POST /api/dicom/import
 * @desc Import DICOM study from cross-hospital sharing
 * @access Private (Doctor, Radiologist, Hospital Admin)
 */
router.post('/import',
  authenticate,
  authorize(['doctor', 'radiologist', 'hospital_admin']),
  upload.array('dicomFiles', 100),
  async (req, res) => {
    try {
      // Validate request body
      const schema = Joi.object({
        patient_id: Joi.string().required(),
        export_data: Joi.string().required()
      });
      
      const { error, value } = schema.validate(req.body);
      if (error) {
        // Remove uploaded files
        if (req.files) {
          for (const file of req.files) {
            fs.unlinkSync(file.path);
          }
        }
        
        return res.status(400).json({
          success: false,
          error: error.details[0].message
        });
      }
      
      // Check if files were uploaded
      if (!req.files || req.files.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'No DICOM files uploaded'
        });
      }
      
      // Parse export data
      let exportData;
      try {
        exportData = JSON.parse(value.export_data);
      } catch (e) {
        // Remove uploaded files
        for (const file of req.files) {
          fs.unlinkSync(file.path);
        }
        
        return res.status(400).json({
          success: false,
          error: 'Invalid export data format'
        });
      }
      
      // Prepare DICOM files
      const dicomFiles = [];
      for (const file of req.files) {
        dicomFiles.push({
          data: fs.readFileSync(file.path),
          series_instance_uid: file.originalname.split('.')[0], // Assuming filename is SOP Instance UID
          sop_instance_uid: file.originalname.split('.')[0]
        });
      }
      
      // Import DICOM files
      const importResult = await DicomService.importDicomData(
        exportData,
        dicomFiles,
        value.patient_id,
        req.user.id
      );
      
      // Remove temporary files
      for (const file of req.files) {
        fs.unlinkSync(file.path);
      }
      
      res.status(200).json({
        success: true,
        data: importResult
      });
    } catch (error) {
      console.error('Error importing DICOM study:', error);
      
      // Remove uploaded files if they exist
      if (req.files) {
        for (const file of req.files) {
          fs.unlinkSync(file.path);
        }
      }
      
      res.status(error.status || 500).json({
        success: false,
        error: error.message || 'Failed to import DICOM study'
      });
    }
  }
);

module.exports = router;