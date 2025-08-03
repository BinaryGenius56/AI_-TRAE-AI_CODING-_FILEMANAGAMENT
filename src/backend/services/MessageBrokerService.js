/**
 * Message Broker Service
 * Implements event-driven architecture for real-time synchronization
 * using RabbitMQ or Apache Kafka
 */

const amqp = require('amqplib');
const { Kafka } = require('kafkajs');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');

const auditService = require('./AuditService');

class MessageBrokerService {
  constructor() {
    this.config = {
      // General configuration
      brokerType: process.env.MESSAGE_BROKER_TYPE || 'rabbitmq', // 'rabbitmq' or 'kafka'
      clientId: process.env.MESSAGE_BROKER_CLIENT_ID || `hospital-network-${uuidv4().substring(0, 8)}`,
      
      // RabbitMQ configuration
      rabbitmq: {
        url: process.env.RABBITMQ_URL || 'amqp://localhost:5672',
        exchangeName: process.env.RABBITMQ_EXCHANGE || 'hospital-network-exchange',
        exchangeType: process.env.RABBITMQ_EXCHANGE_TYPE || 'topic',
        queueName: process.env.RABBITMQ_QUEUE || 'hospital-network-queue',
        deadLetterExchange: process.env.RABBITMQ_DLX || 'hospital-network-dlx',
        prefetch: parseInt(process.env.RABBITMQ_PREFETCH || '10', 10)
      },
      
      // Kafka configuration
      kafka: {
        brokers: (process.env.KAFKA_BROKERS || 'localhost:9092').split(','),
        ssl: process.env.KAFKA_SSL === 'true' || false,
        sasl: process.env.KAFKA_SASL === 'true' || false,
        username: process.env.KAFKA_USERNAME,
        password: process.env.KAFKA_PASSWORD,
        mechanism: process.env.KAFKA_MECHANISM || 'plain'
      },
      
      // Message configuration
      messageEncryption: process.env.MESSAGE_ENCRYPTION === 'true' || false,
      encryptionKey: process.env.MESSAGE_ENCRYPTION_KEY || crypto.randomBytes(32).toString('hex'),
      messageCompression: process.env.MESSAGE_COMPRESSION === 'true' || false,
      
      // Retry configuration
      maxRetries: parseInt(process.env.MESSAGE_MAX_RETRIES || '3', 10),
      retryDelay: parseInt(process.env.MESSAGE_RETRY_DELAY || '1000', 10), // 1 second
      
      // Topic/channel configuration
      defaultTopicPrefix: process.env.TOPIC_PREFIX || 'hospital-network.'
    };

    // Connection objects
    this.connection = null;
    this.channel = null;
    this.kafka = null;
    this.producer = null;
    this.consumer = null;
    
    // Subscription handlers
    this.subscriptions = new Map();
    
    // Connection status
    this.isConnected = false;
    this.connectionPromise = null;
    
    // Hospital ID for message routing
    this.hospitalId = process.env.HOSPITAL_ID || 'unknown';
  }

  /**
   * Initialize the message broker connection
   * @returns {Promise<void>}
   */
  async initialize() {
    if (this.isConnected) {
      console.log('Message broker already connected');
      return;
    }

    if (this.connectionPromise) {
      return this.connectionPromise;
    }

    this.connectionPromise = this._connect();
    return this.connectionPromise;
  }

  /**
   * Connect to the message broker
   * @private
   * @returns {Promise<void>}
   */
  async _connect() {
    try {
      if (this.config.brokerType === 'rabbitmq') {
        await this._connectRabbitMQ();
      } else if (this.config.brokerType === 'kafka') {
        await this._connectKafka();
      } else {
        throw new Error(`Unsupported broker type: ${this.config.brokerType}`);
      }

      this.isConnected = true;
      console.log(`Connected to ${this.config.brokerType} message broker`);
      
      // Log connection to audit service
      await auditService.logSystemEvent({
        eventType: 'message_broker_connected',
        status: 'success',
        details: {
          brokerType: this.config.brokerType,
          clientId: this.config.clientId,
          hospitalId: this.hospitalId
        }
      });
    } catch (error) {
      console.error(`Failed to connect to ${this.config.brokerType} message broker:`, error);
      
      // Log connection failure to audit service
      await auditService.logSystemEvent({
        eventType: 'message_broker_connection_failed',
        status: 'error',
        details: {
          brokerType: this.config.brokerType,
          clientId: this.config.clientId,
          hospitalId: this.hospitalId,
          errorMessage: error.message
        }
      });
      
      this.connectionPromise = null;
      throw error;
    }
  }

