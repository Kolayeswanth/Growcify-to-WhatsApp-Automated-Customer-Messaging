const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");

const { config, validateConfig } = require("./src/config");
const webhookService = require("./src/services/webhook");
const watiService = require("./src/services/watiService");
const eventTemplates = require("./src/templates/templateConfig");

// Validate environment variables
validateConfig();

const app = express();
app.use(cors());
const PORT = config.server.port;

// Parse JSON bodies
app.use(bodyParser.json());

// Health endpoint
app.get("/health", (req, res) => {
  res.status(200).json({ 
    success: true, 
    message: "Server is running",
    environment: config.server.environment 
  });
});

// Mock event endpoint for testing
app.get("/test-webhook/:event", (req, res) => {
  const { event } = req.params;

  if (!eventTemplates[event]) {
    return res.status(400).json({
      success: false,
      message: `Event type '${event}' not supported. Supported events: ${Object.keys(
        eventTemplates
      ).join(", ")}`,
    });
  }

  const samplePayload = webhookService.generateSamplePayload(event);

  res.status(200).json({
    success: true,
    message: `To test this event, send a POST request to /growcify-webhook with the appropriate payload for '${event}'`,
    samplePayload
  });
});

// Test WATI API endpoint
app.get("/test-wati/:template/:phone", async (req, res) => {
  try {
    const { template, phone } = req.params;
    const response = await watiService.sendTestMessage(template, phone);
    
    return res.status(200).json({
      success: true,
      message: "Test message sent to WATI",
      response
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Error sending test message",
      error: error.response?.data || error.message,
    });
  }
});

// Main webhook endpoint
app.post("/growcify-webhook", async (req, res) => {
  try {
    const result = await webhookService.processWebhook(req.body);
    return res.status(200).json(result);
  } catch (error) {
    console.error("❌ Error details:", {
      message: error.message,
      response: error.response?.data,
      stack: error.stack,
    });

    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.response?.data || error.message,
    });
  }
});

// ML insights endpoints
app.get('/insights', async (req, res) => {
  try {
    // Extract date range from query params if provided
    const dateRange = req.query.start && req.query.end ? {
      start: req.query.start,
      end: req.query.end
    } : null;
    
    const insights = await webhookService.generateMLInsights({ dateRange });
    res.status(200).json({
      success: true,
      insights
    });
  } catch (error) {
    console.error('❌ Error generating insights:', error);
    res.status(500).json({ 
      success: false, 
      message: "Error generating insights",
      error: error.message 
    });
  }
});

// Get product recommendations for a specific user
app.get('/recommendations/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const recommendations = await webhookService.getUserRecommendations(userId);
    res.status(200).json({
      success: true,
      recommendations
    });
  } catch (error) {
    console.error('❌ Error generating recommendations:', error);
    res.status(500).json({ 
      success: false, 
      message: "Error generating recommendations",
      error: error.message 
    });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  res.status(500).json({
    success: false,
    message: "Internal server error",
    error:
      config.server.environment === "development"
        ? err.message
        : "Something went wrong",
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT} in ${config.server.environment} mode`);
});

// Scheduled ML analysis (if enabled)
if (config.server.environment === 'production' && config.ml.analysisInterval > 0) {
  console.log(`📊 Scheduled ML analysis will run every ${config.ml.analysisInterval / (60 * 60 * 1000)} hours`);
  
  setInterval(async () => {
    try {
      console.log('🔍 Running scheduled ML analysis...');
      await webhookService.generateMLInsights();
      console.log('✅ Scheduled ML analysis completed');
    } catch (error) {
      console.error('❌ Scheduled ML analysis failed:', error);
    }
  }, config.ml.analysisInterval);
}