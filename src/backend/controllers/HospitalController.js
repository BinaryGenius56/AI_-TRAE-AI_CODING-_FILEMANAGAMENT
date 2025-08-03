/**
 * Hospital Controller
 * Handles API endpoints for hospital network management
 */

const express = require('express');
const router = express.Router();
const Joi = require('joi');

// Import services
const HospitalService = require('../services/HospitalService');
const NetworkService = require('../services/NetworkService');
const AuditService = require('../services/AuditService');

// Import middleware
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');

/**
 * @route GET /api/hospitals
 * @desc Get all connected hospitals
 * @access Private (Admins only)
 */
router.get('/', authenticate, authorize(['admin']), async (req, res) => {
  try {
    const hospitals = await HospitalService.getHospitals();
    
    // Log audit event
    await AuditService.logSystemEvent({
      userId: req.user.id,
      action: 'LIST',
      resourceType: 'hospital',
      description: 'Retrieved hospital list'
    });
    
    return res.json(hospitals);
  } catch (error) {
    console.error('Error fetching hospitals:', error);
    return res.status(500).json({ error: 'Failed to fetch hospitals' });
  }
});

/**
 * @route GET /api/hospitals/:id
 * @desc Get a hospital by ID
 * @access Private (Admins only)
 */
router.get('/:id', authenticate, authorize(['admin']), async (req, res) => {
  try {
    const { id } = req.params;
    const hospital = await HospitalService.getHospitalById(id);
    
    if (!hospital) {
      return res.status(404).json({ error: 'Hospital not found' });
    }
    
    // Log audit event
    await AuditService.logSystemEvent({
      userId: req.user.id,
      action: 'READ',
      resourceType: 'hospital',
      resourceId: id,
      description: 'Retrieved hospital details'
    });
    
    return res.json(hospital);
  } catch (error) {
    console.error('Error fetching hospital:', error);
    return res.status(500).json({ error: 'Failed to fetch hospital' });
  }
});

/**
 * @route POST /api/hospitals
 * @desc Register a new hospital in the network
 * @access Private (Admins only)
 */
router.post('/', authenticate, authorize(['admin']), async (req, res) => {
  try {
    // Validate request body
    const schema = Joi.object({
      name: Joi.string().required(),
      url: Joi.string().uri().required(),
      api_key: Joi.string(),
      public_key: Joi.string(),
      ip_address: Joi.string().ip(),
      port: Joi.number().integer().min(1).max(65535)
    });
    
    const { error, value } = schema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }
    
    // Generate API key and secret if not provided
    let apiKey = value.api_key;
    let apiSecret = null;
    
    if (!apiKey) {
      const credentials = await HospitalService.generateApiCredentials();
      apiKey = credentials.apiKey;
      apiSecret = credentials.apiSecret;
    }
    
    // Register hospital
    const hospital = await HospitalService.registerHospital({
      ...value,
      api_key: apiKey,
      status: 'pending'
    });
    
    // Attempt to connect to the hospital
    try {
      await NetworkService.connectToHospital(hospital);
      
      // Update hospital status to active if connection successful
      await HospitalService.updateHospitalStatus(hospital.id, 'active');
      hospital.status = 'active';
    } catch (connectionError) {
      console.error('Error connecting to hospital:', connectionError);
      // Hospital is registered but connection failed
    }
    
    // Log audit event
    await AuditService.logSystemEvent({
      userId: req.user.id,
      action: 'CREATE',
      resourceType: 'hospital',
      resourceId: hospital.id,
      description: 'Registered new hospital',
      metadata: { hospitalId: hospital.id, hospitalName: hospital.name }
    });
    
    // Return hospital data with API secret if generated
    const response = { ...hospital };
    if (apiSecret) {
      response.api_secret = apiSecret;
    }
    
    return res.status(201).json(response);
  } catch (error) {
    console.error('Error registering hospital:', error);
    return res.status(500).json({ error: 'Failed to register hospital' });
  }
});

/**
 * @route PUT /api/hospitals/:id
 * @desc Update a hospital
 * @access Private (Admins only)
 */
router.put('/:id', authenticate, authorize(['admin']), async (req, res) => {
  try {
    const { id } = req.params;
    
    // Validate request body
    const schema = Joi.object({
      name: Joi.string(),
      url: Joi.string().uri(),
      public_key: Joi.string(),
      ip_address: Joi.string().ip(),
      port: Joi.number().integer().min(1).max(65535),
      status: Joi.string().valid('active', 'inactive', 'pending')
    });
    
    const { error, value } = schema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }
    
    // Check if hospital exists
    const existingHospital = await HospitalService.getHospitalById(id);
    if (!existingHospital) {
      return res.status(404).json({ error: 'Hospital not found' });
    }
    
    // Update hospital
    const updatedHospital = await HospitalService.updateHospital(id, value);
    
    // If status changed to active, try to connect
    if (value.status === 'active' && existingHospital.status !== 'active') {
      try {
        await NetworkService.connectToHospital(updatedHospital);
      } catch (connectionError) {
        console.error('Error connecting to hospital:', connectionError);
        // Continue despite connection error
      }
    }
    
    // If status changed to inactive, disconnect
    if (value.status === 'inactive' && existingHospital.status === 'active') {
      try {
        await NetworkService.disconnectFromHospital(id);
      } catch (disconnectionError) {
        console.error('Error disconnecting from hospital:', disconnectionError);
        // Continue despite disconnection error
      }
    }
    
    // Log audit event
    await AuditService.logSystemEvent({
      userId: req.user.id,
      action: 'UPDATE',
      resourceType: 'hospital',
      resourceId: id,
      description: 'Updated hospital',
      metadata: { hospitalId: id, updatedFields: Object.keys(value) }
    });
    
    return res.json(updatedHospital);
  } catch (error) {
    console.error('Error updating hospital:', error);
    return res.status(500).json({ error: 'Failed to update hospital' });
  }
});

