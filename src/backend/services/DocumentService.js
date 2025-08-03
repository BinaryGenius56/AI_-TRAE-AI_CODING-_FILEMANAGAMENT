/**
 * Document Service
 * Handles business logic for document management including CRUD operations,
 * version control, and patient access control
 */

const db = require('../database/connection');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');

class DocumentService {
  /**
   * Get documents with filtering and pagination
   * @param {Object} filters - Filter criteria
   * @param {number} page - Page number
   * @param {number} limit - Items per page
   * @returns {Promise<Object>} - Paginated documents and count
   */
  async getDocuments(filters = {}, page = 1, limit = 10) {
    try {
      const offset = (page - 1) * limit;
      
      // Build query conditions
      let conditions = 'WHERE deleted = FALSE';
      const queryParams = [];
      
      if (filters.patientId) {
        conditions += ' AND patient_id = $' + (queryParams.length + 1);
        queryParams.push(filters.patientId);
      }
      
      if (filters.type) {
        conditions += ' AND type = $' + (queryParams.length + 1);
        queryParams.push(filters.type);
      }
      
      if (filters.status) {
        conditions += ' AND status = $' + (queryParams.length + 1);
        queryParams.push(filters.status);
      }
      
      if (filters.dateFrom) {
        conditions += ' AND created_at >= $' + (queryParams.length + 1);
        queryParams.push(filters.dateFrom);
      }
      
      if (filters.dateTo) {
        conditions += ' AND created_at <= $' + (queryParams.length + 1);
        queryParams.push(filters.dateTo);
      }
      
      if (filters.searchTerm) {
        conditions += ' AND (title ILIKE $' + (queryParams.length + 1) + 
                    ' OR tags @> $' + (queryParams.length + 2) + '::jsonb)';
        queryParams.push(`%${filters.searchTerm}%`);
        queryParams.push(JSON.stringify([filters.searchTerm.toLowerCase()]));
      }
      
      // Count total documents matching filters
      const countQuery = `
        SELECT COUNT(*) 
        FROM documents 
        ${conditions}
      `;
      
      const countResult = await db.query(countQuery, queryParams);
      const totalCount = parseInt(countResult.rows[0].count, 10);
      
      // Get documents with pagination
      const documentsQuery = `
        SELECT 
          d.id, 
          d.patient_id AS "patientId", 
          d.title, 
          d.type, 
          d.file_type AS "fileType", 
          d.original_filename AS "originalFilename", 
          d.file_size AS "fileSize", 
          d.tags, 
          d.status, 
          d.ai_processed AS "aiProcessed", 
          d.ai_findings AS "aiFindings", 
          d.created_at AS "createdAt", 
          d.updated_at AS "updatedAt",
          u.full_name AS "uploadedBy"
        FROM documents d
        LEFT JOIN users u ON d.uploaded_by = u.id
        ${conditions}
        ORDER BY d.created_at DESC
        LIMIT $${queryParams.length + 1} OFFSET $${queryParams.length + 2}
      `;
      
      queryParams.push(limit, offset);
      
      const documentsResult = await db.query(documentsQuery, queryParams);
      
      // Calculate pagination metadata
      const totalPages = Math.ceil(totalCount / limit);
      
      return {
        documents: documentsResult.rows,
        pagination: {
          total: totalCount,
          page,
          limit,
          totalPages,
          hasNext: page < totalPages,
          hasPrev: page > 1
        }
      };
    } catch (error) {
      console.error('Error in getDocuments:', error);
      throw error;
    }
  }
  
  /**
   * Get a document by ID
   * @param {string} id - Document ID
   * @returns {Promise<Object>} - Document object
   */
  async getDocumentById(id) {
    try {
      const query = `
        SELECT 
          d.id, 
          d.patient_id AS "patientId", 
          d.title, 
          d.type, 
          d.file_type AS "fileType", 
          d.file_path AS "filePath", 
          d.original_filename AS "originalFilename", 
          d.file_size AS "fileSize", 
          d.tags, 
          d.status, 
          d.ai_processed AS "aiProcessed", 
          d.ai_findings AS "aiFindings", 
          d.created_at AS "createdAt", 
          d.updated_at AS "updatedAt",
          u.full_name AS "uploadedBy"
        FROM documents d
        LEFT JOIN users u ON d.uploaded_by = u.id
        WHERE d.id = $1 AND d.deleted = FALSE
      `;
      
      const result = await db.query(query, [id]);
      
      if (result.rows.length === 0) {
        return null;
      }
      
      return result.rows[0];
    } catch (error) {
      console.error('Error in getDocumentById:', error);
      throw error;
    }
  }
  
