/**
 * Validation Middleware
 * Centralizes request validation using Joi
 */

const Joi = require('joi');

/**
 * Validate request middleware factory
 * Creates middleware that validates request data against a Joi schema
 * @param {Object} schema - Joi schema with body, query, params keys
 * @param {String} property - Request property to validate (body, query, params)
 * @returns {Function} - Express middleware function
 */
const validate = (schema, property = 'body') => {
  return (req, res, next) => {
    const dataToValidate = req[property];
    const { error, value } = schema.validate(dataToValidate, {
      abortEarly: false,
      stripUnknown: true,
      errors: {
        wrap: {
          label: false
        }
      }
    });

    if (error) {
      const errorMessages = error.details.map(detail => detail.message);
      return res.status(400).json({
        success: false,
        error: 'Validation error',
        details: errorMessages
      });
    }

    // Replace request data with validated data
    req[property] = value;
    next();
  };
};

/**
 * Common validation schemas
 */
const schemas = {
  // Patient schemas
  patient: {
    create: Joi.object({
      first_name: Joi.string().required(),
      last_name: Joi.string().required(),
      date_of_birth: Joi.date().iso().required(),
      gender: Joi.string().valid('male', 'female', 'other', 'unknown').required(),
      ssn: Joi.string().pattern(/^\d{3}-\d{2}-\d{4}$/).allow(null, ''),
      address: Joi.object({
        street: Joi.string().required(),
        city: Joi.string().required(),
        state: Joi.string().required(),
        zip: Joi.string().required(),
        country: Joi.string().required()
      }),
      phone: Joi.string().pattern(/^\d{3}-\d{3}-\d{4}$/).required(),
      email: Joi.string().email().allow(null, ''),
      emergency_contact: Joi.object({
        name: Joi.string().required(),
        relationship: Joi.string().required(),
        phone: Joi.string().pattern(/^\d{3}-\d{3}-\d{4}$/).required()
      }),
      insurance: Joi.object({
        provider: Joi.string().required(),
        policy_number: Joi.string().required(),
        group_number: Joi.string().allow(null, ''),
        coverage_dates: Joi.object({
          start: Joi.date().iso().required(),
          end: Joi.date().iso().allow(null)
        })
      }),
      medical_history: Joi.object({
        allergies: Joi.array().items(Joi.string()),
        chronic_conditions: Joi.array().items(Joi.string()),
        current_medications: Joi.array().items(Joi.string()),
        past_surgeries: Joi.array().items(Joi.string())
      }),
      primary_care_physician: Joi.string().allow(null, '')
    }),
    update: Joi.object({
      first_name: Joi.string(),
      last_name: Joi.string(),
      date_of_birth: Joi.date().iso(),
      gender: Joi.string().valid('male', 'female', 'other', 'unknown'),
      ssn: Joi.string().pattern(/^\d{3}-\d{2}-\d{4}$/).allow(null, ''),
      address: Joi.object({
        street: Joi.string(),
        city: Joi.string(),
        state: Joi.string(),
        zip: Joi.string(),
        country: Joi.string()
      }),
      phone: Joi.string().pattern(/^\d{3}-\d{3}-\d{4}$/),
      email: Joi.string().email().allow(null, ''),
      emergency_contact: Joi.object({
        name: Joi.string(),
        relationship: Joi.string(),
        phone: Joi.string().pattern(/^\d{3}-\d{3}-\d{4}$/)
      }),
      insurance: Joi.object({
        provider: Joi.string(),
        policy_number: Joi.string(),
        group_number: Joi.string().allow(null, ''),
        coverage_dates: Joi.object({
          start: Joi.date().iso(),
          end: Joi.date().iso().allow(null)
        })
      }),
      medical_history: Joi.object({
        allergies: Joi.array().items(Joi.string()),
        chronic_conditions: Joi.array().items(Joi.string()),
        current_medications: Joi.array().items(Joi.string()),
        past_surgeries: Joi.array().items(Joi.string())
      }),
      primary_care_physician: Joi.string().allow(null, '')
    }),
    query: Joi.object({
      page: Joi.number().integer().min(1).default(1),
      limit: Joi.number().integer().min(1).max(100).default(10),
      sort_by: Joi.string().valid('first_name', 'last_name', 'date_of_birth', 'created_at').default('created_at'),
      sort_order: Joi.string().valid('asc', 'desc').default('desc'),
      search: Joi.string(),
      gender: Joi.string().valid('male', 'female', 'other', 'unknown'),
      min_age: Joi.number().integer().min(0),
      max_age: Joi.number().integer().min(0)
    })
  },
  
  // Consent schemas
  consent: {
    create: Joi.object({
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
    }),
    update: Joi.object({
      consent_type: Joi.string().valid('full_access', 'limited_access', 'emergency_access', 'research_use'),
      data_types: Joi.array().items(Joi.string().valid(
        'demographics', 'medications', 'lab_results', 'imaging', 'diagnoses',
        'procedures', 'allergies', 'immunizations', 'vitals', 'notes'
      )).min(1),
      end_date: Joi.date().iso(),
      purpose: Joi.string(),
      additional_notes: Joi.string()
    }),
    query: Joi.object({
      patient_id: Joi.string(),
      hospital_id: Joi.string(),
      consent_type: Joi.string().valid('full_access', 'limited_access', 'emergency_access', 'research_use'),
      status: Joi.string().valid('active', 'expired', 'revoked'),
      page: Joi.number().integer().min(1).default(1),
      limit: Joi.number().integer().min(1).max(100).default(10),
      sort_by: Joi.string().valid('created_at', 'start_date', 'end_date').default('created_at'),
      sort_order: Joi.string().valid('asc', 'desc').default('desc')
    })
  },
  
  // Hospital schemas
  hospital: {
    register: Joi.object({
      name: Joi.string().required(),
      address: Joi.object({
        street: Joi.string().required(),
        city: Joi.string().required(),
        state: Joi.string().required(),
        zip: Joi.string().required(),
        country: Joi.string().required()
      }).required(),
      contact_email: Joi.string().email().required(),
      contact_phone: Joi.string().pattern(/^\d{3}-\d{3}-\d{4}$/).required(),
      website: Joi.string().uri(),
      type: Joi.string().valid('general', 'specialty', 'teaching', 'community', 'rural', 'childrens').required(),
      bed_count: Joi.number().integer().min(1),
      network_address: Joi.string().ip().required(),
      api_endpoint: Joi.string().uri().required()
    }),
    update: Joi.object({
      name: Joi.string(),
      address: Joi.object({
        street: Joi.string(),
        city: Joi.string(),
        state: Joi.string(),
        zip: Joi.string(),
        country: Joi.string()
      }),
      contact_email: Joi.string().email(),
      contact_phone: Joi.string().pattern(/^\d{3}-\d{3}-\d{4}$/),
      website: Joi.string().uri(),
      type: Joi.string().valid('general', 'specialty', 'teaching', 'community', 'rural', 'childrens'),
      bed_count: Joi.number().integer().min(1),
      network_address: Joi.string().ip(),
      api_endpoint: Joi.string().uri()
    }),
    query: Joi.object({
      page: Joi.number().integer().min(1).default(1),
      limit: Joi.number().integer().min(1).max(100).default(10),
      sort_by: Joi.string().valid('name', 'type', 'created_at').default('name'),
      sort_order: Joi.string().valid('asc', 'desc').default('asc'),
      search: Joi.string(),
      type: Joi.string().valid('general', 'specialty', 'teaching', 'community', 'rural', 'childrens'),
      country: Joi.string(),
      state: Joi.string()
    })
  },
  
  // Cross-hospital schemas
  crossHospital: {
    requestAccess: Joi.object({
      patient_id: Joi.string().required(),
      target_hospital_id: Joi.string().required(),
      purpose: Joi.string().required(),
      requested_data_types: Joi.array().items(Joi.string().valid(
        'demographics', 'medications', 'lab_results', 'imaging', 'diagnoses',
        'procedures', 'allergies', 'immunizations', 'vitals', 'notes'
      )).min(1).required(),
      urgency: Joi.string().valid('routine', 'urgent', 'emergency').default('routine'),
      requested_duration_hours: Joi.number().integer().min(1).max(72).default(24)
    }),
    approveAccess: Joi.object({
      request_id: Joi.string().required(),
      approved_data_types: Joi.array().items(Joi.string().valid(
        'demographics', 'medications', 'lab_results', 'imaging', 'diagnoses',
        'procedures', 'allergies', 'immunizations', 'vitals', 'notes'
      )).min(1).required(),
      access_duration_hours: Joi.number().integer().min(1).max(72).required(),
      approval_notes: Joi.string()
    }),
    denyAccess: Joi.object({
      request_id: Joi.string().required(),
      denial_reason: Joi.string().required()
    })
  },
  
  // Document schemas
  document: {
    upload: Joi.object({
      patient_id: Joi.string().required(),
      document_type: Joi.string().valid(
        'clinical_note', 'lab_report', 'imaging_report', 'prescription',
        'discharge_summary', 'referral', 'consent_form', 'insurance'
      ).required(),
      title: Joi.string().required(),
      description: Joi.string(),
      author: Joi.string().required(),
      facility: Joi.string(),
      department: Joi.string(),
      tags: Joi.array().items(Joi.string())
    }),
    query: Joi.object({
      patient_id: Joi.string(),
      document_type: Joi.string().valid(
        'clinical_note', 'lab_report', 'imaging_report', 'prescription',
        'discharge_summary', 'referral', 'consent_form', 'insurance'
      ),
      start_date: Joi.date().iso(),
      end_date: Joi.date().iso(),
      author: Joi.string(),
      tags: Joi.array().items(Joi.string()),
      page: Joi.number().integer().min(1).default(1),
      limit: Joi.number().integer().min(1).max(100).default(10),
      sort_by: Joi.string().valid('created_at', 'title', 'document_type').default('created_at'),
      sort_order: Joi.string().valid('asc', 'desc').default('desc')
    })
  },
  
  // Medication schemas
  medication: {
    create: Joi.object({
      patient_id: Joi.string().required(),
      medication_name: Joi.string().required(),
      dosage: Joi.string().required(),
      frequency: Joi.string().required(),
      route: Joi.string().required(),
      start_date: Joi.date().iso().required(),
      end_date: Joi.date().iso(),
      prescriber: Joi.string().required(),
      pharmacy: Joi.string(),
      reason: Joi.string(),
      instructions: Joi.string(),
      status: Joi.string().valid('active', 'completed', 'cancelled', 'on-hold').default('active'),
      medication_code: Joi.object({
        system: Joi.string().valid('RxNorm', 'NDC', 'SNOMED CT').required(),
        code: Joi.string().required(),
        display: Joi.string().required()
      }),
      notes: Joi.string()
    }),
    update: Joi.object({
      dosage: Joi.string(),
      frequency: Joi.string(),
      route: Joi.string(),
      end_date: Joi.date().iso(),
      status: Joi.string().valid('active', 'completed', 'cancelled', 'on-hold'),
      instructions: Joi.string(),
      notes: Joi.string()
    }),
    query: Joi.object({
      patient_id: Joi.string(),
      status: Joi.string().valid('active', 'completed', 'cancelled', 'on-hold'),
      medication_name: Joi.string(),
      prescriber: Joi.string(),
      start_date: Joi.date().iso(),
      end_date: Joi.date().iso(),
      page: Joi.number().integer().min(1).default(1),
      limit: Joi.number().integer().min(1).max(100).default(10),
      sort_by: Joi.string().valid('start_date', 'medication_name', 'status').default('start_date'),
      sort_order: Joi.string().valid('asc', 'desc').default('desc')
    })
  }
};

module.exports = {
  validate,
  schemas
};