/**
 * @route DELETE /api/hospitals/:id
 * @desc Remove a hospital from the network
 * @access Private (Admins only)
 */
router.delete('/:id', authenticate, authorize(['admin']), async (req, res) => {
  try {
    const { id } = req.params;
    
    // Check if hospital exists
    const existingHospital = await HospitalService.getHospitalById(id);
    if (!existingHospital) {
      return res.status(404).json({ error: 'Hospital not found' });
    }
    
    // Disconnect from hospital
    if (existingHospital.status === 'active') {
      try {
        await NetworkService.disconnectFromHospital(id);
      } catch (disconnectionError) {
        console.error('Error disconnecting from hospital:', disconnectionError);
        // Continue despite disconnection error
      }
    }
    
    // Remove hospital
    await HospitalService.removeHospital(id);
    
    // Log audit event
    await AuditService.logSystemEvent({
      userId: req.user.id,
      action: 'DELETE',
      resourceType: 'hospital',
      resourceId: id,
      description: 'Removed hospital from network',
      metadata: { hospitalId: id, hospitalName: existingHospital.name }
    });
    
    return res.json({ message: 'Hospital removed successfully' });
  } catch (error) {
    console.error('Error removing hospital:', error);
    return res.status(500).json({ error: 'Failed to remove hospital' });
  }
});

/**
 * @route POST /api/hospitals/:id/regenerate-key
 * @desc Regenerate API key for a hospital
 * @access Private (Admins only)
 */
router.post('/:id/regenerate-key', authenticate, authorize(['admin']), async (req, res) => {
  try {
    const { id } = req.params;
    
    // Check if hospital exists
    const existingHospital = await HospitalService.getHospitalById(id);
    if (!existingHospital) {
      return res.status(404).json({ error: 'Hospital not found' });
    }
    
    // Regenerate API credentials
    const credentials = await HospitalService.generateApiCredentials();
    
    // Update hospital with new API key
    await HospitalService.updateHospital(id, {
      api_key: credentials.apiKey
    });
    
    // Log audit event
    await AuditService.logSecurityEvent({
      userId: req.user.id,
      action: 'UPDATE',
      resourceType: 'hospital_credentials',
      resourceId: id,
      description: 'Regenerated hospital API key',
      metadata: { hospitalId: id }
    });
    
    return res.json({
      message: 'API key regenerated successfully',
      api_key: credentials.apiKey,
      api_secret: credentials.apiSecret
    });
  } catch (error) {
    console.error('Error regenerating API key:', error);
    return res.status(500).json({ error: 'Failed to regenerate API key' });
  }
});

/**
 * @route GET /api/hospitals/status
 * @desc Get status of all hospitals in the network
 * @access Private (Admins only)
 */
router.get('/status/all', authenticate, authorize(['admin']), async (req, res) => {
  try {
    const statuses = await NetworkService.getNetworkStatus();
    
    // Log audit event
    await AuditService.logSystemEvent({
      userId: req.user.id,
      action: 'READ',
      resourceType: 'network_status',
      description: 'Retrieved network status'
    });
    
    return res.json(statuses);
  } catch (error) {
    console.error('Error fetching network status:', error);
    return res.status(500).json({ error: 'Failed to fetch network status' });
  }
});

/**
 * @route POST /api/hospitals/:id/test-connection
 * @desc Test connection to a hospital
 * @access Private (Admins only)
 */
router.post('/:id/test-connection', authenticate, authorize(['admin']), async (req, res) => {
  try {
    const { id } = req.params;
    
    // Check if hospital exists
    const existingHospital = await HospitalService.getHospitalById(id);
    if (!existingHospital) {
      return res.status(404).json({ error: 'Hospital not found' });
    }
    
    // Test connection
    const connectionResult = await NetworkService.testHospitalConnection(id);
    
    // Log audit event
    await AuditService.logSystemEvent({
      userId: req.user.id,
      action: 'TEST',
      resourceType: 'hospital_connection',
      resourceId: id,
      description: 'Tested hospital connection',
      metadata: { hospitalId: id, connectionResult }
    });
    
    return res.json(connectionResult);
  } catch (error) {
    console.error('Error testing hospital connection:', error);
    return res.status(500).json({ error: 'Failed to test hospital connection' });
  }
});

module.exports = router;