  /**
   * Create a new document
   * @param {Object} documentData - Document data
   * @returns {Promise<Object>} - Created document
   */
  async createDocument(documentData) {
    try {
      const {
        patientId,
        title,
        type,
        fileType,
        filePath,
        fileSize,
        originalFilename,
        uploadedBy,
        tags,
        status
      } = documentData;
      
      const query = `
        INSERT INTO documents (
          id,
          patient_id,
          title,
          type,
          file_type,
          file_path,
          file_size,
          original_filename,
          uploaded_by,
          tags,
          status,
          ai_processed,
          created_at,
          updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW(), NOW())
        RETURNING 
          id, 
          patient_id AS "patientId", 
          title, 
          type, 
          file_type AS "fileType", 
          original_filename AS "originalFilename", 
          file_size AS "fileSize", 
          tags, 
          status, 
          ai_processed AS "aiProcessed", 
          created_at AS "createdAt", 
          updated_at AS "updatedAt"
      `;
      
      const id = uuidv4();
      const result = await db.query(query, [
        id,
        patientId,
        title,
        type,
        fileType,
        filePath,
        fileSize,
        originalFilename,
        uploadedBy,
        JSON.stringify(tags),
        status,
        false // ai_processed initially false
      ]);
      
      // Create initial version
      await this.createDocumentVersion({
        documentId: id,
        filePath,
        fileSize,
        originalFilename,
        uploadedBy,
        status
      });
      
      return result.rows[0];
    } catch (error) {
      console.error('Error in createDocument:', error);
      throw error;
    }
  }
  
  /**
   * Update a document
   * @param {string} id - Document ID
   * @param {Object} updates - Fields to update
   * @returns {Promise<Object>} - Updated document
   */
  async updateDocument(id, updates) {
    try {
      // Build update query dynamically based on provided fields
      const allowedFields = [
        'title', 'type', 'tags', 'status', 'ai_processed', 'ai_findings'
      ];
      
      const updateFields = [];
      const queryParams = [id];
      let paramIndex = 2;
      
      // Map JavaScript camelCase to database snake_case
      const fieldMapping = {
        title: 'title',
        type: 'type',
        tags: 'tags',
        status: 'status',
        aiProcessed: 'ai_processed',
        aiFindings: 'ai_findings'
      };
      
      for (const [key, value] of Object.entries(updates)) {
        const dbField = fieldMapping[key];
        
        if (dbField && allowedFields.includes(dbField)) {
          updateFields.push(`${dbField} = $${paramIndex}`);
          
          // Handle JSON fields
          if (dbField === 'tags' || dbField === 'ai_findings') {
            queryParams.push(JSON.stringify(value));
          } else {
            queryParams.push(value);
          }
          
          paramIndex++;
        }
      }
      
      // Add updated_at
      updateFields.push('updated_at = NOW()');
      
      if (updateFields.length === 0) {
        throw new Error('No valid fields to update');
      }
      
      const query = `
        UPDATE documents
        SET ${updateFields.join(', ')}
        WHERE id = $1 AND deleted = FALSE
        RETURNING 
          id, 
          patient_id AS "patientId", 
          title, 
          type, 
          file_type AS "fileType", 
          original_filename AS "originalFilename", 
          file_size AS "fileSize", 
          tags, 
          status, 
          ai_processed AS "aiProcessed", 
          ai_findings AS "aiFindings", 
          created_at AS "createdAt", 
          updated_at AS "updatedAt"
      `;
      
      const result = await db.query(query, queryParams);
      
      if (result.rows.length === 0) {
        throw new Error('Document not found or already deleted');
      }
      
      return result.rows[0];
    } catch (error) {
      console.error('Error in updateDocument:', error);
      throw error;
    }
  }
  
  /**
   * Soft delete a document
   * @param {string} id - Document ID
   * @param {string} userId - User performing the deletion
   * @returns {Promise<boolean>} - Success status
   */
  async softDeleteDocument(id, userId) {
    try {
      // Get document to check if it exists and to get file path
      const document = await this.getDocumentById(id);
      
      if (!document) {
        throw new Error('Document not found');
      }
      
      // Soft delete the document
      const query = `
        UPDATE documents
        SET 
          deleted = TRUE, 
          deleted_at = NOW(), 
          deleted_by = $2,
          updated_at = NOW()
        WHERE id = $1 AND deleted = FALSE
      `;
      
      await db.query(query, [id, userId]);
      
      // Also soft delete all versions
      const versionsQuery = `
        UPDATE document_versions
        SET 
          deleted = TRUE, 
          deleted_at = NOW(), 
          deleted_by = $2,
          updated_at = NOW()
        WHERE document_id = $1 AND deleted = FALSE
      `;
      
      await db.query(versionsQuery, [id, userId]);
      
      return true;
    } catch (error) {
      console.error('Error in softDeleteDocument:', error);
      throw error;
    }
  }
  
