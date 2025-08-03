# Hospital Network Management System - Project Structure

## Directory Structure

```
/
├── src/                          # Source code
│   ├── backend/                  # Backend code
│   │   ├── controllers/          # API controllers
│   │   ├── services/             # Business logic services
│   │   ├── models/               # Data models
│   │   ├── routes/               # API routes
│   │   ├── middleware/           # Express middleware
│   │   └── utils/                # Utility functions
│   ├── frontend/                 # Frontend code
│   │   ├── components/           # React components
│   │   ├── pages/                # Page components
│   │   ├── services/             # API service clients
│   │   └── utils/                # Utility functions
│   ├── database/                 # Database scripts
│   │   └── migrations/           # Database migrations
│   ├── security/                 # Security implementation
│   └── ai/                       # AI/ML modules
├── logs/                         # Application logs
├── uploads/                      # Uploaded files
├── dicom_storage/                # DICOM files storage
├── audit_logs/                   # Immutable audit logs
└── certs/                        # SSL certificates
```

## Key Components

### Backend Services

1. **ApiGatewayService**
   - Centralizes and secures API traffic
   - Handles authentication, authorization, and rate limiting
   - Routes requests to appropriate internal services

2. **NetworkService**
   - Manages secure connections between hospitals
   - Handles hospital discovery and registration
   - Implements heartbeat monitoring

3. **FhirService**
   - Implements HL7 FHIR protocol for healthcare data exchange
   - Converts internal data models to FHIR resources
   - Handles FHIR server connections and requests

4. **DicomService**
   - Implements DICOM protocol for medical imaging exchange
   - Manages DICOM studies, series, and instances
   - Handles anonymization and encryption of DICOM data

5. **MessageBrokerService**
   - Enables event-driven architecture for real-time synchronization
   - Supports RabbitMQ and Apache Kafka
   - Handles message publishing and subscribing

6. **AuditService**
   - Provides immutable audit logging for all system operations
   - Supports multiple storage options (file, database, S3)
   - Implements log rotation, retention, and security features

7. **DocumentService**
   - Manages document storage, versioning, and processing
   - Handles document uploads, retrieval, and deletion
   - Integrates with AI service for document validation

8. **MedicationService**
   - Manages medication records and inventory
   - Handles barcode scanning and medication validation
   - Tracks patient medication history

9. **CrossHospitalService**
   - Facilitates secure record sharing between hospitals
   - Manages patient consent and access tokens
   - Handles cross-hospital requests and responses

### Frontend Modules

1. **MedicationManagement**
   - Interface for managing patient medications
   - Supports barcode scanning and medication search
   - Displays medication history and alerts

2. **DocumentManagement**
   - Interface for document upload, preview, and management
   - Supports versioning and document tagging
   - Displays AI validation results

3. **PatientRecordSharing**
   - Interface for consent management and cross-hospital access
   - Displays patient consent history
   - Allows granting and revoking access

## Data Flow

1. **Patient Registration**
   - Patient data is collected and stored in the local hospital database
   - A global patient identifier is generated
   - Consent preferences are recorded

2. **Cross-Hospital Access**
   - Patient grants consent for another hospital to access their records
   - Consent is recorded in the patient_consents table
   - Access token is generated and provided to the requesting hospital
   - Requesting hospital uses the token to access patient records

3. **Document Upload and Validation**
   - Document is uploaded through the DocumentManagement interface
   - File is stored in the uploads directory
   - Document metadata is recorded in the documents table
   - AI service processes the document for validation
   - Validation results are stored and displayed to the user

4. **Medication Management**
   - Medication is scanned using barcode scanner
   - Medication information is retrieved from the database
   - Medication is added to the patient's medication list
   - Event is published to the message broker for real-time updates