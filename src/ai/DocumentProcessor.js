/**
 * Document Processor AI Module
 * Handles advanced document processing, validation, and anomaly detection
 */

const tf = require('@tensorflow/tfjs-node');
const natural = require('natural');
const { createWorker } = require('tesseract.js');
const fs = require('fs');
const path = require('path');

// NLP tokenizer for text processing
const tokenizer = new natural.WordTokenizer();

// TF-IDF for document similarity
const TfIdf = natural.TfIdf;

class DocumentProcessor {
  constructor() {
    this.models = {};
    this.initialized = false;
  }

  /**
   * Initialize AI models
   */
  async initialize() {
    try {
      // Load pre-trained models
      this.models.textClassifier = await this.loadTextClassificationModel();
      this.models.anomalyDetector = await this.loadAnomalyDetectionModel();
      
      this.initialized = true;
      console.log('AI Document Processor initialized successfully');
    } catch (error) {
      console.error('Failed to initialize AI Document Processor:', error);
      throw error;
    }
  }

  /**
   * Load text classification model
   * @returns {Object} - Loaded model
   */
  async loadTextClassificationModel() {
    try {
      // In a production environment, you would load a pre-trained model
      // For this example, we'll create a simple model
      
      const model = tf.sequential();
      model.add(tf.layers.dense({
        units: 128,
        activation: 'relu',
        inputShape: [100] // Input dimension for word embeddings
      }));
      model.add(tf.layers.dropout({ rate: 0.2 }));
      model.add(tf.layers.dense({
        units: 64,
        activation: 'relu'
      }));
      model.add(tf.layers.dense({
        units: 5, // Number of document categories
        activation: 'softmax'
      }));
      
      model.compile({
        optimizer: 'adam',
        loss: 'categoricalCrossentropy',
        metrics: ['accuracy']
      });
      
      return model;
    } catch (error) {
      console.error('Error loading text classification model:', error);
      throw error;
    }
  }

  /**
   * Load anomaly detection model
   * @returns {Object} - Loaded model
   */
  async loadAnomalyDetectionModel() {
    try {
      // In a production environment, you would load a pre-trained model
      // For this example, we'll create a simple autoencoder model for anomaly detection
      
      const model = tf.sequential();
      
      // Encoder
      model.add(tf.layers.dense({
        units: 32,
        activation: 'relu',
        inputShape: [100] // Input dimension
      }));
      model.add(tf.layers.dense({
        units: 16,
        activation: 'relu'
      }));
      model.add(tf.layers.dense({
        units: 8,
        activation: 'relu'
      }));
      
      // Decoder
      model.add(tf.layers.dense({
        units: 16,
        activation: 'relu'
      }));
      model.add(tf.layers.dense({
        units: 32,
        activation: 'relu'
      }));
      model.add(tf.layers.dense({
        units: 100,
        activation: 'sigmoid'
      }));
      
      model.compile({
        optimizer: 'adam',
        loss: 'meanSquaredError'
      });
      
      return model;
    } catch (error) {
      console.error('Error loading anomaly detection model:', error);
      throw error;
    }
  }

  /**
   * Process document with OCR and AI validation
   * @param {string} filePath - Path to document file
   * @param {Object} metadata - Document metadata (patient info, etc.)
   * @returns {Promise<Object>} - Processing results
   */
  async processDocument(filePath, metadata) {
    try {
      if (!this.initialized) {
        await this.initialize();
      }
      
      // Extract text from document
      const extractedText = await this.extractTextFromDocument(filePath);
      
      // Classify document type
      const documentType = await this.classifyDocumentType(extractedText);
      
      // Extract structured information
      const extractedInfo = await this.extractStructuredInformation(extractedText, documentType);
      
      // Validate document against metadata
      const validationResults = await this.validateDocument(extractedInfo, metadata);
      
      // Detect anomalies
      const anomalies = await this.detectAnomalies(extractedText, extractedInfo, metadata);
      
      // Check for duplicates
      const isDuplicate = await this.checkForDuplicates(extractedInfo, metadata);
      
      return {
        documentType,
        extractedInfo,
        validationResults,
        anomalies,
        isDuplicate,
        confidence: this.calculateConfidenceScore(validationResults, anomalies)
      };
    } catch (error) {
      console.error('Error processing document:', error);
      return {
        error: error.message,
        success: false
      };
    }
  }

