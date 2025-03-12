const eventTemplates = require('../templates/templateConfig');
const watiService = require('./watiService');
const DataStorageService = require('./dataStorageService');
const { config } = require('../config');

// Initialize the data storage service
const dataStorage = new DataStorageService(config.googleSheets);

/**
 * Process webhook event and send WhatsApp notification
 * @param {object} webhookData - Webhook payload
 * @returns {Promise} Processing result
 */
const processWebhook = async (webhookData) => {
  console.log("📥 Received webhook payload:", JSON.stringify(webhookData, null, 2));
  
  const { event, data } = webhookData;
  
  if (!event || !data) {
    console.error("❌ Missing required fields in webhook payload");
    throw new Error("Missing required fields: event and data are required");
  }
  
  if (!eventTemplates[event]) {
    console.warn("⚠️ Unhandled event type received:", event);
    throw new Error(`Unhandled event type: ${event}`);
  }
  
  // Extract mobile number based on event type
  let mobileNumber = "";
  
  if (event.startsWith("user.")) {
    mobileNumber = data.user?.mobile;
    if (!mobileNumber) {
      console.error("❌ Missing mobile number in user data");
      throw new Error("Missing mobile number in user data");
    }
    
    // Store user data for ML analysis
    try {
      await dataStorage.storeUserData(webhookData);
      console.log(`📊 Stored user data for ML analysis: ${data.user?.name}`);
    } catch (error) {
      console.error("⚠️ Failed to store user data for ML:", error.message);
      // Continue with WhatsApp notification even if storage fails
    }
  } else if (event.startsWith("order.")) {
    mobileNumber = data.order?.user?.mobile;
    if (!mobileNumber) {
      console.error("❌ Missing mobile number in order data");
      throw new Error("Missing mobile number for order notifications");
    }
    
    // Store order data for ML analysis
    try {
      await dataStorage.storeOrderData(webhookData);
      console.log(`📊 Stored order data for ML analysis: Order #${data.order?.oid}`);
    } catch (error) {
      console.error("⚠️ Failed to store order data for ML:", error.message);
      // Continue with WhatsApp notification even if storage fails
    }
  }
  
  console.log(`👤 Processing ${event} event`);
  
  // Get the template configuration for this event
  const templateConfig = eventTemplates[event];
  
  // Generate parameters for this event
  const parameters = templateConfig.parameters(data);
  
  // Send the message via WATI API
  const response = await watiService.sendTemplateMessage(
    mobileNumber,
    templateConfig.templateName,
    parameters
  );
  
  return {
    success: true,
    message: "WhatsApp message sent successfully!",
    event: event,
    response: response,
  };
};

/**
 * Generate sample payload for testing
 * @param {string} event - Event type
 * @returns {object} Sample payload
 */
const generateSamplePayload = (event) => {
  if (event.startsWith("user")) {
    return { 
      event, 
      data: { 
        user: { 
          name: "Test User", 
          mobile: "9876543210" 
        } 
      } 
    };
  } else {
    return {
      event,
      data: {
        order: {
          oid: "123456",
          user: { 
            name: "Test User", 
            mobile: "9876543210" 
          },
        },
      },
    };
  }
};

/**
 * Generate ML insights based on stored data
 * @param {Object} options - Analysis options
 * @returns {Promise<Object>} ML insights
 */
