/**
 * AI Service
 * Handles document processing, OCR, validation, and anomaly detection
 */

const fs = require('fs');
const path = require('path');
const { createWorker } = require('tesseract.js'); // For OCR
const { PDFDocument } = require('pdf-lib'); // For PDF processing
const dicomParser = require('dicom-parser'); // For DICOM processing
const documentService = require('./DocumentService');
const patientService = require('./PatientService');

class AIService {
  /**
   * Process a document with AI validation
   * @param {string} documentId - Document ID
   * @param {string} filePath - Path to the document file
   * @param {string} versionId - Optional version ID if processing a version
   * @returns {Promise<Object>} - AI processing results
   */
  async processDocument(documentId, filePath, versionId = null) {
    try {
      // Get document details
      const document = await documentService.getDocumentById(documentId);
      if (!document) {
        throw new Error('Document not found');
      }
      
      // Get patient details
      const patient = await patientService.getPatientById(document.patientId);
      if (!patient) {
        throw new Error('Patient not found');
      }
      
      // Determine file type and process accordingly
      const fileType = path.extname(filePath).toLowerCase();
      let extractedText = '';
      let extractedData = {};
      
      if (fileType === '.pdf') {
        extractedText = await this.processPdf(filePath);
      } else if (['.jpg', '.jpeg', '.png'].includes(fileType)) {
        extractedText = await this.processImage(filePath);
      } else if (['.dcm', '.dicom'].includes(fileType)) {
        extractedData = await this.processDicom(filePath);
        extractedText = extractedData.text || '';
      } else {
        // Unsupported file type
        return {
          status: 'warning',
          findings: {
            error: 'Unsupported file type for AI processing',
            patientNameMatch: null,
            patientDobMatch: null,
            scanDateDetected: null,
            physicianDetected: null,
            keyFindings: []
          }
        };
      }
      
      // Extract and validate information
      const validationResults = await this.validateDocumentContent(
        extractedText,
        extractedData,
        patient,
        document.type
      );
      
      return validationResults;
    } catch (error) {
      console.error('Error in processDocument:', error);
      return {
        status: 'error',
        findings: {
          error: error.message,
          patientNameMatch: null,
          patientDobMatch: null,
          scanDateDetected: null,
          physicianDetected: null,
          keyFindings: []
        }
      };
    }
  }
  
  /**
   * Process PDF document with OCR
   * @param {string} filePath - Path to PDF file
   * @returns {Promise<string>} - Extracted text
   */
  async processPdf(filePath) {
    try {
      // Read PDF file
      const pdfBytes = fs.readFileSync(filePath);
      const pdfDoc = await PDFDocument.load(pdfBytes);
      
      // Get number of pages
      const pageCount = pdfDoc.getPageCount();
      
      // For simplicity, we'll only process the first page in this example
      // In a real implementation, you might want to process all pages
      
      // Extract text using OCR (in a real implementation, you might use a PDF text extraction library)
      const worker = await createWorker();
      
      // Convert first page to image and perform OCR
      // This is a simplified approach - in a real implementation, you'd use a PDF renderer
      // For now, we'll simulate this process
      
      await worker.loadLanguage('eng');
      await worker.initialize('eng');
      
      // In a real implementation, you would render the PDF page to an image
      // and then perform OCR on that image
      // For this example, we'll simulate OCR results
      
      const simulatedOcrResult = await worker.recognize(filePath);
      const extractedText = simulatedOcrResult.data.text;
      
      await worker.terminate();
      
      return extractedText;
    } catch (error) {
      console.error('Error processing PDF:', error);
      throw error;
    }
  }
  
  /**
   * Process image with OCR
   * @param {string} filePath - Path to image file
   * @returns {Promise<string>} - Extracted text
   */
  async processImage(filePath) {
    try {
      const worker = await createWorker();
      
      await worker.loadLanguage('eng');
      await worker.initialize('eng');
      
      const result = await worker.recognize(filePath);
      const extractedText = result.data.text;
      
      await worker.terminate();
      
      return extractedText;
    } catch (error) {
      console.error('Error processing image:', error);
      throw error;
    }
  }
  
