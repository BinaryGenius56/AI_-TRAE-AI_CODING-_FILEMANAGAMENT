/**
 * FHIR Service
 * Implements HL7 FHIR protocol for healthcare data exchange
 */

const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');

const auditService = require('./AuditService');

class FhirService {
  constructor() {
    this.config = {
      fhirServerUrl: process.env.FHIR_SERVER_URL || 'http://localhost:8080/fhir',
      fhirVersion: process.env.FHIR_VERSION || 'R4',
      useAuthentication: process.env.FHIR_USE_AUTH === 'true' || false,
      authType: process.env.FHIR_AUTH_TYPE || 'bearer', // 'bearer', 'basic', or 'none'
      username: process.env.FHIR_USERNAME,
      password: process.env.FHIR_PASSWORD,
      bearerToken: process.env.FHIR_BEARER_TOKEN,
      requestTimeout: parseInt(process.env.FHIR_REQUEST_TIMEOUT || '30000', 10), // 30 seconds
      maxRetries: parseInt(process.env.FHIR_MAX_RETRIES || '3', 10),
      retryDelay: parseInt(process.env.FHIR_RETRY_DELAY || '1000', 10) // 1 second
    };

    // Initialize HTTP client
    this.client = axios.create({
      baseURL: this.config.fhirServerUrl,
      timeout: this.config.requestTimeout,
      headers: {
        'Content-Type': 'application/fhir+json',
        'Accept': 'application/fhir+json'
      }
    });

    // Add authentication if configured
    if (this.config.useAuthentication) {
      this.setupAuthentication();
    }

    // Add request interceptor for logging
    this.client.interceptors.request.use(config => {
      config.metadata = { startTime: new Date() };
      return config;
    });

    // Add response interceptor for logging and error handling
    this.client.interceptors.response.use(
      response => {
        const duration = new Date() - response.config.metadata.startTime;
        console.log(`FHIR ${response.config.method.toUpperCase()} ${response.config.url} ${response.status} ${duration}ms`);
        return response;
      },
      error => {
        if (error.response) {
          const duration = new Date() - error.config.metadata.startTime;
          console.error(`FHIR ${error.config.method.toUpperCase()} ${error.config.url} ${error.response.status} ${duration}ms`);
          console.error('FHIR Error Response:', error.response.data);
        } else if (error.request) {
          console.error('FHIR Request Error (No Response):', error.message);
        } else {
          console.error('FHIR Error:', error.message);
        }
        return Promise.reject(error);
      }
    );
  }

  /**
   * Setup authentication for FHIR requests
   */
  setupAuthentication() {
    switch (this.config.authType) {
      case 'bearer':
        if (!this.config.bearerToken) {
          console.warn('Bearer token authentication configured but no token provided');
          break;
        }
        this.client.defaults.headers.common['Authorization'] = `Bearer ${this.config.bearerToken}`;
        break;
      case 'basic':
        if (!this.config.username || !this.config.password) {
          console.warn('Basic authentication configured but no username/password provided');
          break;
        }
        const auth = Buffer.from(`${this.config.username}:${this.config.password}`).toString('base64');
        this.client.defaults.headers.common['Authorization'] = `Basic ${auth}`;
        break;
      default:
        console.log('No authentication configured for FHIR server');
    }
  }

