-- Hospital Network Management System Database Schema

-- Enable UUID extension for global identifiers
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Enable pgcrypto for encryption functions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Hospitals table
CREATE TABLE hospitals (
    hospital_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    address TEXT NOT NULL,
    contact_email VARCHAR(255) NOT NULL,
    contact_phone VARCHAR(50) NOT NULL,
    api_key VARCHAR(255) NOT NULL,
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Patients table with global identifier
CREATE TABLE patients (
    patient_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    global_id VARCHAR(255) UNIQUE NOT NULL,  -- Unique global identifier
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    date_of_birth DATE NOT NULL,
    gender VARCHAR(20),
    address TEXT,
    contact_phone VARCHAR(50),
    contact_email VARCHAR(255),
    blood_type VARCHAR(10),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    -- Encrypted fields
    encrypted_ssn BYTEA,  -- Social Security Number or equivalent
    encrypted_insurance_info BYTEA
);

-- Patient consent records
CREATE TABLE patient_consents (
    consent_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    patient_id UUID NOT NULL REFERENCES patients(patient_id),
    consenting_hospital_id UUID NOT NULL REFERENCES hospitals(hospital_id),
    target_hospital_id UUID NOT NULL REFERENCES hospitals(hospital_id),
    consent_type VARCHAR(50) NOT NULL,  -- e.g., 'full_access', 'read_only', 'specific_data'
    specific_data_types JSONB,  -- If consent_type is 'specific_data', specify which data types
    start_date TIMESTAMP WITH TIME ZONE NOT NULL,
    end_date TIMESTAMP WITH TIME ZONE,  -- NULL means indefinite
    consent_document_path TEXT,  -- Path to stored consent document
    consent_verified BOOLEAN DEFAULT FALSE,
    verification_method VARCHAR(50),  -- e.g., 'in_person', 'digital_signature', 'two_factor'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT different_hospitals CHECK (consenting_hospital_id != target_hospital_id)
);

-- Medical records table
CREATE TABLE medical_records (
    record_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    patient_id UUID NOT NULL REFERENCES patients(patient_id),
    hospital_id UUID NOT NULL REFERENCES hospitals(hospital_id),
    record_type VARCHAR(50) NOT NULL,  -- e.g., 'visit', 'lab_result', 'prescription', 'imaging'
    record_date TIMESTAMP WITH TIME ZONE NOT NULL,
    provider_id UUID,  -- Reference to healthcare provider
    diagnosis_codes JSONB,  -- Array of diagnosis codes (ICD-10, etc.)
    notes TEXT,
    data JSONB NOT NULL,  -- Flexible data structure based on record_type
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Medications table using standardized codes
CREATE TABLE medications (
    medication_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    rxnorm_code VARCHAR(20) NOT NULL,  -- RxNorm standard code
    snomed_ct_code VARCHAR(20),  -- SNOMED CT code if available
    name VARCHAR(255) NOT NULL,
    form VARCHAR(50) NOT NULL,  -- e.g., 'tablet', 'capsule', 'liquid'
    strength VARCHAR(50) NOT NULL,  -- e.g., '10mg', '500mg'
    manufacturer VARCHAR(255),
    barcode_gs1 VARCHAR(100) UNIQUE,  -- GS1 standard barcode
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Patient medications
CREATE TABLE patient_medications (
    patient_medication_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    patient_id UUID NOT NULL REFERENCES patients(patient_id),
    medication_id UUID NOT NULL REFERENCES medications(medication_id),
    hospital_id UUID NOT NULL REFERENCES hospitals(hospital_id),
    prescriber_id UUID NOT NULL,  -- Reference to healthcare provider
    dosage VARCHAR(50) NOT NULL,  -- e.g., '1 tablet'
    frequency VARCHAR(100) NOT NULL,  -- e.g., 'twice daily', 'every 8 hours'
    route VARCHAR(50) NOT NULL,  -- e.g., 'oral', 'intravenous'
    prescribed_date DATE NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE,  -- NULL means ongoing
    instructions TEXT,
    reason TEXT,
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Document metadata table
CREATE TABLE documents (
    document_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    patient_id UUID NOT NULL REFERENCES patients(patient_id),
    hospital_id UUID NOT NULL REFERENCES hospitals(hospital_id),
    document_type VARCHAR(50) NOT NULL,  -- e.g., 'mri', 'ct_scan', 'x_ray', 'lab_report', 'discharge_summary'
    title VARCHAR(255) NOT NULL,
    description TEXT,
    file_path TEXT NOT NULL,  -- Path in S3-compatible storage
    file_size BIGINT NOT NULL,
    mime_type VARCHAR(100) NOT NULL,
    md5_checksum VARCHAR(32) NOT NULL,
    upload_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    document_date TIMESTAMP WITH TIME ZONE,  -- When the document was created/performed
    uploader_id UUID NOT NULL,  -- Reference to user who uploaded
    version INTEGER DEFAULT 1,
    tags JSONB,  -- Searchable tags
    ai_processed BOOLEAN DEFAULT FALSE,
    ai_extracted_data JSONB,  -- Data extracted by AI/OCR
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Audit logs table (immutable)
CREATE TABLE audit_logs (
    log_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    actor_id UUID NOT NULL,  -- User who performed the action
    actor_hospital_id UUID NOT NULL REFERENCES hospitals(hospital_id),
    action_type VARCHAR(50) NOT NULL,  -- e.g., 'view', 'create', 'update', 'delete', 'share'
    resource_type VARCHAR(50) NOT NULL,  -- e.g., 'patient', 'medical_record', 'medication', 'document'
    resource_id UUID NOT NULL,  -- ID of the affected resource
    patient_id UUID,  -- Patient associated with the resource (if applicable)
    details JSONB NOT NULL,  -- Additional details about the action
    ip_address VARCHAR(45) NOT NULL,  -- IPv4 or IPv6 address
    user_agent TEXT,  -- Browser/client information
    success BOOLEAN NOT NULL,  -- Whether the action was successful
    CONSTRAINT audit_logs_immutable CHECK (TRUE)  -- Prevents updates to this table
);

-- Create a rule to prevent updates to audit_logs
CREATE RULE audit_logs_no_update AS ON UPDATE TO audit_logs DO INSTEAD NOTHING;

-- Create a rule to prevent deletions from audit_logs
CREATE RULE audit_logs_no_delete AS ON DELETE TO audit_logs DO INSTEAD NOTHING;

-- Access tokens for cross-hospital access
CREATE TABLE access_tokens (
    token_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    token VARCHAR(255) UNIQUE NOT NULL,
    patient_id UUID NOT NULL REFERENCES patients(patient_id),
    requesting_hospital_id UUID NOT NULL REFERENCES hospitals(hospital_id),
    target_hospital_id UUID NOT NULL REFERENCES hospitals(hospital_id),
    consent_id UUID NOT NULL REFERENCES patient_consents(consent_id),
    permissions JSONB NOT NULL,  -- Specific permissions granted
    issued_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    revoked BOOLEAN DEFAULT FALSE,
    revoked_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT different_hospitals CHECK (requesting_hospital_id != target_hospital_id)
);

-- Indexes for performance
CREATE INDEX idx_patients_global_id ON patients(global_id);
CREATE INDEX idx_medical_records_patient_id ON medical_records(patient_id);
CREATE INDEX idx_medical_records_hospital_id ON medical_records(hospital_id);
CREATE INDEX idx_patient_medications_patient_id ON patient_medications(patient_id);
CREATE INDEX idx_documents_patient_id ON documents(patient_id);
CREATE INDEX idx_documents_hospital_id ON documents(hospital_id);
CREATE INDEX idx_documents_tags ON documents USING GIN (tags);
CREATE INDEX idx_audit_logs_timestamp ON audit_logs(timestamp);
CREATE INDEX idx_audit_logs_actor_id ON audit_logs(actor_id);
CREATE INDEX idx_audit_logs_resource_id ON audit_logs(resource_id);
CREATE INDEX idx_audit_logs_patient_id ON audit_logs(patient_id);

-- Full-text search for documents
CREATE INDEX idx_documents_fts ON documents USING GIN (to_tsvector('english', title || ' ' || description));