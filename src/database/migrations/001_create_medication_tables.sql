-- Migration: Create Medication Tables

-- Create medications table (reference table for all available medications)
CREATE TABLE IF NOT EXISTS medications (
  id UUID PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  rxnorm_code VARCHAR(50),
  form VARCHAR(100),
  strength VARCHAR(100),
  manufacturer VARCHAR(255),
  barcode VARCHAR(100) UNIQUE,
  ndc_code VARCHAR(50),
  description TEXT,
  contraindications TEXT,
  side_effects TEXT,
  interactions TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create index on medication name for faster searches
CREATE INDEX IF NOT EXISTS idx_medications_name ON medications(LOWER(name));

-- Create index on barcode for scanning
CREATE INDEX IF NOT EXISTS idx_medications_barcode ON medications(barcode);

-- Create index on RxNorm code
CREATE INDEX IF NOT EXISTS idx_medications_rxnorm ON medications(rxnorm_code);

-- Create patient_medications table (for tracking patient medication records)
CREATE TABLE IF NOT EXISTS patient_medications (
  id UUID PRIMARY KEY,
  patient_id UUID NOT NULL,
  hospital_id UUID NOT NULL,
  name VARCHAR(255) NOT NULL,
  rxnorm_code VARCHAR(50),
  dosage VARCHAR(100) NOT NULL,
  frequency VARCHAR(100) NOT NULL,
  route VARCHAR(50) NOT NULL,
  start_date TIMESTAMP WITH TIME ZONE NOT NULL,
  end_date TIMESTAMP WITH TIME ZONE,
  prescribed_by VARCHAR(255) NOT NULL,
  active BOOLEAN DEFAULT TRUE,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  created_by UUID NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_by UUID NOT NULL,
  CONSTRAINT fk_patient_medications_patient
    FOREIGN KEY (patient_id)
    REFERENCES patients(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_patient_medications_hospital
    FOREIGN KEY (hospital_id)
    REFERENCES hospitals(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_patient_medications_created_by
    FOREIGN KEY (created_by)
    REFERENCES users(id),
  CONSTRAINT fk_patient_medications_updated_by
    FOREIGN KEY (updated_by)
    REFERENCES users(id)
);

-- Create indexes for patient_medications
CREATE INDEX IF NOT EXISTS idx_patient_medications_patient_id ON patient_medications(patient_id);
CREATE INDEX IF NOT EXISTS idx_patient_medications_hospital_id ON patient_medications(hospital_id);
CREATE INDEX IF NOT EXISTS idx_patient_medications_active ON patient_medications(active);
CREATE INDEX IF NOT EXISTS idx_patient_medications_start_date ON patient_medications(start_date);

-- Create medication_inventory table (for tracking hospital medication inventory)
CREATE TABLE IF NOT EXISTS medication_inventory (
  id UUID PRIMARY KEY,
  hospital_id UUID NOT NULL,
  medication_id UUID NOT NULL,
  batch_number VARCHAR(100),
  lot_number VARCHAR(100),
  expiration_date DATE NOT NULL,
  quantity INTEGER NOT NULL,
  unit VARCHAR(50) NOT NULL,
  location VARCHAR(255),
  status VARCHAR(50) DEFAULT 'available',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_medication_inventory_hospital
    FOREIGN KEY (hospital_id)
    REFERENCES hospitals(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_medication_inventory_medication
    FOREIGN KEY (medication_id)
    REFERENCES medications(id)
    ON DELETE CASCADE
);

-- Create indexes for medication_inventory
CREATE INDEX IF NOT EXISTS idx_medication_inventory_hospital_id ON medication_inventory(hospital_id);
CREATE INDEX IF NOT EXISTS idx_medication_inventory_medication_id ON medication_inventory(medication_id);
CREATE INDEX IF NOT EXISTS idx_medication_inventory_expiration ON medication_inventory(expiration_date);
CREATE INDEX IF NOT EXISTS idx_medication_inventory_status ON medication_inventory(status);

-- Create medication_administration table (for tracking when medications are given to patients)
CREATE TABLE IF NOT EXISTS medication_administration (
  id UUID PRIMARY KEY,
  patient_medication_id UUID NOT NULL,
  patient_id UUID NOT NULL,
  administered_by UUID NOT NULL,
  administered_at TIMESTAMP WITH TIME ZONE NOT NULL,
  dosage_given VARCHAR(100) NOT NULL,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_medication_administration_patient_medication
    FOREIGN KEY (patient_medication_id)
    REFERENCES patient_medications(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_medication_administration_patient
    FOREIGN KEY (patient_id)
    REFERENCES patients(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_medication_administration_administered_by
    FOREIGN KEY (administered_by)
    REFERENCES users(id)
);

-- Create indexes for medication_administration
CREATE INDEX IF NOT EXISTS idx_medication_administration_patient_id ON medication_administration(patient_id);
CREATE INDEX IF NOT EXISTS idx_medication_administration_administered_at ON medication_administration(administered_at);

-- Create medication_alerts table (for tracking medication alerts like interactions, allergies, etc.)
CREATE TABLE IF NOT EXISTS medication_alerts (
  id UUID PRIMARY KEY,
  patient_id UUID NOT NULL,
  medication_id UUID,
  patient_medication_id UUID,
  alert_type VARCHAR(50) NOT NULL,
  severity VARCHAR(50) NOT NULL,
  description TEXT NOT NULL,
  status VARCHAR(50) DEFAULT 'active',
  acknowledged_by UUID,
  acknowledged_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_medication_alerts_patient
    FOREIGN KEY (patient_id)
    REFERENCES patients(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_medication_alerts_medication
    FOREIGN KEY (medication_id)
    REFERENCES medications(id)
    ON DELETE SET NULL,
  CONSTRAINT fk_medication_alerts_patient_medication
    FOREIGN KEY (patient_medication_id)
    REFERENCES patient_medications(id)
    ON DELETE SET NULL,
  CONSTRAINT fk_medication_alerts_acknowledged_by
    FOREIGN KEY (acknowledged_by)
    REFERENCES users(id)
);

-- Create indexes for medication_alerts
CREATE INDEX IF NOT EXISTS idx_medication_alerts_patient_id ON medication_alerts(patient_id);
CREATE INDEX IF NOT EXISTS idx_medication_alerts_status ON medication_alerts(status);
CREATE INDEX IF NOT EXISTS idx_medication_alerts_severity ON medication_alerts(severity);

-- Create audit triggers for medication tables
CREATE OR REPLACE FUNCTION log_medication_changes()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO audit_logs (
    action,
    table_name,
    record_id,
    old_data,
    new_data,
    user_id,
    ip_address
  ) VALUES (
    TG_OP,
    TG_TABLE_NAME,
    CASE
      WHEN TG_OP = 'DELETE' THEN OLD.id
      ELSE NEW.id
    END,
    CASE
      WHEN TG_OP = 'DELETE' THEN row_to_json(OLD)
      WHEN TG_OP = 'UPDATE' THEN row_to_json(OLD)
      ELSE NULL
    END,
    CASE
      WHEN TG_OP = 'DELETE' THEN NULL
      ELSE row_to_json(NEW)
    END,
    CASE
      WHEN TG_OP = 'DELETE' THEN NULL
      WHEN TG_OP = 'UPDATE' THEN NEW.updated_by
      WHEN TG_OP = 'INSERT' THEN NEW.created_by
      ELSE NULL
    END,
    current_setting('request.client_ip', TRUE)
  );
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for patient_medications table
CREATE TRIGGER patient_medications_audit_insert
AFTER INSERT ON patient_medications
FOR EACH ROW EXECUTE FUNCTION log_medication_changes();

CREATE TRIGGER patient_medications_audit_update
AFTER UPDATE ON patient_medications
FOR EACH ROW EXECUTE FUNCTION log_medication_changes();

CREATE TRIGGER patient_medications_audit_delete
AFTER DELETE ON patient_medications
FOR EACH ROW EXECUTE FUNCTION log_medication_changes();

-- Create triggers for medication_administration table
CREATE TRIGGER medication_administration_audit_insert
AFTER INSERT ON medication_administration
FOR EACH ROW EXECUTE FUNCTION log_medication_changes();

CREATE TRIGGER medication_administration_audit_update
AFTER UPDATE ON medication_administration
FOR EACH ROW EXECUTE FUNCTION log_medication_changes();

CREATE TRIGGER medication_administration_audit_delete
AFTER DELETE ON medication_administration
FOR EACH ROW EXECUTE FUNCTION log_medication_changes();