  /**
   * Extract text from document using OCR
   * @param {string} filePath - Path to document file
   * @returns {Promise<string>} - Extracted text
   */
  async extractTextFromDocument(filePath) {
    try {
      const fileExt = path.extname(filePath).toLowerCase();
      
      // Handle different file types
      if (['.jpg', '.jpeg', '.png', '.tiff', '.bmp'].includes(fileExt)) {
        return await this.performOCR(filePath);
      } else if (fileExt === '.pdf') {
        return await this.extractTextFromPDF(filePath);
      } else if (['.dcm', '.dicom'].includes(fileExt)) {
        return await this.extractTextFromDICOM(filePath);
      } else {
        throw new Error(`Unsupported file type: ${fileExt}`);
      }
    } catch (error) {
      console.error('Error extracting text from document:', error);
      throw error;
    }
  }

  /**
   * Perform OCR on image
   * @param {string} imagePath - Path to image file
   * @returns {Promise<string>} - Extracted text
   */
  async performOCR(imagePath) {
    try {
      const worker = await createWorker();
      
      await worker.loadLanguage('eng');
      await worker.initialize('eng');
      
      const { data } = await worker.recognize(imagePath);
      const text = data.text;
      
      await worker.terminate();
      
      return text;
    } catch (error) {
      console.error('OCR error:', error);
      throw error;
    }
  }

  /**
   * Extract text from PDF
   * @param {string} pdfPath - Path to PDF file
   * @returns {Promise<string>} - Extracted text
   */
  async extractTextFromPDF(pdfPath) {
    // In a real implementation, you would use a PDF parsing library
    // For this example, we'll simulate PDF text extraction
    return `SIMULATED PDF EXTRACTION
Patient: John Doe
DOB: 1980-01-15
Date: 2023-05-20
Physician: Dr. Jane Smith

Findings:
Patient presents with normal vital signs.
No abnormalities detected in chest X-ray.
Blood work within normal ranges.

Conclusion:
Healthy patient with no significant findings.`;
  }

  /**
   * Extract text from DICOM file
   * @param {string} dicomPath - Path to DICOM file
   * @returns {Promise<string>} - Extracted text
   */
  async extractTextFromDICOM(dicomPath) {
    // In a real implementation, you would use a DICOM parsing library
    // For this example, we'll simulate DICOM metadata extraction
    return `SIMULATED DICOM METADATA
Patient: John Doe
Patient ID: 12345
DOB: 1980-01-15
Study Date: 2023-05-20
Modality: CT
Body Part: CHEST
Referring Physician: Dr. Jane Smith
Institution: General Hospital`;
  }

  /**
   * Classify document type based on content
   * @param {string} text - Document text
   * @returns {Promise<string>} - Document type
   */
  async classifyDocumentType(text) {
    try {
      // In a real implementation, you would use the loaded model for classification
      // For this example, we'll use a rule-based approach
      
      const textLower = text.toLowerCase();
      
      if (textLower.includes('x-ray') || textLower.includes('mri') || 
          textLower.includes('ct scan') || textLower.includes('ultrasound') ||
          textLower.includes('modality') || textLower.includes('dicom')) {
        return 'imaging';
      } else if (textLower.includes('lab') || textLower.includes('test results') ||
                 textLower.includes('blood') || textLower.includes('urine') ||
                 textLower.includes('specimen')) {
        return 'lab_results';
      } else if (textLower.includes('prescription') || textLower.includes('medication') ||
                 textLower.includes('pharmacy') || textLower.includes('dose')) {
        return 'prescription';
      } else if (textLower.includes('discharge') || textLower.includes('summary') ||
                 textLower.includes('hospital stay')) {
        return 'discharge_summary';
      } else if (textLower.includes('consent') || textLower.includes('agreement') ||
                 textLower.includes('authorization')) {
        return 'consent_form';
      } else {
        return 'other_medical_document';
      }
    } catch (error) {
      console.error('Error classifying document:', error);
      return 'unknown';
    }
  }

