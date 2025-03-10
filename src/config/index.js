require("dotenv").config();

// Configuration settings
const config = {
  port: process.env.PORT || 5000,
  tenantId: process.env.TENANT_ID,
  watiApiKey: process.env.WATI_API_KEY,
  webhookSecret: process.env.WEBHOOK_SECRET,
  watiApiBaseUrl: "https://live-mt-server.wati.io"
};

// Validate required environment variables
const validateConfig = () => {
  const requiredEnvVars = {
    TENANT_ID: config.tenantId,
    WATI_API_KEY: config.watiApiKey,
    WEBHOOK_SECRET: config.webhookSecret,
  };

  const missingVars = Object.entries(requiredEnvVars)
    .filter(([key, value]) => !value)
    .map(([key]) => key);

  if (missingVars.length > 0) {
    console.error(
      "❌ Missing required environment variables:",
      missingVars.join(", ")
    );
    process.exit(1);
  }
};

module.exports = {
  config,
  validateConfig
};