  /**
   * Connect to RabbitMQ
   * @private
   * @returns {Promise<void>}
   */
  async _connectRabbitMQ() {
    // Connect to RabbitMQ server
    this.connection = await amqp.connect(this.config.rabbitmq.url);
    
    // Create a channel
    this.channel = await this.connection.createChannel();
    
    // Set prefetch count
    await this.channel.prefetch(this.config.rabbitmq.prefetch);
    
    // Create dead letter exchange
    await this.channel.assertExchange(
      this.config.rabbitmq.deadLetterExchange,
      'fanout',
      { durable: true }
    );
    
    // Create dead letter queue
    const dlqName = `${this.config.rabbitmq.queueName}.dlq`;
    await this.channel.assertQueue(dlqName, { durable: true });
    await this.channel.bindQueue(
      dlqName,
      this.config.rabbitmq.deadLetterExchange,
      ''
    );
    
    // Create main exchange
    await this.channel.assertExchange(
      this.config.rabbitmq.exchangeName,
      this.config.rabbitmq.exchangeType,
      { durable: true }
    );
    
    // Handle connection events
    this.connection.on('error', (err) => {
      console.error('RabbitMQ connection error:', err);
      this.isConnected = false;
      this.connectionPromise = null;
      this._reconnect();
    });
    
    this.connection.on('close', () => {
      console.log('RabbitMQ connection closed');
      this.isConnected = false;
      this.connectionPromise = null;
      this._reconnect();
    });
  }

  /**
   * Connect to Kafka
   * @private
   * @returns {Promise<void>}
   */
  async _connectKafka() {
    // Create Kafka client
    const kafkaConfig = {
      clientId: this.config.clientId,
      brokers: this.config.kafka.brokers
    };
    
    // Add SSL if configured
    if (this.config.kafka.ssl) {
      kafkaConfig.ssl = true;
    }
    
    // Add SASL if configured
    if (this.config.kafka.sasl) {
      kafkaConfig.sasl = {
        mechanism: this.config.kafka.mechanism,
        username: this.config.kafka.username,
        password: this.config.kafka.password
      };
    }
    
    this.kafka = new Kafka(kafkaConfig);
    
    // Create producer
    this.producer = this.kafka.producer();
    await this.producer.connect();
    
    // Create consumer
    this.consumer = this.kafka.consumer({
      groupId: `${this.config.clientId}-${this.hospitalId}`
    });
    await this.consumer.connect();
  }

  /**
   * Reconnect to the message broker after a connection failure
   * @private
   */
  async _reconnect() {
    if (this.connectionPromise) return;
    
    console.log('Attempting to reconnect to message broker...');
    
    // Wait before reconnecting
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // Try to reconnect
    this.connectionPromise = this._connect().catch(err => {
      console.error('Failed to reconnect to message broker:', err);
      this.connectionPromise = null;
      this._reconnect();
    });
  }

