/**
 * Network Service
 * Manages secure network infrastructure between hospitals
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const https = require('https');
const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { v4: uuidv4 } = require('uuid');
const hospitalService = require('./HospitalService');
const auditService = require('./AuditService');

class NetworkService {
  constructor() {
    this.config = {
      vpnEnabled: process.env.VPN_ENABLED === 'true',
      mplsEnabled: process.env.MPLS_ENABLED === 'true',
      tlsVersion: 'TLSv1.3',
      cipherSuites: [
        'TLS_AES_256_GCM_SHA384',
        'TLS_CHACHA20_POLY1305_SHA256'
      ],
      certificatePath: process.env.TLS_CERT_PATH,
      privateKeyPath: process.env.TLS_KEY_PATH,
      caPath: process.env.TLS_CA_PATH,
      networkId: process.env.HOSPITAL_NETWORK_ID || 'default-network',
      heartbeatInterval: parseInt(process.env.NETWORK_HEARTBEAT_INTERVAL || '300000', 10), // 5 minutes
      connectionTimeout: parseInt(process.env.NETWORK_CONNECTION_TIMEOUT || '30000', 10), // 30 seconds
      maxRetries: parseInt(process.env.NETWORK_MAX_RETRIES || '3', 10)
    };

    this.connectedHospitals = new Map();
    this.networkStatus = {
      isOnline: false,
      lastChecked: null,
      connectedHospitalsCount: 0,
      networkLatency: {}
    };

    this.server = null;
    this.heartbeatInterval = null;
  }

  /**
   * Initialize the network service
   * @returns {Promise<void>}
   */
  async initialize() {
    try {
      console.log('Initializing Hospital Network Service...');

      // Validate configuration
      this.validateConfig();

      // Initialize secure server
      await this.initializeSecureServer();

      // Start network monitoring
      this.startNetworkMonitoring();

      // Connect to other hospitals in the network
      await this.connectToNetwork();

      console.log('Hospital Network Service initialized successfully');
      this.networkStatus.isOnline = true;
      this.networkStatus.lastChecked = new Date();
    } catch (error) {
      console.error('Failed to initialize Hospital Network Service:', error);
      this.networkStatus.isOnline = false;
      this.networkStatus.lastChecked = new Date();
      throw error;
    }
  }

  /**
   * Validate network configuration
   * @throws {Error} If configuration is invalid
   */
  validateConfig() {
    // Check if either VPN or MPLS is enabled
    if (!this.config.vpnEnabled && !this.config.mplsEnabled) {
      throw new Error('Either VPN or MPLS must be enabled for secure network');
    }

    // Check TLS certificate and key if we're initializing a server
    if (this.config.certificatePath && this.config.privateKeyPath) {
      if (!fs.existsSync(this.config.certificatePath)) {
        throw new Error(`TLS certificate not found at ${this.config.certificatePath}`);
      }

      if (!fs.existsSync(this.config.privateKeyPath)) {
        throw new Error(`TLS private key not found at ${this.config.privateKeyPath}`);
      }
    }

    // Check CA certificate if provided
    if (this.config.caPath && !fs.existsSync(this.config.caPath)) {
      throw new Error(`CA certificate not found at ${this.config.caPath}`);
    }
  }

  /**
   * Initialize secure HTTPS server for inter-hospital communication
   * @returns {Promise<void>}
   */
  async initializeSecureServer() {
    try {
      // Only initialize server if certificates are provided
      if (!this.config.certificatePath || !this.config.privateKeyPath) {
        console.log('TLS certificates not provided, skipping secure server initialization');
        return;
      }

      const app = express();

      // Apply security middleware
      app.use(helmet());
      app.use(express.json());

      // Apply rate limiting
      const apiLimiter = rateLimit({
        windowMs: 15 * 60 * 1000, // 15 minutes
        max: 100, // limit each IP to 100 requests per windowMs
        standardHeaders: true,
        legacyHeaders: false
      });
      app.use('/api/', apiLimiter);

      // Setup routes for inter-hospital communication
      this.setupNetworkRoutes(app);

      // Create HTTPS server
      const httpsOptions = {
        cert: fs.readFileSync(this.config.certificatePath),
        key: fs.readFileSync(this.config.privateKeyPath),
        minVersion: this.config.tlsVersion,
        ciphers: this.config.cipherSuites.join(':'),
        honorCipherOrder: true
      };

      // Add CA if provided
      if (this.config.caPath && fs.existsSync(this.config.caPath)) {
        httpsOptions.ca = fs.readFileSync(this.config.caPath);
        httpsOptions.requestCert = true;
        httpsOptions.rejectUnauthorized = true;
      }

      // Create and start the server
      this.server = https.createServer(httpsOptions, app);

      // Get port from environment or use default
      const port = process.env.NETWORK_PORT || 8443;

      return new Promise((resolve, reject) => {
        this.server.listen(port, () => {
          console.log(`Secure hospital network server listening on port ${port}`);
          resolve();
        });

        this.server.on('error', (error) => {
          console.error('Error starting secure server:', error);
          reject(error);
        });
      });
    } catch (error) {
      console.error('Failed to initialize secure server:', error);
      throw error;
    }
  }

  /**
   * Setup network API routes
   * @param {Object} app - Express application
   */
  setupNetworkRoutes(app) {
    // Middleware to verify hospital identity
    const verifyHospitalIdentity = async (req, res, next) => {
      try {
        // Get hospital ID and signature from headers
        const hospitalId = req.headers['x-hospital-id'];
        const signature = req.headers['x-hospital-signature'];
        const timestamp = req.headers['x-timestamp'];

        if (!hospitalId || !signature || !timestamp) {
          return res.status(401).json({ error: 'Missing authentication headers' });
        }

        // Check if timestamp is recent (within 5 minutes)
        const requestTime = new Date(timestamp);
        const now = new Date();
        const timeDiff = (now - requestTime) / 1000 / 60; // difference in minutes
        if (timeDiff > 5) {
          return res.status(401).json({ error: 'Request has expired' });
        }

        // Get hospital from database
        const hospital = await hospitalService.getHospitalById(hospitalId);
        if (!hospital) {
          return res.status(401).json({ error: 'Hospital not found' });
        }

        // Verify signature
        const payload = JSON.stringify({
          hospitalId,
          timestamp,
          path: req.path,
          method: req.method
        });

        const isValid = this.verifySignature(payload, signature, hospital.publicKey);
        if (!isValid) {
          return res.status(401).json({ error: 'Invalid signature' });
        }

        // Add hospital to request object
        req.hospital = hospital;
        next();
      } catch (error) {
        console.error('Error verifying hospital identity:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    };

    // Heartbeat endpoint to check if hospital is online
    app.get('/api/network/heartbeat', verifyHospitalIdentity, (req, res) => {
      const hospitalId = req.hospital.id;
      const timestamp = new Date().toISOString();

      // Update connected hospital status
      this.updateHospitalConnectionStatus(hospitalId, true, timestamp);

      res.json({
        status: 'online',
        timestamp,
        networkId: this.config.networkId,
        hospitalId: hospitalService.getLocalHospitalId()
      });
    });

    // Network status endpoint
    app.get('/api/network/status', verifyHospitalIdentity, (req, res) => {
      res.json({
        status: this.networkStatus.isOnline ? 'online' : 'offline',
        lastChecked: this.networkStatus.lastChecked,
        connectedHospitalsCount: this.networkStatus.connectedHospitalsCount,
        networkId: this.config.networkId
      });
    });

    // Hospital discovery endpoint
    app.get('/api/network/hospitals', verifyHospitalIdentity, async (req, res) => {
      try {
        // Get all hospitals in the network
        const hospitals = await hospitalService.getAllHospitals();

        // Filter out sensitive information
        const hospitalList = hospitals.map(hospital => ({
          id: hospital.id,
          name: hospital.name,
          apiEndpoint: hospital.apiEndpoint,
          isConnected: this.connectedHospitals.has(hospital.id),
          lastSeen: this.connectedHospitals.get(hospital.id)?.lastSeen || null
        }));

        res.json({
          hospitals: hospitalList,
          timestamp: new Date().toISOString(),
          networkId: this.config.networkId
        });
      } catch (error) {
        console.error('Error getting hospital list:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    // Register new hospital endpoint (admin only)
    app.post('/api/network/hospitals/register', async (req, res) => {
      try {
        // This would typically require admin authentication
        // For this example, we'll assume the request is already authenticated

        const { name, apiEndpoint, publicKey } = req.body;

        if (!name || !apiEndpoint || !publicKey) {
          return res.status(400).json({ error: 'Missing required fields' });
        }

        // Register new hospital
        const hospital = await hospitalService.registerHospital({
          name,
          apiEndpoint,
          publicKey,
          networkId: this.config.networkId
        });

        // Log the registration
        await auditService.logNetworkEvent({
          eventType: 'hospital_registered',
          hospitalId: hospital.id,
          details: {
            name: hospital.name,
            apiEndpoint: hospital.apiEndpoint,
            networkId: this.config.networkId
          },
          timestamp: new Date().toISOString()
        });

        res.status(201).json({
          id: hospital.id,
          name: hospital.name,
          apiEndpoint: hospital.apiEndpoint,
          networkId: this.config.networkId
        });
      } catch (error) {
        console.error('Error registering hospital:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    });
  }

  /**
   * Start network monitoring
   */
  startNetworkMonitoring() {
    // Clear any existing interval
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }

    // Start heartbeat interval
    this.heartbeatInterval = setInterval(
      () => this.sendHeartbeats(),
      this.config.heartbeatInterval
    );

    console.log(`Network monitoring started with ${this.config.heartbeatInterval}ms interval`);
  }

  /**
   * Connect to the hospital network
   * @returns {Promise<void>}
   */
  async connectToNetwork() {
    try {
      console.log('Connecting to hospital network...');

      // Get all hospitals in the network
      const hospitals = await hospitalService.getAllHospitals();
      const localHospitalId = await hospitalService.getLocalHospitalId();

      // Filter out local hospital
      const remoteHospitals = hospitals.filter(hospital => hospital.id !== localHospitalId);

      console.log(`Found ${remoteHospitals.length} remote hospitals in the network`);

      // Connect to each hospital
      const connectionPromises = remoteHospitals.map(hospital => 
        this.connectToHospital(hospital).catch(error => {
          console.error(`Failed to connect to hospital ${hospital.name} (${hospital.id}):`, error);
          return false; // Return false for failed connections
        })
      );

      // Wait for all connection attempts to complete
      const results = await Promise.all(connectionPromises);

      // Count successful connections
      const successfulConnections = results.filter(result => result === true).length;

      console.log(`Connected to ${successfulConnections} out of ${remoteHospitals.length} hospitals`);

      // Update network status
      this.networkStatus.connectedHospitalsCount = successfulConnections;
      this.networkStatus.isOnline = successfulConnections > 0;
      this.networkStatus.lastChecked = new Date();

      // Log network connection event
      await auditService.logNetworkEvent({
        eventType: 'network_connected',
        details: {
          connectedHospitals: successfulConnections,
          totalHospitals: remoteHospitals.length,
          networkId: this.config.networkId
        },
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Failed to connect to hospital network:', error);
      this.networkStatus.isOnline = false;
      this.networkStatus.lastChecked = new Date();

      // Log network connection failure
      await auditService.logNetworkEvent({
        eventType: 'network_connection_failed',
        details: {
          error: error.message,
          networkId: this.config.networkId
        },
        timestamp: new Date().toISOString()
      });

      throw error;
    }
  }

  /**
   * Connect to a specific hospital
   * @param {Object} hospital - Hospital to connect to
   * @returns {Promise<boolean>} - Whether connection was successful
   */
  async connectToHospital(hospital) {
    try {
      console.log(`Connecting to hospital ${hospital.name} (${hospital.id})...`);

      // Get local hospital ID
      const localHospitalId = await hospitalService.getLocalHospitalId();

      // Create connection timestamp
      const timestamp = new Date().toISOString();

      // Create payload for signature
      const payload = JSON.stringify({
        hospitalId: localHospitalId,
        timestamp,
        path: '/api/network/heartbeat',
        method: 'GET'
      });

      // Get local hospital private key for signing
      const privateKey = await hospitalService.getLocalHospitalPrivateKey();

      // Sign the payload
      const signature = this.createSignature(payload, privateKey);

      // Send heartbeat request to hospital
      const startTime = Date.now();

      // In a real implementation, this would make an HTTPS request to the hospital's API
      // For this example, we'll simulate a successful response with a random delay
      
      // Simulate network latency (10-200ms)
      const latency = Math.floor(Math.random() * 190) + 10;
      await new Promise(resolve => setTimeout(resolve, latency));
      
      // Simulate success with 90% probability
      const isSuccessful = Math.random() < 0.9;
      
      if (!isSuccessful) {
        throw new Error('Simulated connection failure');
      }
      
      const endTime = Date.now();
      const responseTime = endTime - startTime;

      // Update hospital connection status
      this.updateHospitalConnectionStatus(hospital.id, true, timestamp, responseTime);

      console.log(`Connected to hospital ${hospital.name} (${hospital.id}) with ${responseTime}ms latency`);

      return true;
    } catch (error) {
      console.error(`Failed to connect to hospital ${hospital.name} (${hospital.id}):`, error);

      // Update hospital connection status as offline
      this.updateHospitalConnectionStatus(hospital.id, false);

      return false;
    }
  }

  /**
   * Send heartbeats to all connected hospitals
   */
  async sendHeartbeats() {
    try {
      console.log('Sending heartbeats to connected hospitals...');

      // Get all hospitals in the network
      const hospitals = await hospitalService.getAllHospitals();
      const localHospitalId = await hospitalService.getLocalHospitalId();

      // Filter out local hospital and only include previously connected hospitals
      const connectedHospitals = hospitals.filter(hospital => 
        hospital.id !== localHospitalId && 
        this.connectedHospitals.has(hospital.id) && 
        this.connectedHospitals.get(hospital.id).isConnected
      );

      if (connectedHospitals.length === 0) {
        console.log('No connected hospitals to send heartbeats to');
        return;
      }

      console.log(`Sending heartbeats to ${connectedHospitals.length} hospitals`);

      // Send heartbeat to each hospital
      const heartbeatPromises = connectedHospitals.map(hospital => 
        this.sendHeartbeat(hospital).catch(error => {
          console.error(`Failed to send heartbeat to hospital ${hospital.name} (${hospital.id}):`, error);
          return false; // Return false for failed heartbeats
        })
      );

      // Wait for all heartbeat attempts to complete
      const results = await Promise.all(heartbeatPromises);

      // Count successful heartbeats
      const successfulHeartbeats = results.filter(result => result === true).length;

      console.log(`Sent heartbeats to ${successfulHeartbeats} out of ${connectedHospitals.length} hospitals`);

      // Update network status
      this.networkStatus.connectedHospitalsCount = successfulHeartbeats;
      this.networkStatus.isOnline = successfulHeartbeats > 0;
      this.networkStatus.lastChecked = new Date();

      // If no successful heartbeats, try to reconnect to the network
      if (successfulHeartbeats === 0 && connectedHospitals.length > 0) {
        console.log('No successful heartbeats, attempting to reconnect to network');
        await this.connectToNetwork();
      }
    } catch (error) {
      console.error('Failed to send heartbeats:', error);
    }
  }

  /**
   * Send heartbeat to a specific hospital
   * @param {Object} hospital - Hospital to send heartbeat to
   * @returns {Promise<boolean>} - Whether heartbeat was successful
   */
  async sendHeartbeat(hospital) {
    try {
      // Get local hospital ID
      const localHospitalId = await hospitalService.getLocalHospitalId();

      // Create heartbeat timestamp
      const timestamp = new Date().toISOString();

      // Create payload for signature
      const payload = JSON.stringify({
        hospitalId: localHospitalId,
        timestamp,
        path: '/api/network/heartbeat',
        method: 'GET'
      });

      // Get local hospital private key for signing
      const privateKey = await hospitalService.getLocalHospitalPrivateKey();

      // Sign the payload
      const signature = this.createSignature(payload, privateKey);

      // Send heartbeat request to hospital
      const startTime = Date.now();

      // In a real implementation, this would make an HTTPS request to the hospital's API
      // For this example, we'll simulate a successful response with a random delay
      
      // Simulate network latency (10-200ms)
      const latency = Math.floor(Math.random() * 190) + 10;
      await new Promise(resolve => setTimeout(resolve, latency));
      
      // Simulate success with 95% probability
      const isSuccessful = Math.random() < 0.95;
      
      if (!isSuccessful) {
        throw new Error('Simulated heartbeat failure');
      }
      
      const endTime = Date.now();
      const responseTime = endTime - startTime;

      // Update hospital connection status
      this.updateHospitalConnectionStatus(hospital.id, true, timestamp, responseTime);

      return true;
    } catch (error) {
      console.error(`Failed to send heartbeat to hospital ${hospital.name} (${hospital.id}):`, error);

      // Update hospital connection status as offline
      this.updateHospitalConnectionStatus(hospital.id, false);

      return false;
    }
  }

  /**
   * Update hospital connection status
   * @param {string} hospitalId - Hospital ID
   * @param {boolean} isConnected - Whether hospital is connected
   * @param {string} timestamp - Timestamp of connection update
   * @param {number} responseTime - Response time in milliseconds
   */
  updateHospitalConnectionStatus(hospitalId, isConnected, timestamp = null, responseTime = null) {
    const currentStatus = this.connectedHospitals.get(hospitalId) || {
      isConnected: false,
      lastSeen: null,
      responseTime: null,
      connectionHistory: []
    };

    // Update status
    const newStatus = {
      isConnected,
      lastSeen: isConnected ? (timestamp || new Date().toISOString()) : currentStatus.lastSeen,
      responseTime: isConnected ? (responseTime || currentStatus.responseTime) : null,
      connectionHistory: [...currentStatus.connectionHistory]
    };

    // Add to connection history if status changed
    if (isConnected !== currentStatus.isConnected) {
      newStatus.connectionHistory.push({
        status: isConnected ? 'connected' : 'disconnected',
        timestamp: timestamp || new Date().toISOString()
      });

      // Keep only the last 10 status changes
      if (newStatus.connectionHistory.length > 10) {
        newStatus.connectionHistory = newStatus.connectionHistory.slice(-10);
      }
    }

    // Update network latency tracking
    if (isConnected && responseTime) {
      this.networkStatus.networkLatency[hospitalId] = responseTime;
    }

    // Update connected hospitals map
    this.connectedHospitals.set(hospitalId, newStatus);

    // Update connected hospitals count
    this.networkStatus.connectedHospitalsCount = Array.from(this.connectedHospitals.values())
      .filter(status => status.isConnected)
      .length;
  }

  /**
   * Create digital signature for payload
   * @param {string} payload - Payload to sign
   * @param {string} privateKey - Private key for signing
   * @returns {string} - Base64 encoded signature
   */
  createSignature(payload, privateKey) {
    try {
      const sign = crypto.createSign('SHA256');
      sign.update(payload);
      sign.end();
      return sign.sign(privateKey, 'base64');
    } catch (error) {
      console.error('Error creating signature:', error);
      throw error;
    }
  }

  /**
   * Verify digital signature
   * @param {string} payload - Original payload
   * @param {string} signature - Base64 encoded signature
   * @param {string} publicKey - Public key for verification
   * @returns {boolean} - Whether signature is valid
   */
  verifySignature(payload, signature, publicKey) {
    try {
      const verify = crypto.createVerify('SHA256');
      verify.update(payload);
      verify.end();
      return verify.verify(publicKey, signature, 'base64');
    } catch (error) {
      console.error('Error verifying signature:', error);
      return false;
    }
  }

  /**
   * Get network status
   * @returns {Object} - Current network status
   */
  getNetworkStatus() {
    return {
      ...this.networkStatus,
      connectedHospitals: Array.from(this.connectedHospitals.entries()).map(([id, status]) => ({
        id,
        isConnected: status.isConnected,
        lastSeen: status.lastSeen,
        responseTime: status.responseTime
      }))
    };
  }

  /**
   * Check if a specific hospital is connected
   * @param {string} hospitalId - Hospital ID to check
   * @returns {boolean} - Whether hospital is connected
   */
  isHospitalConnected(hospitalId) {
    const status = this.connectedHospitals.get(hospitalId);
    return status ? status.isConnected : false;
  }

  /**
   * Get all connected hospitals
   * @returns {Array<Object>} - List of connected hospitals
   */
  async getConnectedHospitals() {
    try {
      // Get all hospitals
      const hospitals = await hospitalService.getAllHospitals();

      // Filter and map to include connection status
      return hospitals
        .filter(hospital => this.isHospitalConnected(hospital.id))
        .map(hospital => ({
          id: hospital.id,
          name: hospital.name,
          apiEndpoint: hospital.apiEndpoint,
          lastSeen: this.connectedHospitals.get(hospital.id)?.lastSeen || null,
          responseTime: this.connectedHospitals.get(hospital.id)?.responseTime || null
        }));
    } catch (error) {
      console.error('Error getting connected hospitals:', error);
      return [];
    }
  }

  /**
   * Shutdown network service
   * @returns {Promise<void>}
   */
  async shutdown() {
    try {
      console.log('Shutting down Hospital Network Service...');

      // Clear heartbeat interval
      if (this.heartbeatInterval) {
        clearInterval(this.heartbeatInterval);
        this.heartbeatInterval = null;
      }

      // Close server if it exists
      if (this.server) {
        await new Promise((resolve, reject) => {
          this.server.close(err => {
            if (err) {
              console.error('Error closing server:', err);
              reject(err);
            } else {
              resolve();
            }
          });
        });
        this.server = null;
      }

      // Update network status
      this.networkStatus.isOnline = false;
      this.networkStatus.lastChecked = new Date();
      this.networkStatus.connectedHospitalsCount = 0;

      // Clear connected hospitals
      this.connectedHospitals.clear();

      console.log('Hospital Network Service shut down successfully');
    } catch (error) {
      console.error('Error shutting down Hospital Network Service:', error);
      throw error;
    }
  }
}

module.exports = new NetworkService();