  /**
   * Process DICOM file
   * @param {string} filePath - Path to DICOM file
   * @returns {Promise<Object>} - Extracted DICOM data
   */
  async processDicom(filePath) {
    try {
      // Read DICOM file
      const dicomFileBuffer = fs.readFileSync(filePath);
      
      // Parse DICOM data
      const dataSet = dicomParser.parseDicom(dicomFileBuffer);
      
      // Extract relevant DICOM tags
      const extractedData = {
        patientName: this.getStringFromDataSet(dataSet, 'x00100010'), // Patient's Name
        patientId: this.getStringFromDataSet(dataSet, 'x00100020'), // Patient ID
        patientDob: this.getStringFromDataSet(dataSet, 'x00100030'), // Patient's Birth Date
        studyDate: this.getStringFromDataSet(dataSet, 'x00080020'), // Study Date
        studyTime: this.getStringFromDataSet(dataSet, 'x00080030'), // Study Time
        modality: this.getStringFromDataSet(dataSet, 'x00080060'), // Modality
        studyDescription: this.getStringFromDataSet(dataSet, 'x00081030'), // Study Description
        seriesDescription: this.getStringFromDataSet(dataSet, 'x0008103E'), // Series Description
        physicianName: this.getStringFromDataSet(dataSet, 'x00080090'), // Referring Physician's Name
        institutionName: this.getStringFromDataSet(dataSet, 'x00080080'), // Institution Name
        text: '' // Will be populated with any text from the DICOM file
      };
      
      // Combine relevant fields into a text representation for further processing
      extractedData.text = Object.entries(extractedData)
        .filter(([key, value]) => value && key !== 'text')
        .map(([key, value]) => `${key}: ${value}`)
        .join('\n');
      
      return extractedData;
    } catch (error) {
      console.error('Error processing DICOM:', error);
      throw error;
    }
  }
  
  /**
   * Helper function to get string from DICOM dataset
   * @param {Object} dataSet - DICOM dataset
   * @param {string} tag - DICOM tag
   * @returns {string} - String value or empty string if not found
   */
  getStringFromDataSet(dataSet, tag) {
    try {
      const element = dataSet.elements[tag];
      if (element && element.length > 0) {
        return dicomParser.explicitElementToString(dataSet, element);
      }
      return '';
    } catch (error) {
      return '';
    }
  }
  
  /**
   * Validate document content against patient data
   * @param {string} extractedText - Text extracted from document
   * @param {Object} extractedData - Structured data extracted from document
   * @param {Object} patient - Patient data
   * @param {string} documentType - Type of document
   * @returns {Promise<Object>} - Validation results
   */
  async validateDocumentContent(extractedText, extractedData, patient, documentType) {
    try {
      // Initialize findings
      const findings = {
        patientNameMatch: null,
        patientDobMatch: null,
        scanDateDetected: null,
        physicianDetected: null,
        keyFindings: []
      };
      
      // Check for patient name match
      const patientName = patient.firstName + ' ' + patient.lastName;
      const patientNameLower = patientName.toLowerCase();
      findings.patientNameMatch = this.checkTextContains(extractedText, patientNameLower);
      
      // Check for patient DOB match
      if (patient.dateOfBirth) {
        const dobDate = new Date(patient.dateOfBirth);
        const dobString = dobDate.toISOString().split('T')[0]; // YYYY-MM-DD
        const dobFormatted = dobDate.toLocaleDateString('en-US'); // MM/DD/YYYY
        
        findings.patientDobMatch = 
          this.checkTextContains(extractedText, dobString) || 
          this.checkTextContains(extractedText, dobFormatted);
      }
      
      // Extract scan date
      findings.scanDateDetected = this.extractDate(extractedText) || 
                                 (extractedData.studyDate ? this.formatDicomDate(extractedData.studyDate) : null);
      
      // Extract physician name
      findings.physicianDetected = this.extractPhysicianName(extractedText) || 
                                  extractedData.physicianName || null;
      
      // Extract key findings based on document type
      findings.keyFindings = this.extractKeyFindings(extractedText, documentType);
      
      // Determine overall status
      let status = 'validated';
      
      // Critical error: Patient name mismatch
      if (findings.patientNameMatch === false) {
        status = 'error';
      }
      // Warning: DOB mismatch or missing critical information
      else if (findings.patientDobMatch === false || 
               !findings.scanDateDetected || 
               !findings.physicianDetected) {
        status = 'warning';
      }
      
      return {
        status,
        findings
      };
    } catch (error) {
      console.error('Error validating document content:', error);
      return {
        status: 'error',
        findings: {
          error: error.message,
          patientNameMatch: null,
          patientDobMatch: null,
          scanDateDetected: null,
          physicianDetected: null,
          keyFindings: []
        }
      };
    }
  }
  
  /**
   * Check if text contains a specific string (case insensitive)
   * @param {string} text - Text to search in
   * @param {string} searchString - String to search for
   * @returns {boolean|null} - True if found, false if not, null if can't determine
   */
  checkTextContains(text, searchString) {
    if (!text || !searchString) {
      return null;
    }
    
    return text.toLowerCase().includes(searchString.toLowerCase());
  }
  