  /**
   * Publish a message to a topic
   * @param {string} topic - Topic to publish to
   * @param {Object} message - Message to publish
   * @param {Object} options - Publishing options
   * @returns {Promise<void>}
   */
  async publish(topic, message, options = {}) {
    await this.initialize();
    
    // Add metadata to message
    const enrichedMessage = {
      ...message,
      _metadata: {
        messageId: uuidv4(),
        timestamp: new Date().toISOString(),
        source: this.hospitalId,
        topic
      }
    };
    
    // Convert message to buffer
    let messageBuffer = Buffer.from(JSON.stringify(enrichedMessage));
    
    // Compress message if configured
    if (this.config.messageCompression) {
      messageBuffer = await this._compressMessage(messageBuffer);
    }
    
    // Encrypt message if configured
    if (this.config.messageEncryption) {
      messageBuffer = this._encryptMessage(messageBuffer);
    }
    
    try {
      if (this.config.brokerType === 'rabbitmq') {
        await this._publishToRabbitMQ(topic, messageBuffer, options);
      } else if (this.config.brokerType === 'kafka') {
        await this._publishToKafka(topic, messageBuffer, options);
      }
      
      // Log successful publish to audit service
      await auditService.logMessageEvent({
        eventType: 'message_published',
        status: 'success',
        topic,
        messageId: enrichedMessage._metadata.messageId,
        source: this.hospitalId,
        details: {
          messageSize: messageBuffer.length,
          encrypted: this.config.messageEncryption,
          compressed: this.config.messageCompression
        }
      });
    } catch (error) {
      console.error(`Failed to publish message to ${topic}:`, error);
      
      // Log publish failure to audit service
      await auditService.logMessageEvent({
        eventType: 'message_publish_failed',
        status: 'error',
        topic,
        messageId: enrichedMessage._metadata.messageId,
        source: this.hospitalId,
        details: {
          errorMessage: error.message
        }
      });
      
      throw error;
    }
  }

  /**
   * Publish a message to RabbitMQ
   * @private
   * @param {string} topic - Topic to publish to
   * @param {Buffer} messageBuffer - Message buffer
   * @param {Object} options - Publishing options
   * @returns {Promise<void>}
   */
  async _publishToRabbitMQ(topic, messageBuffer, options) {
    const routingKey = this._formatTopic(topic);
    const publishOptions = {
      persistent: true,
      ...options
    };
    
    await this.channel.publish(
      this.config.rabbitmq.exchangeName,
      routingKey,
      messageBuffer,
      publishOptions
    );
  }

  /**
   * Publish a message to Kafka
   * @private
   * @param {string} topic - Topic to publish to
   * @param {Buffer} messageBuffer - Message buffer
   * @param {Object} options - Publishing options
   * @returns {Promise<void>}
   */
  async _publishToKafka(topic, messageBuffer, options) {
    const kafkaTopic = this._formatTopic(topic);
    
    await this.producer.send({
      topic: kafkaTopic,
      messages: [
        {
          value: messageBuffer,
          headers: options.headers || {}
        }
      ]
    });
  }

  /**
   * Subscribe to a topic
   * @param {string} topic - Topic to subscribe to
   * @param {Function} handler - Message handler function
   * @param {Object} options - Subscription options
   * @returns {Promise<string>} - Subscription ID
   */
  async subscribe(topic, handler, options = {}) {
    await this.initialize();
    
    const subscriptionId = uuidv4();
    const formattedTopic = this._formatTopic(topic);
    
    try {
      if (this.config.brokerType === 'rabbitmq') {
        await this._subscribeToRabbitMQ(formattedTopic, subscriptionId, handler, options);
      } else if (this.config.brokerType === 'kafka') {
        await this._subscribeToKafka(formattedTopic, subscriptionId, handler, options);
      }
      
      // Store subscription handler
      this.subscriptions.set(subscriptionId, {
        topic: formattedTopic,
        handler,
        options
      });
      
      // Log subscription to audit service
      await auditService.logMessageEvent({
        eventType: 'message_subscription_created',
        status: 'success',
        topic: formattedTopic,
        subscriptionId,
        source: this.hospitalId,
        details: {
          brokerType: this.config.brokerType
        }
      });
      
      return subscriptionId;
    } catch (error) {
      console.error(`Failed to subscribe to ${formattedTopic}:`, error);
      
      // Log subscription failure to audit service
      await auditService.logMessageEvent({
        eventType: 'message_subscription_failed',
        status: 'error',
        topic: formattedTopic,
        subscriptionId,
        source: this.hospitalId,
        details: {
          errorMessage: error.message
        }
      });
      
      throw error;
    }
  }

