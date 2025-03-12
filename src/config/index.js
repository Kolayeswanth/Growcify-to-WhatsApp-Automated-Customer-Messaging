require("dotenv").config();

// Configuration settings
const config = {
  // Server settings
  server: {
    port: process.env.PORT || 5000,
    environment: process.env.NODE_ENV || 'development'
  },
  
  // WATI API settings
  wati: {
    baseUrl: process.env.WATI_API_BASE_URL || "https://live-mt-server.wati.io",
    apiKey: process.env.WATI_API_KEY
  },
  
  // Tenant and webhook settings
  tenantId: process.env.TENANT_ID,
  webhookSecret: process.env.WEBHOOK_SECRET,
  
  googleSheets: {
    spreadsheetId: process.env.GOOGLE_SHEETS_ID,
    
    client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    private_key: process.env.GOOGLE_PRIVATE_KEY
  },
  
  // Analysis settings
  ml: {
    // How often to run automated trend analysis (in milliseconds)
    analysisInterval: process.env.ANALYSIS_INTERVAL || 86400000, // Default: daily
    
    // Minimum data points required for analysis
    minDataPoints: process.env.MIN_DATA_POINTS || 50
  }
};

// Validate required environment variables
const validateConfig = () => {
  const requiredEnvVars = {
    TENANT_ID: config.tenantId,
    WATI_API_KEY: config.wati.apiKey,
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