  /**
   * Extract date from text
   * @param {string} text - Text to extract date from
   * @returns {string|null} - Extracted date in YYYY-MM-DD format or null
   */
  extractDate(text) {
    if (!text) {
      return null;
    }
    
    // Look for dates in various formats
    // ISO format: YYYY-MM-DD
    const isoMatch = text.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
    if (isoMatch) {
      return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
    }
    
    // US format: MM/DD/YYYY
    const usMatch = text.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/);
    if (usMatch) {
      const month = usMatch[1].padStart(2, '0');
      const day = usMatch[2].padStart(2, '0');
      return `${usMatch[3]}-${month}-${day}`;
    }
    
    // European format: DD/MM/YYYY
    const euMatch = text.match(/\b(\d{1,2})\.(\d{1,2})\.(\d{4})\b/);
    if (euMatch) {
      const day = euMatch[1].padStart(2, '0');
      const month = euMatch[2].padStart(2, '0');
      return `${euMatch[3]}-${month}-${day}`;
    }
    
    // Written format: Month DD, YYYY
    const monthNames = [
      'january', 'february', 'march', 'april', 'may', 'june',
      'july', 'august', 'september', 'october', 'november', 'december'
    ];
    
    const writtenRegex = new RegExp(
      `\\b(${monthNames.join('|')})[\\s,]+([0-9]{1,2})(?:st|nd|rd|th)?[\\s,]+([0-9]{4})\\b`, 'i'
    );
    