  /**
   * Subscribe to a RabbitMQ topic
   * @private
   * @param {string} topic - Topic to subscribe to
   * @param {string} subscriptionId - Subscription ID
   * @param {Function} handler - Message handler function
   * @param {Object} options - Subscription options
   * @returns {Promise<void>}
   */
  async _subscribeToRabbitMQ(topic, subscriptionId, handler, options) {
    // Create a queue for this subscription
    const queueName = options.queueName || `${this.config.rabbitmq.queueName}.${subscriptionId}`;
    
    // Queue options
    const queueOptions = {
      durable: true,
      arguments: {
        'x-dead-letter-exchange': this.config.rabbitmq.deadLetterExchange
      }
    };
    
    // Assert queue
    await this.channel.assertQueue(queueName, queueOptions);
    
    // Bind queue to exchange with topic
    await this.channel.bindQueue(
      queueName,
      this.config.rabbitmq.exchangeName,
      topic
    );
    
    // Consume messages
    await this.channel.consume(queueName, async (msg) => {
      if (!msg) return;
      
      try {
        // Process the message
        const processedMessage = await this._processIncomingMessage(msg.content);
        
        // Call the handler
        await handler(processedMessage, {
          topic,
          subscriptionId,
          originalMessage: msg
        });
        
        // Acknowledge the message
        this.channel.ack(msg);
        
        // Log successful message processing
        await auditService.logMessageEvent({
          eventType: 'message_processed',
          status: 'success',
          topic,
          messageId: processedMessage._metadata?.messageId || 'unknown',
          source: processedMessage._metadata?.source || 'unknown',
          subscriptionId,
          details: {
            queueName
          }
        });
      } catch (error) {
        console.error(`Error processing message from ${topic}:`, error);
        
        // Check if we should retry
        const retryCount = parseInt(msg.properties.headers['x-retry-count'] || '0', 10);
        
        if (retryCount < this.config.maxRetries) {
          // Reject the message and requeue it
          this.channel.nack(msg, false, false);
          
          // Republish with retry count
          const headers = { ...msg.properties.headers, 'x-retry-count': retryCount + 1 };
          await this.channel.publish(
            this.config.rabbitmq.exchangeName,
            topic,
            msg.content,
            { headers }
          );
          
          // Log retry
          await auditService.logMessageEvent({
            eventType: 'message_processing_retry',
            status: 'warning',
            topic,
            subscriptionId,
            details: {
              retryCount: retryCount + 1,
              maxRetries: this.config.maxRetries,
              errorMessage: error.message
            }
          });
        } else {
          // Max retries reached, acknowledge the message
          this.channel.ack(msg);
          
          // Log failure
          await auditService.logMessageEvent({
            eventType: 'message_processing_failed',
            status: 'error',
            topic,
            subscriptionId,
            details: {
              retryCount,
              maxRetries: this.config.maxRetries,
              errorMessage: error.message
            }
          });
        }
      }
    });
  }

  /**
   * Subscribe to a Kafka topic
   * @private
   * @param {string} topic - Topic to subscribe to
   * @param {string} subscriptionId - Subscription ID
   * @param {Function} handler - Message handler function
   * @param {Object} options - Subscription options
   * @returns {Promise<void>}
   */
  async _subscribeToKafka(topic, subscriptionId, handler, options) {
    // Subscribe to topic
    await this.consumer.subscribe({
      topic,
      fromBeginning: options.fromBeginning || false
    });
    
    // Run consumer
    await this.consumer.run({
      eachMessage: async ({ topic: kafkaTopic, partition, message }) => {
        try {
          // Process the message
          const processedMessage = await this._processIncomingMessage(message.value);
          
          // Call the handler
          await handler(processedMessage, {
            topic: kafkaTopic,
            subscriptionId,
            partition,
            offset: message.offset,
            timestamp: message.timestamp,
            headers: message.headers
          });
          
          // Log successful message processing
          await auditService.logMessageEvent({
            eventType: 'message_processed',
            status: 'success',
            topic: kafkaTopic,
            messageId: processedMessage._metadata?.messageId || 'unknown',
            source: processedMessage._metadata?.source || 'unknown',
            subscriptionId,
            details: {
              partition,
              offset: message.offset
            }
          });
        } catch (error) {
          console.error(`Error processing message from ${kafkaTopic}:`, error);
          
          // Log failure
          await auditService.logMessageEvent({
            eventType: 'message_processing_failed',
            status: 'error',
            topic: kafkaTopic,
            subscriptionId,
            details: {
              partition,
              offset: message.offset,
              errorMessage: error.message
            }
          });
          
          // Note: Kafka doesn't have built-in retry like RabbitMQ
          // In a real implementation, we would need to handle retries manually
          // or use a Kafka Streams application for retry logic
        }
      }
    });
  }