  /**
   * Extract structured information from document text
   * @param {string} text - Document text
   * @param {string} documentType - Document type
   * @returns {Promise<Object>} - Structured information
   */
  async extractStructuredInformation(text, documentType) {
    try {
      // Initialize extracted info object
      const extractedInfo = {
        patientName: null,
        patientId: null,
        patientDob: null,
        documentDate: null,
        physicianName: null,
        findings: [],
        medications: [],
        diagnoses: [],
        procedures: [],
        vitalSigns: {}
      };
      
      // Extract patient name
      const patientNameMatch = text.match(/(?:patient|name)\s*:?\s*([A-Z][a-z]+\s+[A-Z][a-z]+)/i);
      if (patientNameMatch) {
        extractedInfo.patientName = patientNameMatch[1].trim();
      }
      
      // Extract patient ID
      const patientIdMatch = text.match(/(?:patient\s*id|id|mrn|medical\s*record\s*number)\s*:?\s*([A-Z0-9]+)/i);
      if (patientIdMatch) {
        extractedInfo.patientId = patientIdMatch[1].trim();
      }
      
      // Extract patient DOB
      const dobMatch = text.match(/(?:dob|date\s*of\s*birth|birth\s*date)\s*:?\s*(\d{4}[-/]\d{1,2}[-/]\d{1,2}|\d{1,2}[-/]\d{1,2}[-/]\d{4})/i);
      if (dobMatch) {
        extractedInfo.patientDob = this.standardizeDate(dobMatch[1]);
      }
      
      // Extract document date
      const dateMatch = text.match(/(?:date|study\s*date|report\s*date)\s*:?\s*(\d{4}[-/]\d{1,2}[-/]\d{1,2}|\d{1,2}[-/]\d{1,2}[-/]\d{4})/i);
      if (dateMatch) {
        extractedInfo.documentDate = this.standardizeDate(dateMatch[1]);
      }
      
      // Extract physician name
      const physicianMatch = text.match(/(?:physician|doctor|provider|dr\.?)\s*:?\s*([A-Z][a-z]+\s+[A-Z][a-z]+)/i);
      if (physicianMatch) {
        extractedInfo.physicianName = physicianMatch[1].trim();
      }
      
      // Extract findings based on document type
      if (documentType === 'imaging' || documentType === 'lab_results') {
        // Extract findings section
        const findingsMatch = text.match(/(?:findings|results|impression)\s*:?\s*([\s\S]+?)(?:\n\n|\r\n\r\n|$)/i);
        if (findingsMatch) {
          const findingsText = findingsMatch[1].trim();
          // Split into individual findings
          const findings = findingsText.split(/\.\s+|\n/);
          extractedInfo.findings = findings
            .map(finding => finding.trim())
            .filter(finding => finding.length > 0)
            .map(finding => finding.endsWith('.') ? finding : `${finding}.`);
        }
      }
      
      // Extract medications for prescriptions
      if (documentType === 'prescription') {
        const medicationRegex = /([A-Za-z0-9\s]+)\s+([0-9]+\s*(?:mg|mcg|g|ml))\s+([0-9]+\s*(?:times|x)\s*(?:daily|a day|per day)|(?:once|twice|three times)\s*(?:daily|a day|per day))/gi;
        let match;
        while ((match = medicationRegex.exec(text)) !== null) {
          extractedInfo.medications.push({
            name: match[1].trim(),
            dosage: match[2].trim(),
            frequency: match[3].trim()
          });
        }
      }
      
      // Extract diagnoses
      const diagnosisMatch = text.match(/(?:diagnosis|diagnoses|assessment|impression)\s*:?\s*([\s\S]+?)(?:\n\n|\r\n\r\n|$)/i);
      if (diagnosisMatch) {
        const diagnosisText = diagnosisMatch[1].trim();
        // Split into individual diagnoses
        const diagnoses = diagnosisText.split(/\.\s+|\n|;/);
        extractedInfo.diagnoses = diagnoses
          .map(diagnosis => diagnosis.trim())
          .filter(diagnosis => diagnosis.length > 0)
          .map(diagnosis => diagnosis.endsWith('.') ? diagnosis : `${diagnosis}.`);
      }
      
      // Extract vital signs
      const vitalSignsPatterns = [
        { name: 'temperature', pattern: /(?:temperature|temp)\s*:?\s*([0-9.]+)\s*(?:°C|°F|C|F)/i },
        { name: 'heartRate', pattern: /(?:heart\s*rate|pulse|hr)\s*:?\s*([0-9]+)\s*(?:bpm|beats per minute)?/i },
        { name: 'bloodPressure', pattern: /(?:blood\s*pressure|bp)\s*:?\s*([0-9]+\/[0-9]+)\s*(?:mmHg)?/i },
        { name: 'respiratoryRate', pattern: /(?:respiratory\s*rate|resp\s*rate|rr)\s*:?\s*([0-9]+)\s*(?:breaths per minute|bpm)?/i },
        { name: 'oxygenSaturation', pattern: /(?:oxygen\s*saturation|o2\s*sat|spo2)\s*:?\s*([0-9]+)\s*(?:%|percent)?/i }
      ];
      
      for (const { name, pattern } of vitalSignsPatterns) {
        const match = text.match(pattern);
        if (match) {
          extractedInfo.vitalSigns[name] = match[1].trim();
        }
      }
      
      return extractedInfo;
    } catch (error) {
      console.error('Error extracting structured information:', error);
      return {};
    }
  }

