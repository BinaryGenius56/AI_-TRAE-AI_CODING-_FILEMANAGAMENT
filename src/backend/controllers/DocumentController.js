/**
 * Document Controller
 * Handles all document-related API endpoints including uploads, retrieval, and AI validation
 */

const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const documentService = require('../services/DocumentService');
const authMiddleware = require('../middleware/authMiddleware');
const rbacMiddleware = require('../middleware/rbacMiddleware');
const auditService = require('../services/AuditService');
const aiService = require('../services/AIService');

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../../uploads/documents');
    // Create directory if it doesn't exist
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    // Generate unique filename with original extension
    const uniqueId = uuidv4();
    const fileExt = path.extname(file.originalname);
    cb(null, `${uniqueId}${fileExt}`);
  }
});

// File filter to restrict file types
const fileFilter = (req, file, cb) => {
  // Accept only specific file types
  const allowedTypes = [
    'application/pdf', // PDF
    'image/jpeg', // JPEG
    'image/png', // PNG
    'application/dicom', // DICOM
    'application/octet-stream' // For DICOM files sometimes
  ];
  
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only PDF, JPEG, PNG, and DICOM files are allowed.'), false);
  }
};

const upload = multer({ 
  storage, 
  fileFilter,
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB file size limit
});

/**
 * @route GET /api/documents
 * @desc Get all documents with pagination and filtering
 * @access Private
 */
router.get('/', authMiddleware, async (req, res) => {
  try {
    const { 
      patientId, 
      type, 
      status, 
      dateFrom, 
      dateTo, 
      searchTerm,
      page = 1, 
      limit = 10 
    } = req.query;
    
    // Check if user has access to the patient's documents
    if (patientId) {
      const hasAccess = await documentService.checkPatientAccess(req.user.id, patientId);
      if (!hasAccess) {
        return res.status(403).json({ message: 'Access denied to this patient\'s documents' });
      }
    }
    
    const filters = {
      patientId,
      type,
      status,
      dateFrom: dateFrom ? new Date(dateFrom) : null,
      dateTo: dateTo ? new Date(dateTo) : null,
      searchTerm
    };
    
    const documents = await documentService.getDocuments(filters, page, limit);
    
    // Log the document access
    await auditService.logActivity({
      userId: req.user.id,
      action: 'READ',
      resourceType: 'DOCUMENT',
      resourceId: null, // No specific document
      details: `Retrieved documents list with filters: ${JSON.stringify(filters)}`
    });
    
    res.json(documents);
  } catch (error) {
    console.error('Error fetching documents:', error);
    res.status(500).json({ message: 'Failed to fetch documents', error: error.message });
  }
});

/**
 * @route GET /api/documents/:id
 * @desc Get a document by ID
 * @access Private
 */
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const documentId = req.params.id;
    const document = await documentService.getDocumentById(documentId);
    
    if (!document) {
      return res.status(404).json({ message: 'Document not found' });
    }
    
    // Check if user has access to the patient's documents
    const hasAccess = await documentService.checkPatientAccess(req.user.id, document.patientId);
    if (!hasAccess) {
      return res.status(403).json({ message: 'Access denied to this document' });
    }
    
    // Log the document access
    await auditService.logActivity({
      userId: req.user.id,
      action: 'READ',
      resourceType: 'DOCUMENT',
      resourceId: documentId,
      details: `Viewed document: ${document.title}`
    });
    
    res.json(document);
  } catch (error) {
    console.error('Error fetching document:', error);
    res.status(500).json({ message: 'Failed to fetch document', error: error.message });
  }
});

/**
 * @route POST /api/documents
 * @desc Upload a new document
 * @access Private
 */