  /**
   * Unsubscribe from a topic
   * @param {string} subscriptionId - Subscription ID
   * @returns {Promise<boolean>} - Whether unsubscription was successful
   */
  async unsubscribe(subscriptionId) {
    if (!this.subscriptions.has(subscriptionId)) {
      console.warn(`Subscription ${subscriptionId} not found`);
      return false;
    }
    
    const subscription = this.subscriptions.get(subscriptionId);
    
    try {
      if (this.config.brokerType === 'rabbitmq') {
        await this._unsubscribeFromRabbitMQ(subscriptionId, subscription);
      } else if (this.config.brokerType === 'kafka') {
        await this._unsubscribeFromKafka(subscriptionId, subscription);
      }
      
      // Remove subscription
      this.subscriptions.delete(subscriptionId);
      
      // Log unsubscription to audit service
      await auditService.logMessageEvent({
        eventType: 'message_unsubscribed',
        status: 'success',
        topic: subscription.topic,
        subscriptionId,
        source: this.hospitalId
      });
      
      return true;
    } catch (error) {
      console.error(`Failed to unsubscribe from ${subscription.topic}:`, error);
      
      // Log unsubscription failure to audit service
      await auditService.logMessageEvent({
        eventType: 'message_unsubscribe_failed',
        status: 'error',
        topic: subscription.topic,
        subscriptionId,
        source: this.hospitalId,
        details: {
          errorMessage: error.message
        }
      });
      
      return false;
    }
  }

  /**
   * Unsubscribe from a RabbitMQ topic
   * @private
   * @param {string} subscriptionId - Subscription ID
   * @param {Object} subscription - Subscription object
   * @returns {Promise<void>}
   */
  async _unsubscribeFromRabbitMQ(subscriptionId, subscription) {
    const queueName = subscription.options.queueName || `${this.config.rabbitmq.queueName}.${subscriptionId}`;
    
    // Cancel consumer
    await this.channel.cancel(subscriptionId);
    
    // Delete queue
    await this.channel.deleteQueue(queueName);
  }

  /**
   * Unsubscribe from a Kafka topic
   * @private
   * @param {string} subscriptionId - Subscription ID
   * @param {Object} subscription - Subscription object
   * @returns {Promise<void>}
   */
  async _unsubscribeFromKafka(subscriptionId, subscription) {
    // Stop consuming from topic
    await this.consumer.stop();
    
    // Unsubscribe from topic
    await this.consumer.disconnect();
    
    // Reconnect and subscribe to remaining topics
    await this.consumer.connect();
    
    // Resubscribe to all topics except the one being unsubscribed
    for (const [id, sub] of this.subscriptions.entries()) {
      if (id !== subscriptionId) {
        await this.consumer.subscribe({
          topic: sub.topic,
          fromBeginning: sub.options.fromBeginning || false
        });
      }
    }
    
    // Restart consumer if there are remaining subscriptions
    if (this.subscriptions.size > 1) {
      await this.consumer.run({
        eachMessage: async ({ topic, partition, message }) => {
          // Find the subscription for this topic
          let matchingSubscription = null;
          let matchingSubscriptionId = null;
          
          for (const [id, sub] of this.subscriptions.entries()) {
            if (sub.topic === topic) {
              matchingSubscription = sub;
              matchingSubscriptionId = id;
              break;
            }
          }
          
          if (matchingSubscription) {
            try {
              // Process the message
              const processedMessage = await this._processIncomingMessage(message.value);
              
              // Call the handler
              await matchingSubscription.handler(processedMessage, {
                topic,
                subscriptionId: matchingSubscriptionId,
                partition,
                offset: message.offset,
                timestamp: message.timestamp,
                headers: message.headers
              });
            } catch (error) {
              console.error(`Error processing message from ${topic}:`, error);
            }
          }
        }
      });
    }
  }