  /**
   * Standardize date format to YYYY-MM-DD
   * @param {string} dateStr - Date string in various formats
   * @returns {string} - Standardized date
   */
  standardizeDate(dateStr) {
    try {
      // Handle different date formats
      const parts = dateStr.split(/[-\/]/);
      
      // Check if format is YYYY-MM-DD
      if (parts[0].length === 4) {
        const year = parts[0];
        const month = parts[1].padStart(2, '0');
        const day = parts[2].padStart(2, '0');
        return `${year}-${month}-${day}`;
      } 
      // Check if format is MM-DD-YYYY or DD-MM-YYYY
      else if (parts[2].length === 4) {
        const year = parts[2];
        // Assume MM-DD-YYYY format (common in US)
        const month = parts[0].padStart(2, '0');
        const day = parts[1].padStart(2, '0');
        return `${year}-${month}-${day}`;
      }
      
      // If we can't parse it, return as is
      return dateStr;
    } catch (error) {
      return dateStr;
    }
  }

  /**
   * Validate document against metadata
   * @param {Object} extractedInfo - Extracted document information
   * @param {Object} metadata - Document metadata
   * @returns {Promise<Object>} - Validation results
   */
  async validateDocument(extractedInfo, metadata) {
    try {
      const validationResults = {
        isValid: true,
        patientMatch: null,
        dobMatch: null,
        dateValid: null,
        physicianValid: null,
        missingFields: [],
        warnings: []
      };
      
      // Check patient name match
      if (extractedInfo.patientName && metadata.patientName) {
        validationResults.patientMatch = this.compareNames(
          extractedInfo.patientName,
          metadata.patientName
        );
        
        if (!validationResults.patientMatch) {
          validationResults.isValid = false;
          validationResults.warnings.push('Patient name mismatch');
        }
      } else {
        validationResults.missingFields.push('patientName');
      }
      
      // Check DOB match
      if (extractedInfo.patientDob && metadata.patientDob) {
        validationResults.dobMatch = 
          this.standardizeDate(extractedInfo.patientDob) === 
          this.standardizeDate(metadata.patientDob);
        
        if (!validationResults.dobMatch) {
          validationResults.isValid = false;
          validationResults.warnings.push('Date of birth mismatch');
        }
      } else {
        validationResults.missingFields.push('patientDob');
      }
      
      // Check document date validity
      if (extractedInfo.documentDate) {
        const docDate = new Date(extractedInfo.documentDate);
        const now = new Date();
        validationResults.dateValid = docDate <= now;
        
        if (!validationResults.dateValid) {
          validationResults.isValid = false;
          validationResults.warnings.push('Document date is in the future');
        }
      } else {
        validationResults.missingFields.push('documentDate');
      }
      
      // Check physician presence
      if (extractedInfo.physicianName) {
        validationResults.physicianValid = true;
      } else {
        validationResults.missingFields.push('physicianName');
        validationResults.warnings.push('Missing physician information');
      }
      
      return validationResults;
    } catch (error) {
      console.error('Error validating document:', error);
      return {
        isValid: false,
        error: error.message,
        warnings: ['Validation error occurred']
      };
    }
  }