router.post('/', authMiddleware, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }
    
    const { patientId, title, type, tags } = req.body;
    
    if (!patientId || !title || !type) {
      return res.status(400).json({ message: 'Missing required fields: patientId, title, and type are required' });
    }
    
    // Check if user has access to the patient's documents
    const hasAccess = await documentService.checkPatientAccess(req.user.id, patientId);
    if (!hasAccess) {
      // Delete the uploaded file
      fs.unlinkSync(req.file.path);
      return res.status(403).json({ message: 'Access denied to this patient\'s documents' });
    }
    
    // Process tags if provided
    const parsedTags = tags ? JSON.parse(tags) : [];
    
    // Create document record
    const documentData = {
      patientId,
      title,
      type,
      fileType: path.extname(req.file.originalname).substring(1),
      filePath: req.file.path,
      fileSize: req.file.size,
      originalFilename: req.file.originalname,
      uploadedBy: req.user.id,
      tags: parsedTags,
      status: 'processing'
    };
    
    const document = await documentService.createDocument(documentData);
    
    // Log the document upload
    await auditService.logActivity({
      userId: req.user.id,
      action: 'CREATE',
      resourceType: 'DOCUMENT',
      resourceId: document.id,
      details: `Uploaded document: ${document.title} for patient ${patientId}`
    });
    
    // Start AI processing asynchronously
    aiService.processDocument(document.id, req.file.path)
      .then(async (aiResults) => {
        // Update document with AI processing results
        await documentService.updateDocument(document.id, {
          status: aiResults.status,
          aiProcessed: true,
          aiFindings: aiResults.findings
        });
        
        // Log the AI processing completion
        await auditService.logActivity({
          userId: 'SYSTEM',
          action: 'UPDATE',
          resourceType: 'DOCUMENT',
          resourceId: document.id,
          details: `AI processing completed for document: ${document.title} with status: ${aiResults.status}`
        });
      })
      .catch(async (error) => {
        console.error('AI processing error:', error);
        // Update document with error status
        await documentService.updateDocument(document.id, {
          status: 'error',
          aiProcessed: true,
          aiFindings: { error: error.message }
        });
        
        // Log the AI processing error
        await auditService.logActivity({
          userId: 'SYSTEM',
          action: 'ERROR',
          resourceType: 'DOCUMENT',
          resourceId: document.id,
          details: `AI processing failed for document: ${document.title} with error: ${error.message}`
        });
      });
    
    // Return the document data immediately, without waiting for AI processing
    res.status(201).json(document);
  } catch (error) {
    console.error('Error uploading document:', error);
    // Delete the uploaded file if it exists
    if (req.file && req.file.path) {
      fs.unlinkSync(req.file.path);
    }
    res.status(500).json({ message: 'Failed to upload document', error: error.message });
  }
});

/**
 * @route GET /api/documents/:id/versions
 * @desc Get all versions of a document
 * @access Private
 */
router.get('/:id/versions', authMiddleware, async (req, res) => {
  try {
    const documentId = req.params.id;
    const document = await documentService.getDocumentById(documentId);
    
    if (!document) {
      return res.status(404).json({ message: 'Document not found' });
    }
    
    // Check if user has access to the patient's documents
    const hasAccess = await documentService.checkPatientAccess(req.user.id, document.patientId);
    if (!hasAccess) {
      return res.status(403).json({ message: 'Access denied to this document' });
    }
    
    const versions = await documentService.getDocumentVersions(documentId);
    
    // Log the access to document versions
    await auditService.logActivity({
      userId: req.user.id,
      action: 'READ',
      resourceType: 'DOCUMENT_VERSION',
      resourceId: documentId,
      details: `Viewed versions of document: ${document.title}`
    });
    
    res.json(versions);
  } catch (error) {
    console.error('Error fetching document versions:', error);
    res.status(500).json({ message: 'Failed to fetch document versions', error: error.message });
  }
});

/**
 * @route POST /api/documents/:id/versions
 * @desc Upload a new version of a document
 * @access Private
 */