  /**
   * Process an incoming message
   * @private
   * @param {Buffer} messageBuffer - Message buffer
   * @returns {Promise<Object>} - Processed message
   */
  async _processIncomingMessage(messageBuffer) {
    let processedBuffer = messageBuffer;
    
    // Decrypt message if encrypted
    if (this.config.messageEncryption && this._isEncrypted(processedBuffer)) {
      processedBuffer = this._decryptMessage(processedBuffer);
    }
    
    // Decompress message if compressed
    if (this.config.messageCompression && this._isCompressed(processedBuffer)) {
      processedBuffer = await this._decompressMessage(processedBuffer);
    }
    
    // Parse JSON message
    return JSON.parse(processedBuffer.toString());
  }

  /**
   * Encrypt a message
   * @private
   * @param {Buffer} messageBuffer - Message buffer
   * @returns {Buffer} - Encrypted message buffer
   */
  _encryptMessage(messageBuffer) {
    try {
      const iv = crypto.randomBytes(16);
      const key = Buffer.from(this.config.encryptionKey, 'hex');
      const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
      
      // Add a marker to indicate encryption
      const marker = Buffer.from('ENCRYPTED:');
      
      const encrypted = Buffer.concat([
        marker,
        iv,
        cipher.update(messageBuffer),
        cipher.final()
      ]);
      
      return encrypted;
    } catch (error) {
      console.error('Failed to encrypt message:', error);
      return messageBuffer;
    }
  }

  /**
   * Decrypt a message
   * @private
   * @param {Buffer} encryptedBuffer - Encrypted message buffer
   * @returns {Buffer} - Decrypted message buffer
   */
  _decryptMessage(encryptedBuffer) {
    try {
      // Check for encryption marker
      const marker = 'ENCRYPTED:';
      const markerBuffer = Buffer.from(marker);
      
      if (encryptedBuffer.slice(0, markerBuffer.length).toString() !== marker) {
        return encryptedBuffer;
      }
      
      // Extract IV and encrypted data
      const iv = encryptedBuffer.slice(markerBuffer.length, markerBuffer.length + 16);
      const encryptedData = encryptedBuffer.slice(markerBuffer.length + 16);
      
      // Decrypt
      const key = Buffer.from(this.config.encryptionKey, 'hex');
      const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
      
      const decrypted = Buffer.concat([
        decipher.update(encryptedData),
        decipher.final()
      ]);
      
      return decrypted;
    } catch (error) {
      console.error('Failed to decrypt message:', error);
      return encryptedBuffer;
    }
  }

  /**
   * Check if a message is encrypted
   * @private
   * @param {Buffer} messageBuffer - Message buffer
   * @returns {boolean} - Whether the message is encrypted
   */
  _isEncrypted(messageBuffer) {
    const marker = 'ENCRYPTED:';
    return messageBuffer.slice(0, marker.length).toString() === marker;
  }

  /**
   * Compress a message
   * @private
   * @param {Buffer} messageBuffer - Message buffer
   * @returns {Promise<Buffer>} - Compressed message buffer
   */
  async _compressMessage(messageBuffer) {
    try {
      // In a real implementation, this would use a compression library
      // such as zlib, snappy, or lz4
      console.log('Message compression would be performed here in a real implementation');
      
      // For this example, we'll just add a marker
      const marker = Buffer.from('COMPRESSED:');
      return Buffer.concat([marker, messageBuffer]);
    } catch (error) {
      console.error('Failed to compress message:', error);
      return messageBuffer;
    }
  }