  /**
   * Hard delete a document and its files (for admin use only)
   * @param {string} id - Document ID
   * @returns {Promise<boolean>} - Success status
   */
  async hardDeleteDocument(id) {
    try {
      // Get document to check if it exists and to get file path
      const document = await this.getDocumentById(id);
      
      if (!document) {
        throw new Error('Document not found');
      }
      
      // Get all versions to delete their files
      const versionsQuery = `
        SELECT id, file_path
        FROM document_versions
        WHERE document_id = $1
      `;
      
      const versionsResult = await db.query(versionsQuery, [id]);
      
      // Delete version files
      for (const version of versionsResult.rows) {
        if (version.file_path && fs.existsSync(version.file_path)) {
          fs.unlinkSync(version.file_path);
        }
      }
      
      // Delete document file if different from version files
      if (document.filePath && fs.existsSync(document.filePath)) {
        // Check if this file is used by any version
        const isUsedByVersion = versionsResult.rows.some(v => v.file_path === document.filePath);
        
        if (!isUsedByVersion) {
          fs.unlinkSync(document.filePath);
        }
      }
      
      // Delete versions from database
      await db.query('DELETE FROM document_versions WHERE document_id = $1', [id]);
      
      // Delete document from database
      await db.query('DELETE FROM documents WHERE id = $1', [id]);
      
      return true;
    } catch (error) {
      console.error('Error in hardDeleteDocument:', error);
      throw error;
    }
  }
  
  /**
   * Get all versions of a document
   * @param {string} documentId - Document ID
   * @returns {Promise<Array>} - Array of document versions
   */
  async getDocumentVersions(documentId) {
    try {
      const query = `
        SELECT 
          v.id, 
          v.document_id AS "documentId", 
          v.version, 
          v.file_size AS "fileSize", 
          v.original_filename AS "originalFilename", 
          v.status, 
          v.ai_processed AS "aiProcessed", 
          v.ai_findings AS "aiFindings", 
          v.created_at AS "createdAt",
          u.full_name AS "uploadedBy"
        FROM document_versions v
        LEFT JOIN users u ON v.uploaded_by = u.id
        WHERE v.document_id = $1 AND v.deleted = FALSE
        ORDER BY v.version DESC
      `;
      
      const result = await db.query(query, [documentId]);
      
      return result.rows;
    } catch (error) {
      console.error('Error in getDocumentVersions:', error);
      throw error;
    }
  }
  
  /**
   * Get a specific document version
   * @param {string} versionId - Version ID
   * @returns {Promise<Object>} - Document version
   */
  async getDocumentVersionById(versionId) {
    try {
      const query = `
        SELECT 
          v.id, 
          v.document_id AS "documentId", 
          v.version, 
          v.file_path AS "filePath", 
          v.file_size AS "fileSize", 
          v.original_filename AS "originalFilename", 
          v.status, 
          v.ai_processed AS "aiProcessed", 
          v.ai_findings AS "aiFindings", 
          v.created_at AS "createdAt",
          u.full_name AS "uploadedBy"
        FROM document_versions v
        LEFT JOIN users u ON v.uploaded_by = u.id
        WHERE v.id = $1 AND v.deleted = FALSE
      `;
      
      const result = await db.query(query, [versionId]);
      
      if (result.rows.length === 0) {
        return null;
      }
      
      return result.rows[0];
    } catch (error) {
      console.error('Error in getDocumentVersionById:', error);
      throw error;
    }
  }
  
  /**
   * Create a new document version
   * @param {Object} versionData - Version data
   * @returns {Promise<Object>} - Created version
   */
  async createDocumentVersion(versionData) {
    try {
      const {
        documentId,
        filePath,
        fileSize,
        originalFilename,
        uploadedBy,
        status
      } = versionData;
      
      // Get the next version number
      const versionQuery = `
        SELECT COALESCE(MAX(version), 0) + 1 AS next_version
        FROM document_versions
        WHERE document_id = $1
      `;
      
      const versionResult = await db.query(versionQuery, [documentId]);
      const version = versionResult.rows[0].next_version;
      
      const query = `
        INSERT INTO document_versions (
          id,
          document_id,
          version,
          file_path,
          file_size,
          original_filename,
          uploaded_by,
          status,
          ai_processed,
          created_at,
          updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
        RETURNING 
          id, 
          document_id AS "documentId", 
          version, 
          file_size AS "fileSize", 
          original_filename AS "originalFilename", 
          status, 
          ai_processed AS "aiProcessed", 
          created_at AS "createdAt"
      `;
      
      const id = uuidv4();
      const result = await db.query(query, [
        id,
        documentId,
        version,
        filePath,
        fileSize,
        originalFilename,
        uploadedBy,
        status,
        false // ai_processed initially false
      ]);
      
      // Update the document to point to the latest version
      await db.query(`
        UPDATE documents
        SET 
          file_path = $1,
          file_size = $2,
          updated_at = NOW()
        WHERE id = $3
      `, [filePath, fileSize, documentId]);
      
      return result.rows[0];
    } catch (error) {
      console.error('Error in createDocumentVersion:', error);
      throw error;
    }
  }
  
