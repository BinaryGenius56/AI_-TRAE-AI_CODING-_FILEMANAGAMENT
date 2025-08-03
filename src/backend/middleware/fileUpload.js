/**
 * File Upload Middleware
 * Handles file uploads using multer with configurable storage and validation
 */

const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { ApiError } = require('./errorHandler');

// Ensure upload directories exist
const createUploadDirs = () => {
  const baseDir = process.env.UPLOAD_DIR || path.join(process.cwd(), 'uploads');
  const dirs = [
    baseDir,
    path.join(baseDir, 'documents'),
    path.join(baseDir, 'images'),
    path.join(baseDir, 'dicom'),
    path.join(baseDir, 'temp')
  ];
  
  dirs.forEach(dir => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  });
  
  return baseDir;
};

// Create upload directories
const baseUploadDir = createUploadDirs();

/**
 * Generate a secure filename
 * @param {String} originalname - Original filename
 * @returns {String} - Secure filename
 */
const generateSecureFilename = (originalname) => {
  const timestamp = Date.now();
  const randomString = crypto.randomBytes(8).toString('hex');
  const extension = path.extname(originalname);
  const sanitizedName = path.basename(originalname, extension)
    .replace(/[^a-zA-Z0-9]/g, '_')
    .substring(0, 50);
  
  return `${sanitizedName}_${timestamp}_${randomString}${extension}`;
};

/**
 * Configure multer storage
 * @param {String} subdir - Subdirectory for uploads
 * @returns {Object} - Multer storage configuration
 */
const configureStorage = (subdir = 'temp') => {
  return multer.diskStorage({
    destination: (req, file, cb) => {
      const uploadPath = path.join(baseUploadDir, subdir);
      cb(null, uploadPath);
    },
    filename: (req, file, cb) => {
      cb(null, generateSecureFilename(file.originalname));
    }
  });
};

/**
 * File type validators
 */
const fileValidators = {
  // Image file validator
  image: (file) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'];
    if (!allowedTypes.includes(file.mimetype)) {
      return false;
    }
    return true;
  },
  
  // Document file validator
  document: (file) => {
    const allowedTypes = [
      'application/pdf', 
      'application/msword', 
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'text/plain',
      'text/csv'
    ];
    if (!allowedTypes.includes(file.mimetype)) {
      return false;
    }
    return true;
  },
  
  // DICOM file validator
  dicom: (file) => {
    // DICOM files typically have .dcm extension or application/dicom mimetype
    const isDicomExtension = file.originalname.toLowerCase().endsWith('.dcm');
    const isDicomMimetype = file.mimetype === 'application/dicom';
    
    return isDicomExtension || isDicomMimetype;
  },
  
  // Any file validator (with size limit)
  any: () => true
};

/**
 * File filter factory
 * @param {Function} validator - File validator function
 * @param {String} errorMessage - Error message for invalid files
 * @returns {Function} - Multer file filter function
 */
const createFileFilter = (validator, errorMessage) => {
  return (req, file, cb) => {
    if (validator(file)) {
      cb(null, true);
    } else {
      cb(new ApiError(400, errorMessage), false);
    }
  };
};

/**
 * Create upload middleware
 * @param {Object} options - Upload options
 * @returns {Function} - Multer middleware
 */
const createUploadMiddleware = (options = {}) => {
  const {
    type = 'any',
    subdir = 'temp',
    maxSize = parseInt(process.env.UPLOAD_MAX_SIZE || '10') * 1024 * 1024, // Default 10MB
    maxFiles = parseInt(process.env.UPLOAD_MAX_FILES || '5'),
    fieldName = 'file'
  } = options;
  
  // Get validator and error message based on type
  const validator = fileValidators[type] || fileValidators.any;
  const errorMessage = `Invalid file type. Only ${type} files are allowed.`;
  
  // Configure multer
  const upload = multer({
    storage: configureStorage(subdir),
    limits: {
      fileSize: maxSize,
      files: maxFiles
    },
    fileFilter: createFileFilter(validator, errorMessage)
  });
  
  // Return appropriate middleware based on maxFiles
  if (maxFiles === 1) {
    return upload.single(fieldName);
  } else {
    return upload.array(fieldName, maxFiles);
  }
};

/**
 * Predefined upload middleware configurations
 */
const uploads = {
  // Document upload middleware
  document: createUploadMiddleware({
    type: 'document',
    subdir: 'documents',
    maxSize: parseInt(process.env.DOCUMENT_UPLOAD_MAX_SIZE || '25') * 1024 * 1024, // Default 25MB
    fieldName: 'document'
  }),
  
  // Image upload middleware
  image: createUploadMiddleware({
    type: 'image',
    subdir: 'images',
    maxSize: parseInt(process.env.IMAGE_UPLOAD_MAX_SIZE || '5') * 1024 * 1024, // Default 5MB
    fieldName: 'image'
  }),
  
  // DICOM upload middleware
  dicom: createUploadMiddleware({
    type: 'dicom',
    subdir: 'dicom',
    maxSize: parseInt(process.env.DICOM_UPLOAD_MAX_SIZE || '100') * 1024 * 1024, // Default 100MB
    fieldName: 'dicom'
  }),
  
  // Multiple documents upload middleware
  multipleDocuments: createUploadMiddleware({
    type: 'document',
    subdir: 'documents',
    maxSize: parseInt(process.env.DOCUMENT_UPLOAD_MAX_SIZE || '25') * 1024 * 1024, // Default 25MB
    maxFiles: parseInt(process.env.DOCUMENT_UPLOAD_MAX_FILES || '10'), // Default 10 files
    fieldName: 'documents'
  }),
  
  // Multiple images upload middleware
  multipleImages: createUploadMiddleware({
    type: 'image',
    subdir: 'images',
    maxSize: parseInt(process.env.IMAGE_UPLOAD_MAX_SIZE || '5') * 1024 * 1024, // Default 5MB
    maxFiles: parseInt(process.env.IMAGE_UPLOAD_MAX_FILES || '10'), // Default 10 files
    fieldName: 'images'
  }),
  
  // Multiple DICOM upload middleware
  multipleDicom: createUploadMiddleware({
    type: 'dicom',
    subdir: 'dicom',
    maxSize: parseInt(process.env.DICOM_UPLOAD_MAX_SIZE || '100') * 1024 * 1024, // Default 100MB
    maxFiles: parseInt(process.env.DICOM_UPLOAD_MAX_FILES || '20'), // Default 20 files
    fieldName: 'dicom_files'
  })
};

module.exports = {
  createUploadMiddleware,
  uploads,
  generateSecureFilename,
  baseUploadDir
};