  /**
   * Execute a FHIR request with retries
   * @param {Function} requestFn - Function that returns a promise for the request
   * @param {string} operationType - Type of operation for logging
   * @param {string} resourceType - FHIR resource type
   * @param {string} resourceId - FHIR resource ID (optional)
   * @param {Object} user - User making the request (optional)
   * @returns {Promise<Object>} - FHIR response
   */
  async executeWithRetry(requestFn, operationType, resourceType, resourceId = null, user = null) {
    let lastError = null;
    let attempt = 0;

    while (attempt < this.config.maxRetries) {
      try {
        attempt++;
        const response = await requestFn();

        // Log successful operation to audit service
        if (user) {
          await this.logFhirOperation({
            operationType,
            resourceType,
            resourceId: resourceId || (response.data?.id || null),
            status: 'success',
            userId: user.id,
            hospitalId: user.hospitalId,
            details: {
              attempt,
              statusCode: response.status
            }
          });
        }

        return response.data;
      } catch (error) {
        lastError = error;
        
        // Check if we should retry based on error type
        const shouldRetry = this.shouldRetryRequest(error);
        if (!shouldRetry || attempt >= this.config.maxRetries) {
          break;
        }

        // Wait before retrying
        const delay = this.config.retryDelay * Math.pow(2, attempt - 1); // Exponential backoff
        console.log(`Retrying FHIR ${operationType} for ${resourceType} (attempt ${attempt}/${this.config.maxRetries}) after ${delay}ms`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    // Log failed operation to audit service
    if (user) {
      await this.logFhirOperation({
        operationType,
        resourceType,
        resourceId,
        status: 'error',
        userId: user.id,
        hospitalId: user.hospitalId,
        details: {
          attempts: attempt,
          errorMessage: lastError.message,
          statusCode: lastError.response?.status || 0
        }
      });
    }

    throw lastError;
  }

  /**
   * Determine if a request should be retried based on the error
   * @param {Error} error - Axios error
   * @returns {boolean} - Whether to retry the request
   */
  shouldRetryRequest(error) {
    // Retry on network errors
    if (!error.response) {
      return true;
    }

    // Retry on 5xx server errors
    if (error.response.status >= 500 && error.response.status < 600) {
      return true;
    }

    // Retry on 429 Too Many Requests
    if (error.response.status === 429) {
      return true;
    }

    // Don't retry on 4xx client errors (except 429)
    return false;
  }

  /**
   * Log FHIR operation to audit service
   * @param {Object} params - Log parameters
   */
  async logFhirOperation(params) {
    try {
      await auditService.logFhirOperation({
        ...params,
        timestamp: new Date().toISOString(),
        fhirVersion: this.config.fhirVersion
      });
    } catch (error) {
      console.error('Failed to log FHIR operation:', error);
    }
  }

  /**
   * Search for FHIR resources
   * @param {string} resourceType - FHIR resource type (e.g., 'Patient', 'Observation')
   * @param {Object} searchParams - Search parameters
   * @param {Object} user - User making the request
   * @returns {Promise<Object>} - FHIR Bundle containing search results
   */
  async search(resourceType, searchParams = {}, user = null) {
    return this.executeWithRetry(
      () => this.client.get(`/${resourceType}`, { params: searchParams }),
      'search',
      resourceType,
      null,
      user
    );
  }

  /**
   * Get a FHIR resource by ID
   * @param {string} resourceType - FHIR resource type
   * @param {string} id - Resource ID
   * @param {Object} user - User making the request
   * @returns {Promise<Object>} - FHIR resource
   */
  async getById(resourceType, id, user = null) {
    return this.executeWithRetry(
      () => this.client.get(`/${resourceType}/${id}`),
      'read',
      resourceType,
      id,
      user
    );
  }

  /**
   * Create a new FHIR resource
   * @param {string} resourceType - FHIR resource type
   * @param {Object} resource - FHIR resource data
   * @param {Object} user - User making the request
   * @returns {Promise<Object>} - Created FHIR resource
   */
  async create(resourceType, resource, user = null) {
    // Ensure resource has the correct type
    resource.resourceType = resourceType;
    
    return this.executeWithRetry(
      () => this.client.post(`/${resourceType}`, resource),
      'create',
      resourceType,
      null,
      user
    );
  }

  /**
   * Update an existing FHIR resource
   * @param {string} resourceType - FHIR resource type
   * @param {string} id - Resource ID
   * @param {Object} resource - FHIR resource data
   * @param {Object} user - User making the request
   * @returns {Promise<Object>} - Updated FHIR resource
   */
  async update(resourceType, id, resource, user = null) {
    // Ensure resource has the correct type and ID
    resource.resourceType = resourceType;
    resource.id = id;
    
    return this.executeWithRetry(
      () => this.client.put(`/${resourceType}/${id}`, resource),
      'update',
      resourceType,
      id,
      user
    );
  }

  /**
   * Delete a FHIR resource
   * @param {string} resourceType - FHIR resource type
   * @param {string} id - Resource ID
   * @param {Object} user - User making the request
   * @returns {Promise<Object>} - Operation outcome
   */
  async delete(resourceType, id, user = null) {
    return this.executeWithRetry(
      () => this.client.delete(`/${resourceType}/${id}`),
      'delete',
      resourceType,
      id,
      user
    );
  }

  /**
   * Execute a FHIR transaction bundle
   * @param {Object} bundle - FHIR transaction bundle
   * @param {Object} user - User making the request
   * @returns {Promise<Object>} - Transaction response bundle
   */
  async transaction(bundle, user = null) {
    // Ensure bundle has the correct type
    bundle.resourceType = 'Bundle';
    bundle.type = 'transaction';
    
    return this.executeWithRetry(
      () => this.client.post('/', bundle),
      'transaction',
      'Bundle',
      null,
      user
    );
  }

  /**
   * Convert a patient record to FHIR Patient resource
   * @param {Object} patient - Internal patient record
   * @returns {Object} - FHIR Patient resource
   */
  convertToFhirPatient(patient) {
    // Create a FHIR Patient resource from internal patient data
    const fhirPatient = {
      resourceType: 'Patient',
      id: patient.id,
      identifier: [
        {
          system: 'urn:oid:2.16.840.1.113883.2.4.6.3', // Example OID
          value: patient.medicalRecordNumber
        }
      ],
      active: patient.isActive,
      name: [
        {
          use: 'official',
          family: patient.lastName,
          given: [patient.firstName, patient.middleName].filter(Boolean)
        }
      ],
      telecom: [
        {
          system: 'phone',
          value: patient.phoneNumber,
          use: 'home'
        },
        {
          system: 'email',
          value: patient.email
        }
      ],
      gender: patient.gender.toLowerCase(),
      birthDate: patient.dateOfBirth,
      address: [
        {
          use: 'home',
          line: [patient.addressLine1, patient.addressLine2].filter(Boolean),
          city: patient.city,
          state: patient.state,
          postalCode: patient.zipCode,
          country: patient.country
        }
      ],
      contact: []
    };

    // Add emergency contact if available
    if (patient.emergencyContact) {
      fhirPatient.contact.push({
        relationship: [
          {
            coding: [
              {
                system: 'http://terminology.hl7.org/CodeSystem/v2-0131',
                code: 'C',
                display: 'Emergency Contact'
              }
            ]
          }
        ],
        name: {
          use: 'official',
          text: patient.emergencyContact.name
        },
        telecom: [
          {
            system: 'phone',
            value: patient.emergencyContact.phoneNumber
          }
        ]
      });
    }

    return fhirPatient;
  }

  /**
   * Convert a FHIR Patient resource to internal patient record
   * @param {Object} fhirPatient - FHIR Patient resource
   * @returns {Object} - Internal patient record
   */
  convertFromFhirPatient(fhirPatient) {
    // Extract name components
    const name = fhirPatient.name && fhirPatient.name.length > 0 ? fhirPatient.name[0] : {};
    const given = name.given || [];
    
    // Extract contact information
    const telecom = fhirPatient.telecom || [];
    const phoneEntry = telecom.find(t => t.system === 'phone');
    const emailEntry = telecom.find(t => t.system === 'email');
    
    // Extract address
    const address = fhirPatient.address && fhirPatient.address.length > 0 ? fhirPatient.address[0] : {};
    const addressLines = address.line || [];
    
    // Extract emergency contact
    const emergencyContactEntry = (fhirPatient.contact || []).find(c => 
      c.relationship && c.relationship.some(r => 
        r.coding && r.coding.some(code => code.code === 'C')
      )
    );
    
    // Create internal patient record
    const patient = {
      id: fhirPatient.id,
      medicalRecordNumber: fhirPatient.identifier && fhirPatient.identifier.length > 0 
        ? fhirPatient.identifier[0].value 
        : null,
      firstName: given[0] || '',
      middleName: given[1] || '',
      lastName: name.family || '',
      dateOfBirth: fhirPatient.birthDate || '',
      gender: fhirPatient.gender ? fhirPatient.gender.charAt(0).toUpperCase() + fhirPatient.gender.slice(1) : '',
      phoneNumber: phoneEntry ? phoneEntry.value : '',
      email: emailEntry ? emailEntry.value : '',
      addressLine1: addressLines[0] || '',
      addressLine2: addressLines[1] || '',
      city: address.city || '',
      state: address.state || '',
      zipCode: address.postalCode || '',
      country: address.country || '',
      isActive: fhirPatient.active !== false, // Default to true if not specified
    };
    
    // Add emergency contact if available
    if (emergencyContactEntry) {
      patient.emergencyContact = {
        name: emergencyContactEntry.name ? emergencyContactEntry.name.text : '',
        phoneNumber: emergencyContactEntry.telecom && emergencyContactEntry.telecom.length > 0 
          ? emergencyContactEntry.telecom[0].value 
          : ''
      };
    }
    
    return patient;
  }

  /**
   * Convert a medical record to FHIR Observation resource
   * @param {Object} medicalRecord - Internal medical record
   * @returns {Object} - FHIR Observation resource
   */
  convertToFhirObservation(medicalRecord) {
    return {
      resourceType: 'Observation',
      id: medicalRecord.id,
      status: 'final',
      category: [
        {
          coding: [
            {
              system: 'http://terminology.hl7.org/CodeSystem/observation-category',
              code: 'vital-signs',
              display: 'Vital Signs'
            }
          ]
        }
      ],
      code: {
        coding: [
          {
            system: 'http://loinc.org',
            code: medicalRecord.loincCode || '8310-5',
            display: medicalRecord.name || 'Body temperature'
          }
        ],
        text: medicalRecord.name
      },
      subject: {
        reference: `Patient/${medicalRecord.patientId}`
      },
      effectiveDateTime: medicalRecord.recordedAt,
      issued: medicalRecord.recordedAt,
      performer: [
        {
          reference: `Practitioner/${medicalRecord.recordedBy}`
        }
      ],
      valueQuantity: {
        value: medicalRecord.value,
        unit: medicalRecord.unit,
        system: 'http://unitsofmeasure.org',
        code: medicalRecord.unitCode || medicalRecord.unit
      },
      note: [
        {
          text: medicalRecord.notes
        }
      ]
    };
  }

  /**
   * Convert a medication to FHIR Medication resource
   * @param {Object} medication - Internal medication record
   * @returns {Object} - FHIR Medication resource
   */
  convertToFhirMedication(medication) {
    return {
      resourceType: 'Medication',
      id: medication.id,
      code: {
        coding: [
          {
            system: 'http://www.nlm.nih.gov/research/umls/rxnorm',
            code: medication.rxNormCode || '',
            display: medication.name
          }
        ],
        text: medication.name
      },
      status: medication.isActive ? 'active' : 'inactive',
      form: {
        coding: [
          {
            system: 'http://snomed.info/sct',
            code: medication.formCode || '',
            display: medication.form || ''
          }
        ],
        text: medication.form
      },
      amount: {
        numerator: {
          value: medication.strength,
          unit: medication.strengthUnit
        },
        denominator: {
          value: 1
        }
      },
      batch: {
        lotNumber: medication.lotNumber,
        expirationDate: medication.expirationDate
      }
    };
  }

  /**
   * Convert a patient medication to FHIR MedicationRequest resource
   * @param {Object} patientMedication - Internal patient medication record
   * @returns {Object} - FHIR MedicationRequest resource
   */
  convertToFhirMedicationRequest(patientMedication) {
    return {
      resourceType: 'MedicationRequest',
      id: patientMedication.id,
      status: patientMedication.status || 'active',
      intent: 'order',
      medicationReference: {
        reference: `Medication/${patientMedication.medicationId}`
      },
      subject: {
        reference: `Patient/${patientMedication.patientId}`
      },
      authoredOn: patientMedication.prescribedDate,
      requester: {
        reference: `Practitioner/${patientMedication.prescriberId}`
      },
      dosageInstruction: [
        {
          text: patientMedication.instructions,
          timing: {
            repeat: {
              frequency: patientMedication.frequency,
              period: patientMedication.period || 1,
              periodUnit: patientMedication.periodUnit || 'd'
            }
          },
          route: {
            coding: [
              {
                system: 'http://snomed.info/sct',
                code: patientMedication.routeCode || '',
                display: patientMedication.route
              }
            ],
            text: patientMedication.route
          },
          doseAndRate: [
            {
              doseQuantity: {
                value: patientMedication.dosage,
                unit: patientMedication.dosageUnit,
                system: 'http://unitsofmeasure.org',
                code: patientMedication.dosageUnitCode || patientMedication.dosageUnit
              }
            }
          ]
        }
      ],
      dispenseRequest: {
        numberOfRepeatsAllowed: patientMedication.refills || 0,
        quantity: {
          value: patientMedication.quantity,
          unit: patientMedication.quantityUnit
        },
        expectedSupplyDuration: {
          value: patientMedication.daysSupply,
          unit: 'days',
          system: 'http://unitsofmeasure.org',
          code: 'd'
        }
      },
      substitution: {
        allowedBoolean: patientMedication.allowSubstitution || false
      },
      note: [
        {
          text: patientMedication.notes
        }
      ]
    };
  }

  /**
   * Convert a document to FHIR DocumentReference resource
   * @param {Object} document - Internal document record
   * @returns {Object} - FHIR DocumentReference resource
   */
  convertToFhirDocumentReference(document) {
    // Map document type to LOINC code
    const getLoincCode = (type) => {
      const typeMap = {
        'lab_report': '11502-2',
        'radiology_report': '18748-4',
        'discharge_summary': '18842-5',
        'progress_note': '11506-3',
        'consultation_note': '11488-4',
        'history_physical': '34117-2',
        'procedure_note': '28570-0'
      };
      return typeMap[type] || '11502-2'; // Default to lab report if not found
    };

    return {
      resourceType: 'DocumentReference',
      id: document.id,
      status: document.status || 'current',
      docStatus: document.docStatus || 'final',
      type: {
        coding: [
          {
            system: 'http://loinc.org',
            code: getLoincCode(document.type),
            display: document.title
          }
        ]
      },
      category: [
        {
          coding: [
            {
              system: 'http://hl7.org/fhir/document-category',
              code: document.category || 'clinical-note',
              display: document.category || 'Clinical Note'
            }
          ]
        }
      ],
      subject: {
        reference: `Patient/${document.patientId}`
      },
      date: document.createdAt,
      author: [
        {
          reference: `Practitioner/${document.authorId}`
        }
      ],
      authenticator: {
        reference: `Practitioner/${document.authenticatorId || document.authorId}`
      },
      content: [
        {
          attachment: {
            contentType: document.mimeType,
            language: document.language || 'en-US',
            url: document.fileUrl,
            size: document.fileSize,
            hash: document.fileHash,
            title: document.title,
            creation: document.createdAt
          },
          format: {
            system: 'urn:oid:1.3.6.1.4.1.19376.1.2.3',
            code: document.format || 'urn:ihe:iti:xds:2017:mimeTypeSufficient',
            display: document.format || 'MimeType sufficient for content'
          }
        }
      ],
      context: {
        encounter: document.encounterId ? [
          {
            reference: `Encounter/${document.encounterId}`
          }
        ] : undefined,
        period: {
          start: document.periodStart,
          end: document.periodEnd
        },
        facilityType: {
          coding: [
            {
              system: 'http://snomed.info/sct',
              code: document.facilityTypeCode || '',
              display: document.facilityType || ''
            }
          ]
        }
      },
      securityLabel: [
        {
          coding: [
            {
              system: 'http://terminology.hl7.org/CodeSystem/v3-Confidentiality',
              code: document.confidentiality || 'N',
              display: document.confidentiality === 'R' ? 'Restricted' : 
                      document.confidentiality === 'V' ? 'Very Restricted' : 'Normal'
            }
          ]
        }
      ]
    };
  }

  /**
   * Get capability statement from FHIR server
   * @returns {Promise<Object>} - FHIR CapabilityStatement
   */
  async getCapabilityStatement() {
    try {
      const response = await this.client.get('/metadata');
      return response.data;
    } catch (error) {
      console.error('Failed to get FHIR capability statement:', error);
      throw error;
    }
  }

  /**
   * Validate a FHIR resource against the server
   * @param {string} resourceType - FHIR resource type
   * @param {Object} resource - FHIR resource to validate
   * @returns {Promise<Object>} - Validation result
   */
  async validateResource(resourceType, resource) {
    try {
      const response = await this.client.post(`/${resourceType}/$validate`, resource);
      return response.data;
    } catch (error) {
      console.error(`Failed to validate FHIR ${resourceType} resource:`, error);
      throw error;
    }
  }
}

module.exports = new FhirService();