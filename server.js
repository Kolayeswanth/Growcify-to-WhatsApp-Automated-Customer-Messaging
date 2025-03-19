const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");

const { config, validateConfig } = require("./src/config");
const { connectDB } = require("./src/config/db");
const webhookService = require("./src/services/webhook");
const watiService = require("./src/services/watiService");
const eventTemplates = require("./src/templates/templateConfig");
const analyticsRoutes = require("./src/routes/analytics");

// Validate environment variables
validateConfig();

const app = express();
app.use(cors());
const PORT = config.port;

// Parse JSON bodies
app.use(bodyParser.json());

// Connect to MongoDB
connectDB().then(() => {
  console.log('✅ Ready to store webhook data in MongoDB');
});

// Health endpoint
app.get("/health", (req, res) => {
  res.status(200).json({ success: true, message: "Server is running" });
});

// Analytics routes
app.use("/api/analytics", analyticsRoutes);

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

// Error handling middleware
app.use((err, req, res, next) => {
  res.status(500).json({
    success: false,
    message: "Internal server error",
    error:
      process.env.NODE_ENV === "development"
        ? err.message
        : "Something went wrong",
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});