router.post('/:id/versions', authMiddleware, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }
    
    const documentId = req.params.id;
    const document = await documentService.getDocumentById(documentId);
    
    if (!document) {
      // Delete the uploaded file
      fs.unlinkSync(req.file.path);
      return res.status(404).json({ message: 'Document not found' });
    }
    
    // Check if user has access to the patient's documents
    const hasAccess = await documentService.checkPatientAccess(req.user.id, document.patientId);
    if (!hasAccess) {
      // Delete the uploaded file
      fs.unlinkSync(req.file.path);
      return res.status(403).json({ message: 'Access denied to this document' });
    }
    
    // Create new version
    const versionData = {
      documentId,
      filePath: req.file.path,
      fileSize: req.file.size,
      originalFilename: req.file.originalname,
      uploadedBy: req.user.id,
      status: 'processing'
    };
    
    const version = await documentService.createDocumentVersion(versionData);
    
    // Log the document version upload
    await auditService.logActivity({
      userId: req.user.id,
      action: 'CREATE',
      resourceType: 'DOCUMENT_VERSION',
      resourceId: `${documentId}/${version.version}`,
      details: `Uploaded new version (${version.version}) of document: ${document.title}`
    });
    
    // Start AI processing asynchronously
    aiService.processDocument(documentId, req.file.path, version.id)
      .then(async (aiResults) => {
        // Update version with AI processing results
        await documentService.updateDocumentVersion(version.id, {
          status: aiResults.status,
          aiProcessed: true,
          aiFindings: aiResults.findings
        });
        
        // Log the AI processing completion
        await auditService.logActivity({
          userId: 'SYSTEM',
          action: 'UPDATE',
          resourceType: 'DOCUMENT_VERSION',
          resourceId: `${documentId}/${version.version}`,
          details: `AI processing completed for document version: ${document.title} (v${version.version}) with status: ${aiResults.status}`
        });
      })
      .catch(async (error) => {
        console.error('AI processing error:', error);
        // Update version with error status
        await documentService.updateDocumentVersion(version.id, {
          status: 'error',
          aiProcessed: true,
          aiFindings: { error: error.message }
        });
        
        // Log the AI processing error
        await auditService.logActivity({
          userId: 'SYSTEM',
          action: 'ERROR',
          resourceType: 'DOCUMENT_VERSION',
          resourceId: `${documentId}/${version.version}`,
          details: `AI processing failed for document version: ${document.title} (v${version.version}) with error: ${error.message}`
        });
      });
    
    // Return the version data immediately, without waiting for AI processing
    res.status(201).json(version);
  } catch (error) {
    console.error('Error uploading document version:', error);
    // Delete the uploaded file if it exists
    if (req.file && req.file.path) {
      fs.unlinkSync(req.file.path);
    }
    res.status(500).json({ message: 'Failed to upload document version', error: error.message });
  }
});

/**
 * @route DELETE /api/documents/:id
 * @desc Soft delete a document
 * @access Private
 */
router.delete('/:id', authMiddleware, rbacMiddleware(['admin', 'doctor']), async (req, res) => {
  try {
    const documentId = req.params.id;
    const document = await documentService.getDocumentById(documentId);
    
    if (!document) {
      return res.status(404).json({ message: 'Document not found' });
    }
    
    // Check if user has access to the patient's documents
    const hasAccess = await documentService.checkPatientAccess(req.user.id, document.patientId);
    if (!hasAccess) {
      return res.status(403).json({ message: 'Access denied to this document' });
    }
    
    // Soft delete the document
    await documentService.softDeleteDocument(documentId, req.user.id);
    
    // Log the document deletion
    await auditService.logActivity({
      userId: req.user.id,
      action: 'DELETE',
      resourceType: 'DOCUMENT',
      resourceId: documentId,
      details: `Soft deleted document: ${document.title}`
    });
    
    res.json({ message: 'Document deleted successfully' });
  } catch (error) {
    console.error('Error deleting document:', error);
    res.status(500).json({ message: 'Failed to delete document', error: error.message });
  }
});

