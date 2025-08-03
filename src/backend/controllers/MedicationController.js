const express = require('express');
const router = express.Router();
const { body, param, validationResult } = require('express-validator');
const { authenticateJWT, authorizeRole } = require('../middleware/auth');
const MedicationService = require('../services/MedicationService');
const AuditService = require('../services/AuditService');

/**
 * @swagger
 * tags:
 *   name: Medications
 *   description: Medication management endpoints
 */

/**
 * @swagger
 * /api/medications:
 *   get:
 *     summary: Get all medications
 *     tags: [Medications]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: active
 *         schema:
 *           type: boolean
 *         description: Filter by active status
 *       - in: query
 *         name: patientId
 *         schema:
 *           type: string
 *         description: Filter by patient ID
 *     responses:
 *       200:
 *         description: List of medications
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
router.get('/', authenticateJWT, async (req, res) => {
  try {
    const { active, patientId } = req.query;
    const filters = {};
    
    if (active !== undefined) {
      filters.active = active === 'true';
    }
    
    if (patientId) {
      filters.patientId = patientId;
      
      // Check if user has permission to access this patient's data
      const hasAccess = await MedicationService.checkPatientAccess(req.user.id, patientId);
      if (!hasAccess) {
        return res.status(403).json({ message: 'Access denied to this patient\'s records' });
      }
    }
    
    const medications = await MedicationService.getMedications(filters);
    
    // Log audit trail
    await AuditService.logAction({
      userId: req.user.id,
      action: 'READ',
      resource: 'medications',
      resourceId: patientId || 'all',
      details: `Retrieved medications with filters: ${JSON.stringify(filters)}`,
      ipAddress: req.ip
    });
    
    res.json(medications);
  } catch (error) {
    console.error('Error fetching medications:', error);
    res.status(500).json({ message: 'Failed to fetch medications', error: error.message });
  }
});

/**
 * @swagger
 * /api/medications/{id}:
 *   get:
 *     summary: Get medication by ID
 *     tags: [Medications]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Medication details
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Medication not found
 *       500:
 *         description: Server error
 */
router.get('/:id', 
  authenticateJWT,
  param('id').isString().trim(),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    
    try {
      const medication = await MedicationService.getMedicationById(req.params.id);
      
      if (!medication) {
        return res.status(404).json({ message: 'Medication not found' });
      }
      
      // Check if user has permission to access this patient's data
      const hasAccess = await MedicationService.checkPatientAccess(req.user.id, medication.patientId);
      if (!hasAccess) {
        return res.status(403).json({ message: 'Access denied to this medication record' });
      }
      
      // Log audit trail
      await AuditService.logAction({
        userId: req.user.id,
        action: 'READ',
        resource: 'medications',
        resourceId: req.params.id,
        details: `Retrieved medication details for ID: ${req.params.id}`,
        ipAddress: req.ip
      });
      
      res.json(medication);
    } catch (error) {
      console.error('Error fetching medication:', error);
      res.status(500).json({ message: 'Failed to fetch medication', error: error.message });
    }
  }
);

/**
 * @swagger
 * /api/medications:
 *   post:
 *     summary: Create a new medication record
 *     tags: [Medications]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - patientId
 *               - name
 *               - dosage
 *               - frequency
 *               - route
 *               - startDate
 *               - prescribedBy
 *             properties:
 *               patientId:
 *                 type: string
 *               name:
 *                 type: string
 *               rxnormCode:
 *                 type: string
 *               dosage:
 *                 type: string
 *               frequency:
 *                 type: string
 *               route:
 *                 type: string
 *               startDate:
 *                 type: string
 *                 format: date
 *               endDate:
 *                 type: string
 *                 format: date
 *               prescribedBy:
 *                 type: string
 *               active:
 *                 type: boolean
 *                 default: true
 *     responses:
 *       201:
 *         description: Medication created successfully
 *       400:
 *         description: Invalid input
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 *       500:
 *         description: Server error
 */