  /**
   * Update a document version
   * @param {string} versionId - Version ID
   * @param {Object} updates - Fields to update
   * @returns {Promise<Object>} - Updated version
   */
  async updateDocumentVersion(versionId, updates) {
    try {
      // Build update query dynamically based on provided fields
      const allowedFields = ['status', 'ai_processed', 'ai_findings'];
      
      const updateFields = [];
      const queryParams = [versionId];
      let paramIndex = 2;
      
      // Map JavaScript camelCase to database snake_case
      const fieldMapping = {
        status: 'status',
        aiProcessed: 'ai_processed',
        aiFindings: 'ai_findings'
      };
      
      for (const [key, value] of Object.entries(updates)) {
        const dbField = fieldMapping[key];
        
        if (dbField && allowedFields.includes(dbField)) {
          updateFields.push(`${dbField} = $${paramIndex}`);
          
          // Handle JSON fields
          if (dbField === 'ai_findings') {
            queryParams.push(JSON.stringify(value));
          } else {
            queryParams.push(value);
          }
          
          paramIndex++;
        }
      }
      
      // Add updated_at
      updateFields.push('updated_at = NOW()');
      
      if (updateFields.length === 0) {
        throw new Error('No valid fields to update');
      }
      
      const query = `
        UPDATE document_versions
        SET ${updateFields.join(', ')}
        WHERE id = $1 AND deleted = FALSE
        RETURNING 
          id, 
          document_id AS "documentId", 
          version, 
          file_size AS "fileSize", 
          original_filename AS "originalFilename", 
          status, 
          ai_processed AS "aiProcessed", 
          ai_findings AS "aiFindings", 
          created_at AS "createdAt", 
          updated_at AS "updatedAt"
      `;
      
      const result = await db.query(query, queryParams);
      
      if (result.rows.length === 0) {
        throw new Error('Document version not found or already deleted');
      }
      
      // If this is the latest version, update the document status as well
      const version = result.rows[0];
      
      const latestVersionQuery = `
        SELECT version
        FROM document_versions
        WHERE document_id = $1
        ORDER BY version DESC
        LIMIT 1
      `;
      
      const latestVersionResult = await db.query(latestVersionQuery, [version.documentId]);
      
      if (latestVersionResult.rows.length > 0 && 
          latestVersionResult.rows[0].version === version.version) {
        // This is the latest version, update the document
        const documentUpdates = {};
        
        if (updates.status) {
          documentUpdates.status = updates.status;
        }
        
        if (updates.aiProcessed !== undefined) {
          documentUpdates.aiProcessed = updates.aiProcessed;
        }
        
        if (updates.aiFindings) {
          documentUpdates.aiFindings = updates.aiFindings;
        }
        
        if (Object.keys(documentUpdates).length > 0) {
          await this.updateDocument(version.documentId, documentUpdates);
        }
      }
      
      return version;
    } catch (error) {
      console.error('Error in updateDocumentVersion:', error);
      throw error;
    }
  }
  
  /**
   * Check if a user has access to a patient's documents
   * @param {string} userId - User ID
   * @param {string} patientId - Patient ID
   * @returns {Promise<boolean>} - Whether user has access
   */
  async checkPatientAccess(userId, patientId) {
    try {
      // Get user role
      const userQuery = `
        SELECT role
        FROM users
        WHERE id = $1
      `;
      
      const userResult = await db.query(userQuery, [userId]);
      
      if (userResult.rows.length === 0) {
        return false;
      }
      
      const userRole = userResult.rows[0].role;
      
      // Admins have access to all patients
      if (userRole === 'admin') {
        return true;
      }
      
      // Check if user is assigned to the patient or has consent
      const accessQuery = `
        SELECT 1
        FROM (
          -- Direct assignment (doctor, nurse)
          SELECT 1
          FROM patient_healthcare_providers
          WHERE patient_id = $1 AND provider_id = $2
          UNION
          -- Hospital staff access
          SELECT 1
          FROM users u
          JOIN patients p ON u.hospital_id = p.hospital_id
          WHERE p.id = $1 AND u.id = $2
          UNION
          -- Cross-hospital access via consent
          SELECT 1
          FROM access_tokens
          WHERE patient_id = $1 AND granted_to = $2 AND expires_at > NOW() AND revoked = FALSE
        ) AS access
      `;
      
      const accessResult = await db.query(accessQuery, [patientId, userId]);
      
      return accessResult.rows.length > 0;
    } catch (error) {
      console.error('Error in checkPatientAccess:', error);
      throw error;
    }
  }
}

module.exports = new DocumentService();