const generateMLInsights = async (options = {}) => {
  try {
    // Check if ML modules are available
    try {
      const DataPreprocessor = require('../ml/dataPreprocessor');
      const TrendAnalyzer = require('../ml/trendAnalyzer');
      
      // Specify date range if needed
      const dateRange = options.dateRange || {
        start: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString(), // Last 90 days
        end: new Date().toISOString()
      };
      
      // Export data from storage
      const ordersData = await dataStorage.exportDataForML('orders', dateRange);
      const itemsData = await dataStorage.exportDataForML('items', dateRange);
      const usersData = await dataStorage.exportDataForML('users', dateRange);
      
      // Generate product insights
      const productTrends = TrendAnalyzer.analyzeProductTrends(itemsData, ordersData);
      
      // Generate customer insights
      const customerPatterns = TrendAnalyzer.analyzeCustomerPatterns(ordersData, usersData);
      
      // Create product feature vectors for recommendations
      const productFeatures = DataPreprocessor.createProductFeatures(itemsData, ordersData);
      
      // Generate general recommendations
      const popularRecommendations = TrendAnalyzer.generateRecommendations(productFeatures);
      
      return {
        timestamp: new Date().toISOString(),
        dateRange,
        productTrends,
        customerPatterns,
        topRecommendations: popularRecommendations,
        dataPoints: {
          orders: ordersData.length,
          items: itemsData.length,
          users: usersData.length
        }
      };
    } catch (moduleError) {
      console.warn("⚠️ ML modules not available, returning mock data:", moduleError.message);
      
      // Fall back to mock data if ML modules are not available
      return {
        timestamp: new Date().toISOString(),
        dateRange: options.dateRange || {
          start: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString(),
          end: new Date().toISOString()
        },
        productTrends: {
          fastestGrowing: [
            { name: "Organic Fertilizer", growth: "43%", category: "Soil & Nutrients" },
            { name: "Indoor Plant Kit", growth: "37%", category: "Indoor Gardening" },
            { name: "Herb Garden Starter", growth: "29%", category: "Seeds & Plants" }
          ],
          seasonalTrends: [
            { season: "Current", topCategory: "Summer Plants", growth: "22%" },
            { season: "Upcoming", topCategory: "Fall Vegetables", projected: "18%" }
          ]
        },
        customerPatterns: {
          retention: "72%",
          averageOrderFrequency: "36 days",
          topUserSegments: [
            { name: "Urban Gardeners", percentage: "42%" },
            { name: "Food Growers", percentage: "28%" },
            { name: "Plant Collectors", percentage: "18%" }
          ]
        },
        topRecommendations: [
          { name: "Seasonal Marketing Campaign", confidence: "High", impact: "Significant" },
          { name: "Bundle Top Products", confidence: "Medium", impact: "Moderate" }
        ],
        dataPoints: {
          orders: 254,
          items: 867,
          users: 142
        }
      };
    }
  } catch (error) {
    console.error("❌ Failed to generate ML insights:", error);
    throw error;
  }
};

/**
 * Get personalized recommendations for a specific user
 * @param {String} userId - User ID to generate recommendations for
 * @returns {Promise<Object>} Personalized recommendations
 */
const getUserRecommendations = async (userId) => {
  try {
    // Check if ML modules are available
    try {
      const DataPreprocessor = require('../ml/dataPreprocessor');
      const TrendAnalyzer = require('../ml/trendAnalyzer');
      
      // Specify date range (last 6 months)
      const dateRange = {
        start: new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString(),
        end: new Date().toISOString()
      };
      
      // Export data from storage
      const ordersData = await dataStorage.exportDataForML('orders', dateRange);
      const itemsData = await dataStorage.exportDataForML('items', dateRange);
      
      // Create product feature vectors
      const productFeatures = DataPreprocessor.createProductFeatures(itemsData, ordersData);
      
      // Generate personalized recommendations
      const recommendations = TrendAnalyzer.generateRecommendations(
        productFeatures, 
        ordersData,
        userId
      );
      
      return {
        userId,
        recommendations,
        timestamp: new Date().toISOString()
      };
    } catch (moduleError) {
      console.warn(`⚠️ ML modules not available for user ${userId}, returning mock data:`, moduleError.message);
      
      // Fall back to mock data if ML modules are not available
      return {
        userId,
        recommendations: [
          {
            productId: "prod123",
            name: "Organic Plant Food",
            confidence: 92,
            reason: "Based on previous purchases and growing conditions"
          },
          {
            productId: "prod456",
            name: "Garden Utility Set",
            confidence: 87,
            reason: "Complements recent plant additions"
          },
          {
            productId: "prod789",
            name: "Automated Watering System",
            confidence: 75,
            reason: "Matches user's preference for automation"
          }
        ],
        timestamp: new Date().toISOString()
      };
    }
  } catch (error) {
    console.error(`❌ Failed to get recommendations for user ${userId}:`, error);
    throw error;
  }
};

module.exports = {
  processWebhook,
  generateSamplePayload,
  generateMLInsights,
  getUserRecommendations
};