/**
 * @route GET /api/documents/download/:id
 * @desc Download a document
 * @access Private
 */
router.get('/download/:id', authMiddleware, async (req, res) => {
  try {
    const documentId = req.params.id;
    const versionId = req.query.versionId; // Optional version ID
    
    const document = await documentService.getDocumentById(documentId);
    
    if (!document) {
      return res.status(404).json({ message: 'Document not found' });
    }
    
    // Check if user has access to the patient's documents
    const hasAccess = await documentService.checkPatientAccess(req.user.id, document.patientId);
    if (!hasAccess) {
      return res.status(403).json({ message: 'Access denied to this document' });
    }
    
    // Get the file path (either specific version or latest)
    let filePath;
    if (versionId) {
      const version = await documentService.getDocumentVersionById(versionId);
      if (!version || version.documentId !== documentId) {
        return res.status(404).json({ message: 'Document version not found' });
      }
      filePath = version.filePath;
    } else {
      filePath = document.filePath;
    }
    
    // Check if file exists
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ message: 'Document file not found' });
    }
    
    // Log the document download
    await auditService.logActivity({
      userId: req.user.id,
      action: 'DOWNLOAD',
      resourceType: 'DOCUMENT',
      resourceId: documentId,
      details: `Downloaded document: ${document.title}${versionId ? ` (version: ${versionId})` : ''}`
    });
    
    // Send the file
    res.download(filePath, document.originalFilename);
  } catch (error) {
    console.error('Error downloading document:', error);
    res.status(500).json({ message: 'Failed to download document', error: error.message });
  }
});

/**
 * @route GET /api/documents/preview/:id
 * @desc Preview a document (for DICOM, PDF, images)
 * @access Private
 */
router.get('/preview/:id', authMiddleware, async (req, res) => {
  try {
    const documentId = req.params.id;
    const versionId = req.query.versionId; // Optional version ID
    
    const document = await documentService.getDocumentById(documentId);
    
    if (!document) {
      return res.status(404).json({ message: 'Document not found' });
    }
    
    // Check if user has access to the patient's documents
    const hasAccess = await documentService.checkPatientAccess(req.user.id, document.patientId);
    if (!hasAccess) {
      return res.status(403).json({ message: 'Access denied to this document' });
    }
    
    // Get the file path (either specific version or latest)
    let filePath;
    if (versionId) {
      const version = await documentService.getDocumentVersionById(versionId);
      if (!version || version.documentId !== documentId) {
        return res.status(404).json({ message: 'Document version not found' });
      }
      filePath = version.filePath;
    } else {
      filePath = document.filePath;
    }
    
    // Check if file exists
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ message: 'Document file not found' });
    }
    
    // Log the document preview
    await auditService.logActivity({
      userId: req.user.id,
      action: 'PREVIEW',
      resourceType: 'DOCUMENT',
      resourceId: documentId,
      details: `Previewed document: ${document.title}${versionId ? ` (version: ${versionId})` : ''}`
    });
    
    // For DICOM files, we would need a specialized handler
    // For now, we'll just send the file for download or inline viewing
    const fileType = document.fileType.toLowerCase();
    
    if (fileType === 'pdf') {
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="${document.originalFilename}"`);
    } else if (['jpg', 'jpeg', 'png'].includes(fileType)) {
      res.setHeader('Content-Type', `image/${fileType}`);
      res.setHeader('Content-Disposition', `inline; filename="${document.originalFilename}"`);
    } else if (fileType === 'dicom' || fileType === 'dcm') {
      // For DICOM, we might need a specialized viewer or conversion
      // For now, just download it
      return res.download(filePath, document.originalFilename);
    } else {
      // For other file types, download
      return res.download(filePath, document.originalFilename);
    }
    
    // Stream the file
    fs.createReadStream(filePath).pipe(res);
  } catch (error) {
    console.error('Error previewing document:', error);
    res.status(500).json({ message: 'Failed to preview document', error: error.message });
  }
});

module.exports = router;