  /**
   * Compare two names for similarity
   * @param {string} name1 - First name
   * @param {string} name2 - Second name
   * @returns {boolean} - Whether names match
   */
  compareNames(name1, name2) {
    // Normalize names
    const normalize = (name) => {
      return name.toLowerCase()
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/[^a-z0-9\s]/g, '');
    };
    
    const normalizedName1 = normalize(name1);
    const normalizedName2 = normalize(name2);
    
    // Exact match
    if (normalizedName1 === normalizedName2) {
      return true;
    }
    
    // Check if one name is contained in the other
    if (normalizedName1.includes(normalizedName2) || 
        normalizedName2.includes(normalizedName1)) {
      return true;
    }
    
    // Check for name parts match (first name, last name)
    const parts1 = normalizedName1.split(' ');
    const parts2 = normalizedName2.split(' ');
    
    // Check if last names match
    if (parts1.length > 0 && parts2.length > 0 && 
        parts1[parts1.length - 1] === parts2[parts2.length - 1]) {
      return true;
    }
    
    // Check if first names match and last initials match
    if (parts1.length > 0 && parts2.length > 0 && 
        parts1[0] === parts2[0] && 
        parts1[parts1.length - 1][0] === parts2[parts2.length - 1][0]) {
      return true;
    }
    