  /**
   * Decompress a message
   * @private
   * @param {Buffer} compressedBuffer - Compressed message buffer
   * @returns {Promise<Buffer>} - Decompressed message buffer
   */
  async _decompressMessage(compressedBuffer) {
    try {
      // Check for compression marker
      const marker = 'COMPRESSED:';
      const markerBuffer = Buffer.from(marker);
      
      if (compressedBuffer.slice(0, markerBuffer.length).toString() !== marker) {
        return compressedBuffer;
      }
      
      // In a real implementation, this would use a compression library
      // For this example, we'll just remove the marker
      return compressedBuffer.slice(markerBuffer.length);
    } catch (error) {
      console.error('Failed to decompress message:', error);
      return compressedBuffer;
    }
  }

  /**
   * Check if a message is compressed
   * @private
   * @param {Buffer} messageBuffer - Message buffer
   * @returns {boolean} - Whether the message is compressed
   */
  _isCompressed(messageBuffer) {
    const marker = 'COMPRESSED:';
    return messageBuffer.slice(0, marker.length).toString() === marker;
  }

  /**
   * Format a topic name
   * @private
   * @param {string} topic - Topic name
   * @returns {string} - Formatted topic name
   */
  _formatTopic(topic) {
    // Add prefix if not already present
    if (!topic.startsWith(this.config.defaultTopicPrefix)) {
      return `${this.config.defaultTopicPrefix}${topic}`;
    }
    return topic;
  }

  /**
   * Create a topic for a specific event type
   * @param {string} eventType - Event type
   * @param {string} entity - Entity type
   * @param {string} action - Action type
   * @returns {string} - Topic name
   */
  createTopic(eventType, entity, action) {
    return `${eventType}.${entity}.${action}`;
  }

  /**
   * Get health status of the message broker
   * @returns {Promise<Object>} - Health status
   */
  async getHealth() {
    try {
      if (!this.isConnected) {
        return {
          status: 'disconnected',
          brokerType: this.config.brokerType,
          timestamp: new Date().toISOString()
        };
      }
      
      // Check connection
      if (this.config.brokerType === 'rabbitmq') {
        // For RabbitMQ, check if channel is open
        if (!this.channel || !this.channel.connection) {
          throw new Error('RabbitMQ channel not connected');
        }
      } else if (this.config.brokerType === 'kafka') {
        // For Kafka, check if producer is connected
        if (!this.producer || !this.consumer) {
          throw new Error('Kafka producer or consumer not connected');
        }
      }
      
      return {
        status: 'connected',
        brokerType: this.config.brokerType,
        subscriptions: this.subscriptions.size,
        clientId: this.config.clientId,
        hospitalId: this.hospitalId,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('Health check failed:', error);
      return {
        status: 'error',
        brokerType: this.config.brokerType,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Close the message broker connection
   * @returns {Promise<void>}
   */
  async close() {
    try {
      if (!this.isConnected) {
        console.log('Message broker already disconnected');
        return;
      }
      
      if (this.config.brokerType === 'rabbitmq') {
        // Close RabbitMQ connection
        if (this.channel) {
          await this.channel.close();
        }
        if (this.connection) {
          await this.connection.close();
        }
      } else if (this.config.brokerType === 'kafka') {
        // Close Kafka connections
        if (this.consumer) {
          await this.consumer.disconnect();
        }
        if (this.producer) {
          await this.producer.disconnect();
        }
      }
      
      this.isConnected = false;
      this.connectionPromise = null;
      
      console.log(`Disconnected from ${this.config.brokerType} message broker`);
      
      // Log disconnection to audit service
      await auditService.logSystemEvent({
        eventType: 'message_broker_disconnected',
        status: 'success',
        details: {
          brokerType: this.config.brokerType,
          clientId: this.config.clientId,
          hospitalId: this.hospitalId
        }
      });
    } catch (error) {
      console.error(`Failed to close ${this.config.brokerType} connection:`, error);
      
      // Log disconnection failure to audit service
      await auditService.logSystemEvent({
        eventType: 'message_broker_disconnection_failed',
        status: 'error',
        details: {
          brokerType: this.config.brokerType,
          clientId: this.config.clientId,
          hospitalId: this.hospitalId,
          errorMessage: error.message
        }
      });
      
      throw error;
    }
  }
}

module.exports = new MessageBrokerService();