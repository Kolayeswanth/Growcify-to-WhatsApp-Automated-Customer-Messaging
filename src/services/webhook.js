const eventTemplates = require('../templates/templateConfig');
const watiService = require('./watiService');

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
  } else if (event.startsWith("order.")) {
    mobileNumber = data.order?.user?.mobile;
    if (!mobileNumber) {
      console.error("❌ Missing mobile number in order data");
      throw new Error("Missing mobile number for order notifications");
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

module.exports = {
  processWebhook,
  generateSamplePayload
};