router.post('/',
  authenticateJWT,
  authorizeRole(['doctor', 'nurse', 'pharmacist']),
  [
    body('patientId').isString().trim().notEmpty(),
    body('name').isString().trim().notEmpty(),
    body('rxnormCode').optional().isString().trim(),
    body('dosage').isString().trim().notEmpty(),
    body('frequency').isString().trim().notEmpty(),
    body('route').isString().trim().notEmpty(),
    body('startDate').isISO8601(),
    body('endDate').optional({ nullable: true }).isISO8601(),
    body('prescribedBy').isString().trim().notEmpty(),
    body('active').optional().isBoolean()
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    
    try {
      // Check if user has permission to access this patient's data
      const hasAccess = await MedicationService.checkPatientAccess(req.user.id, req.body.patientId);
      if (!hasAccess) {
        return res.status(403).json({ message: 'Access denied to this patient\'s records' });
      }
      
      // Validate medication against drug database
      const isValidMedication = await MedicationService.validateMedication(req.body.name, req.body.rxnormCode);
      if (!isValidMedication) {
        return res.status(400).json({ message: 'Invalid medication. Please verify the medication name and RxNorm code.' });
      }
      
      // Create medication record
      const medication = await MedicationService.createMedication({
        ...req.body,
        createdBy: req.user.id,
        hospitalId: req.user.hospitalId
      });
      
      // Log audit trail
      await AuditService.logAction({
        userId: req.user.id,
        action: 'CREATE',
        resource: 'medications',
        resourceId: medication.id,
        details: `Created new medication record for patient: ${req.body.patientId}`,
        ipAddress: req.ip
      });
      
      res.status(201).json(medication);
    } catch (error) {
      console.error('Error creating medication:', error);
      res.status(500).json({ message: 'Failed to create medication', error: error.message });
    }
  }
);

/**
 * @swagger
 * /api/medications/{id}:
 *   put:
 *     summary: Update a medication record
 *     tags: [Medications]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               rxnormCode:
 *                 type: string
 *               dosage:
 *                 type: string
 *               frequency:
 *                 type: string
 *               route:
 *                 type: string
 *               startDate:
 *                 type: string
 *                 format: date
 *               endDate:
 *                 type: string
 *                 format: date
 *               prescribedBy:
 *                 type: string
 *               active:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Medication updated successfully
 *       400:
 *         description: Invalid input
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Medication not found
 *       500:
 *         description: Server error
 */
router.put('/:id',
  authenticateJWT,
  authorizeRole(['doctor', 'nurse', 'pharmacist']),
  [
    param('id').isString().trim(),
    body('name').optional().isString().trim().notEmpty(),
    body('rxnormCode').optional().isString().trim(),
    body('dosage').optional().isString().trim().notEmpty(),
    body('frequency').optional().isString().trim().notEmpty(),
    body('route').optional().isString().trim().notEmpty(),
    body('startDate').optional().isISO8601(),
    body('endDate').optional({ nullable: true }).isISO8601(),
    body('prescribedBy').optional().isString().trim().notEmpty(),
    body('active').optional().isBoolean()
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    
    try {
      // Check if medication exists
      const existingMedication = await MedicationService.getMedicationById(req.params.id);
      if (!existingMedication) {
        return res.status(404).json({ message: 'Medication not found' });
      }
      
      // Check if user has permission to access this patient's data
      const hasAccess = await MedicationService.checkPatientAccess(req.user.id, existingMedication.patientId);
      if (!hasAccess) {
        return res.status(403).json({ message: 'Access denied to this medication record' });
      }
      
      // If medication name or RxNorm code is being updated, validate against drug database
      if (req.body.name || req.body.rxnormCode) {
        const isValidMedication = await MedicationService.validateMedication(
          req.body.name || existingMedication.name,
          req.body.rxnormCode || existingMedication.rxnormCode
        );
        if (!isValidMedication) {
          return res.status(400).json({ message: 'Invalid medication. Please verify the medication name and RxNorm code.' });
        }
      }
      
      // Update medication record
      const updatedMedication = await MedicationService.updateMedication(req.params.id, {
        ...req.body,
        updatedBy: req.user.id
      });
      
      // Log audit trail
      await AuditService.logAction({
        userId: req.user.id,
        action: 'UPDATE',
        resource: 'medications',
        resourceId: req.params.id,
        details: `Updated medication record: ${JSON.stringify(req.body)}`,
        ipAddress: req.ip
      });
      
      res.json(updatedMedication);
    } catch (error) {
      console.error('Error updating medication:', error);
      res.status(500).json({ message: 'Failed to update medication', error: error.message });
    }
  }
);