    const writtenMatch = text.toLowerCase().match(writtenRegex);
    if (writtenMatch) {
      const month = monthNames.indexOf(writtenMatch[1]) + 1;
      const day = parseInt(writtenMatch[2], 10);
      const year = parseInt(writtenMatch[3], 10);
      
      return `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
    }
    
    return null;
  }
  
  /**
   * Format DICOM date (YYYYMMDD) to ISO format (YYYY-MM-DD)
   * @param {string} dicomDate - DICOM date string
   * @returns {string|null} - Formatted date or null
   */
  formatDicomDate(dicomDate) {
    if (!dicomDate || dicomDate.length !== 8) {
      return null;
    }
    
    const year = dicomDate.substring(0, 4);
    const month = dicomDate.substring(4, 6);
    const day = dicomDate.substring(6, 8);
    
    return `${year}-${month}-${day}`;
  }
  
  /**
   * Extract physician name from text
   * @param {string} text - Text to extract physician name from
   * @returns {string|null} - Extracted physician name or null
   */
  extractPhysicianName(text) {
    if (!text) {
      return null;
    }
    
    // Look for common patterns indicating physician names
    const patterns = [
      /(?:Dr\.|Doctor)\s+([A-Z][a-z]+\s+[A-Z][a-z]+)/i,
      /(?:physician|doctor|provider):\s*([A-Z][a-z]+\s+[A-Z][a-z]+)/i,
      /(?:interpreted|read|reported)\s+by\s+(?:Dr\.|Doctor)?\s*([A-Z][a-z]+\s+[A-Z][a-z]+)/i
    ];
    
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match && match[1]) {
        return match[1].trim();
      }
    }
    
    return null;
  }
  
  /**
   * Extract key findings from text based on document type
   * @param {string} text - Text to extract findings from
   * @param {string} documentType - Type of document
   * @returns {Array<string>} - Array of key findings
   */
  extractKeyFindings(text, documentType) {
    if (!text) {
      return [];
    }
    
    const findings = [];
    
    // Look for sections that typically contain findings
    const findingsSections = [
      'findings',
      'impression',
      'conclusion',
      'assessment',
      'diagnosis',
      'results'
    ];
    
    // Extract text from findings sections
    for (const section of findingsSections) {
      const sectionRegex = new RegExp(
        `\\b${section}\\s*:?\\s*([^\\n]+(?:\\n(?!\\b(?:${findingsSections.join('|')})\\b)[^\\n]+)*)`,
        'i'
      );
      
      const match = text.match(sectionRegex);
      if (match && match[1]) {
        const sectionText = match[1].trim();
        
        // Split into sentences and add as separate findings
        const sentences = sectionText.split(/\.\s+/);
        for (const sentence of sentences) {
          const trimmed = sentence.trim();
          if (trimmed && trimmed.length > 5) { // Ignore very short fragments
            findings.push(trimmed + '.');
          }
        }
      }
    }
    
    // Add document type specific checks
    if (documentType === 'lab') {
      // Look for abnormal lab values
      const abnormalRegex = /([A-Za-z\s]+)\s*:\s*([0-9.]+)\s*(?:\(H\)|\(L\)|\*|abnormal|elevated|decreased)/gi;
      let match;
      while ((match = abnormalRegex.exec(text)) !== null) {
        findings.push(`Abnormal ${match[1].trim()}: ${match[2].trim()}`);
      }
    } else if (documentType === 'image') {
      // Look for specific imaging findings
      const imagingPatterns = [
        /mass(?:\s+measuring)?\s+([0-9.]+\s*(?:cm|mm))/i,
        /lesion(?:\s+measuring)?\s+([0-9.]+\s*(?:cm|mm))/i,
        /fracture/i,
        /hemorrhage/i,
        /infarct/i
      ];
      
      for (const pattern of imagingPatterns) {
        const match = text.match(pattern);
        if (match) {
          findings.push(`Detected: ${match[0]}`);
        }
      }
    }
    
    // If no specific findings were extracted, look for any sentences with medical terms
    if (findings.length === 0) {
      const medicalTerms = [
        'normal', 'abnormal', 'unremarkable', 'remarkable',
        'positive', 'negative', 'elevated', 'decreased',
        'present', 'absent', 'diagnosed', 'consistent with'
      ];
      
      const sentences = text.split(/\.\s+/);
      for (const sentence of sentences) {
        const trimmed = sentence.trim();
        if (trimmed.length > 10) { // Ignore very short sentences
          for (const term of medicalTerms) {
            if (trimmed.toLowerCase().includes(term)) {
              findings.push(trimmed + '.');
              break;
            }
          }
        }
      }
    }
    
    // Limit to a reasonable number of findings
    return findings.slice(0, 5);
  }
  
  /**
   * Detect anomalies in document content
   * @param {string} extractedText - Text extracted from document
   * @param {Object} patient - Patient data
   * @returns {Array<string>} - Array of detected anomalies
   */
  detectAnomalies(extractedText, patient) {
    const anomalies = [];
    
    // Check for mismatched patient identifiers
    const patientName = patient.firstName + ' ' + patient.lastName;
    if (!this.checkTextContains(extractedText, patientName)) {
      anomalies.push('Patient name mismatch');
    }
    
    if (patient.dateOfBirth) {
      const dobDate = new Date(patient.dateOfBirth);
      const dobString = dobDate.toISOString().split('T')[0]; // YYYY-MM-DD
      const dobFormatted = dobDate.toLocaleDateString('en-US'); // MM/DD/YYYY
      
      if (!this.checkTextContains(extractedText, dobString) && 
          !this.checkTextContains(extractedText, dobFormatted)) {
        anomalies.push('Patient date of birth mismatch');
      }
    }
    
    // Check for missing critical information
    if (!this.extractDate(extractedText)) {
      anomalies.push('Missing document date');
    }
    
    if (!this.extractPhysicianName(extractedText)) {
      anomalies.push('Missing physician information');
    }
    
    return anomalies;
  }
  
  /**
   * Check for duplicate document uploads
   * @param {string} patientId - Patient ID
   * @param {string} documentType - Document type
   * @param {string} extractedText - Text extracted from document
   * @returns {Promise<boolean>} - Whether document is a duplicate
   */
  async checkForDuplicates(patientId, documentType, extractedText) {
    try {
      // Get recent documents of the same type for this patient
      const recentDocuments = await documentService.getDocuments(
        { patientId, type: documentType },
        1, // Page
        10 // Limit to 10 most recent
      );
      
      if (!recentDocuments.documents || recentDocuments.documents.length === 0) {
        return false;
      }
      
      // For each document, check similarity with the current document
      for (const doc of recentDocuments.documents) {
        // In a real implementation, you would retrieve the document content
        // and compare it with the current document using text similarity algorithms
        // For this example, we'll use a simplified approach
        
        // If the document has AI findings, compare key elements
        if (doc.aiProcessed && doc.aiFindings) {
          const findings = doc.aiFindings;
          
          // Check if scan date matches
          if (findings.scanDateDetected && 
              this.extractDate(extractedText) === findings.scanDateDetected) {
            
            // Check if physician matches
            if (findings.physicianDetected && 
                this.extractPhysicianName(extractedText) === findings.physicianDetected) {
              
              // If both date and physician match, likely a duplicate
              return true;
            }
          }
        }
      }
      
      return false;
    } catch (error) {
      console.error('Error checking for duplicates:', error);
      return false; // Assume not duplicate in case of error
    }
  }
}

module.exports = new AIService();