    return false;
  }

  /**
   * Detect anomalies in document
   * @param {string} text - Document text
   * @param {Object} extractedInfo - Extracted document information
   * @param {Object} metadata - Document metadata
   * @returns {Promise<Array<string>>} - Detected anomalies
   */
  async detectAnomalies(text, extractedInfo, metadata) {
    try {
      const anomalies = [];
      
      // Check for missing critical information
      const criticalFields = ['patientName', 'documentDate', 'physicianName'];
      for (const field of criticalFields) {
        if (!extractedInfo[field]) {
          anomalies.push(`Missing ${field.replace(/([A-Z])/g, ' $1').toLowerCase()}`);
        }
      }
      
      // Check for patient identity mismatch
      if (extractedInfo.patientName && metadata.patientName &&
          !this.compareNames(extractedInfo.patientName, metadata.patientName)) {
        anomalies.push('Patient identity mismatch');
      }
      
      // Check for date anomalies
      if (extractedInfo.documentDate) {
        const docDate = new Date(extractedInfo.documentDate);
        const now = new Date();
        
        // Future date
        if (docDate > now) {
          anomalies.push('Document date is in the future');
        }
        
        // Very old date (more than 10 years)
        const tenYearsAgo = new Date();
        tenYearsAgo.setFullYear(now.getFullYear() - 10);
        if (docDate < tenYearsAgo) {
          anomalies.push('Document date is unusually old (>10 years)');
        }
      }
      
      // Check for unusual values in lab results
      if (extractedInfo.findings && extractedInfo.findings.length > 0) {
        // Look for abnormal lab values
        const labValueRegex = /([0-9.]+)\s*(?:mg\/dL|g\/dL|mmol\/L|U\/L|ng\/mL)/g;
        let match;
        while ((match = labValueRegex.exec(text)) !== null) {
          const value = parseFloat(match[1]);
          // This is a simplified check - in a real system, you would have reference ranges for each test
          if (value > 1000) {
            anomalies.push(`Unusually high lab value detected: ${match[0]}`);
          }
        }
      }
      
      // Check for contradictions in the text
      const contradictionPairs = [
        ['normal', 'abnormal'],
        ['negative', 'positive'],
        ['healthy', 'diseased'],
        ['no evidence of', 'evidence of']
      ];
      
      for (const [term1, term2] of contradictionPairs) {
        if (text.toLowerCase().includes(term1) && text.toLowerCase().includes(term2)) {
          // Check if they're actually contradicting each other (not just appearing in different contexts)
          // This is a simplified check - in a real system, you would use NLP to understand context
          const sentences = text.split(/\.\s+/);
          for (const sentence of sentences) {
            if (sentence.toLowerCase().includes(term1) && sentence.toLowerCase().includes(term2)) {
              anomalies.push(`Potential contradiction detected: "${term1}" and "${term2}" in same context`);
              break;
            }
          }
        }
      }
      
      return anomalies;
    } catch (error) {
      console.error('Error detecting anomalies:', error);
      return ['Error in anomaly detection'];
    }
  }

  /**
   * Check for duplicate documents
   * @param {Object} extractedInfo - Extracted document information
   * @param {Object} metadata - Document metadata
   * @returns {Promise<boolean>} - Whether document is a duplicate
   */
  async checkForDuplicates(extractedInfo, metadata) {
    try {
      // In a real implementation, you would query a database of existing documents
      // For this example, we'll use a simplified approach based on the provided metadata
      
      if (!metadata.existingDocuments || metadata.existingDocuments.length === 0) {
        return false;
      }
      
      for (const existingDoc of metadata.existingDocuments) {
        // Check if critical fields match
        if (existingDoc.documentDate === extractedInfo.documentDate &&
            existingDoc.documentType === metadata.documentType) {
          
          // If document date and type match, check content similarity
          if (existingDoc.extractedInfo && extractedInfo.findings) {
            const similarity = this.calculateTextSimilarity(
              existingDoc.extractedInfo.findings.join(' '),
              extractedInfo.findings.join(' ')
            );
            
            // If similarity is above threshold, consider it a duplicate
            if (similarity > 0.8) {
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

  /**
   * Calculate text similarity between two strings
   * @param {string} text1 - First text
   * @param {string} text2 - Second text
   * @returns {number} - Similarity score (0-1)
   */
  calculateTextSimilarity(text1, text2) {
    try {
      if (!text1 || !text2) {
        return 0;
      }
      
      // Use TF-IDF for document similarity
      const tfidf = new TfIdf();
      
      // Add documents
      tfidf.addDocument(text1);
      tfidf.addDocument(text2);
      
      // Calculate similarity
      const terms = {};
      tfidf.listTerms(0).forEach(item => {
        terms[item.term] = item.tfidf;
      });
      
      let dotProduct = 0;
      let magnitude1 = 0;
      let magnitude2 = 0;
      
      tfidf.listTerms(1).forEach(item => {
        if (terms[item.term]) {
          dotProduct += terms[item.term] * item.tfidf;
        }
        magnitude2 += item.tfidf * item.tfidf;
      });
      
      Object.values(terms).forEach(tfidf => {
        magnitude1 += tfidf * tfidf;
      });
      
      magnitude1 = Math.sqrt(magnitude1);
      magnitude2 = Math.sqrt(magnitude2);
      
      if (magnitude1 === 0 || magnitude2 === 0) {
        return 0;
      }
      
      return dotProduct / (magnitude1 * magnitude2);
    } catch (error) {
      console.error('Error calculating text similarity:', error);
      return 0;
    }
  }

  /**
   * Calculate confidence score for document processing
   * @param {Object} validationResults - Validation results
   * @param {Array<string>} anomalies - Detected anomalies
   * @returns {number} - Confidence score (0-1)
   */
  calculateConfidenceScore(validationResults, anomalies) {
    try {
      let score = 1.0; // Start with perfect score
      
      // Reduce score based on validation issues
      if (!validationResults.isValid) {
        score -= 0.3; // Major penalty for invalid document
      }
      
      if (!validationResults.patientMatch) {
        score -= 0.2;
      }
      
      if (!validationResults.dobMatch) {
        score -= 0.1;
      }
      
      if (!validationResults.dateValid) {
        score -= 0.1;
      }
      
      // Reduce score based on missing fields
      if (validationResults.missingFields) {
        score -= validationResults.missingFields.length * 0.05;
      }
      
      // Reduce score based on anomalies
      if (anomalies) {
        score -= anomalies.length * 0.05;
      }
      
      // Ensure score is between 0 and 1
      return Math.max(0, Math.min(1, score));
    } catch (error) {
      console.error('Error calculating confidence score:', error);
      return 0.5; // Default to medium confidence in case of error
    }
  }
}

module.exports = new DocumentProcessor();