/**
 * @swagger
 * /api/medications/{id}:
 *   delete:
 *     summary: Delete a medication record
 *     tags: [Medications]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Medication deleted successfully
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Medication not found
 *       500:
 *         description: Server error
 */
router.delete('/:id',
  authenticateJWT,
  authorizeRole(['doctor', 'pharmacist']),
  param('id').isString().trim(),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    
    try {
      // Check if medication exists
      const existingMedication = await MedicationService.getMedicationById(req.params.id);
      if (!existingMedication) {
        return res.status(404).json({ message: 'Medication not found' });
      }
      
      // Check if user has permission to access this patient's data
      const hasAccess = await MedicationService.checkPatientAccess(req.user.id, existingMedication.patientId);
      if (!hasAccess) {
        return res.status(403).json({ message: 'Access denied to this medication record' });
      }
      
      // Instead of hard delete, we'll soft delete by setting active to false
      const updatedMedication = await MedicationService.updateMedication(req.params.id, {
        active: false,
        updatedBy: req.user.id
      });
      
      // Log audit trail
      await AuditService.logAction({
        userId: req.user.id,
        action: 'DELETE',
        resource: 'medications',
        resourceId: req.params.id,
        details: `Soft-deleted medication record for patient: ${existingMedication.patientId}`,
        ipAddress: req.ip
      });
      
      res.json({ message: 'Medication record deactivated successfully' });
    } catch (error) {
      console.error('Error deleting medication:', error);
      res.status(500).json({ message: 'Failed to delete medication', error: error.message });
    }
  }
);

/**
 * @swagger
 * /api/medications/scan:
 *   post:
 *     summary: Scan medication barcode/QR code
 *     tags: [Medications]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - barcode
 *             properties:
 *               barcode:
 *                 type: string
 *     responses:
 *       200:
 *         description: Medication information retrieved
 *       400:
 *         description: Invalid input
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Medication not found
 *       500:
 *         description: Server error
 */
router.post('/scan',
  authenticateJWT,
  body('barcode').isString().trim().notEmpty(),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    
    try {
      const medicationInfo = await MedicationService.scanMedicationBarcode(req.body.barcode);
      
      if (!medicationInfo) {
        return res.status(404).json({ message: 'No medication found for this barcode' });
      }
      
      // Log audit trail
      await AuditService.logAction({
        userId: req.user.id,
        action: 'SCAN',
        resource: 'medications',
        resourceId: 'barcode',
        details: `Scanned medication barcode: ${req.body.barcode}`,
        ipAddress: req.ip
      });
      
      res.json(medicationInfo);
    } catch (error) {
      console.error('Error scanning medication barcode:', error);
      res.status(500).json({ message: 'Failed to scan medication barcode', error: error.message });
    }
  }
);

/**
 * @swagger
 * /api/medications/search:
 *   get:
 *     summary: Search medications in drug database
 *     tags: [Medications]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: query
 *         required: true
 *         schema:
 *           type: string
 *         description: Search query (medication name)
 *     responses:
 *       200:
 *         description: List of matching medications
 *       400:
 *         description: Invalid input
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
router.get('/search',
  authenticateJWT,
  async (req, res) => {
    const { query } = req.query;
    
    if (!query || query.trim() === '') {
      return res.status(400).json({ message: 'Search query is required' });
    }
    
    try {
      const results = await MedicationService.searchMedications(query);
      
      // Log audit trail
      await AuditService.logAction({
        userId: req.user.id,
        action: 'SEARCH',
        resource: 'medications',
        resourceId: 'drug-database',
        details: `Searched medications with query: ${query}`,
        ipAddress: req.ip
      });
      
      res.json(results);
    } catch (error) {
      console.error('Error searching medications:', error);
      res.status(500).json({ message: 'Failed to search medications', error: error.message });
    }
  }
);

module.exports = router;