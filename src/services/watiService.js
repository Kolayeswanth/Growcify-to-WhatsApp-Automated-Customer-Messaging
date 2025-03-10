const axios = require('axios');
const { config } = require('../config');
const { formatWhatsAppNumber } = require('../utils/helpers');

/**
 * Send message using WATI API
 * @param {string} mobileNumber - Recipient's mobile number
 * @param {string} templateName - Name of the template to use
 * @param {Array} parameters - Template parameters
 * @returns {Promise} API response
 */
const sendTemplateMessage = async (mobileNumber, templateName, parameters) => {
  try {
    const whatsappNumber = formatWhatsAppNumber(mobileNumber);
    console.log("📱 Sending to WhatsApp number:", whatsappNumber);
    console.log("📋 Using template:", templateName);
    console.log("📝 Template parameters:", JSON.stringify(parameters, null, 2));
    
    const watiApiUrl = `${config.watiApiBaseUrl}/${config.tenantId}/api/v1/sendTemplateMessage?whatsappNumber=${whatsappNumber}`;
    
    const payload = {
      template_name: templateName,
      broadcast_name: "testing",
      parameters: parameters,
    };
    
    console.log("📤 Sending request to WATI API:", {
      url: watiApiUrl,
      payload: JSON.stringify(payload, null, 2),
    });
    
    const response = await axios.post(watiApiUrl, payload, {
      headers: {
        Authorization: `Bearer ${config.watiApiKey}`,
        "Content-Type": "application/json",
      },
    });
    
    console.log("✅ WATI API Response:", response.data);
    return response.data;
  } catch (error) {
    console.error("❌ Error calling WATI API:", {
      message: error.message,
      response: error.response?.data,
      stack: error.stack,
    });
    throw error;
  }
};

/**
 * Send a test message 
 * @param {string} template - Template name
 * @param {string} phone - Phone number
 * @returns {Promise} API response
 */
const sendTestMessage = async (template, phone) => {
  const whatsappNumber = formatWhatsAppNumber(phone);
  
  let parameters = [];
  if (template.includes("signup") || template.includes("signin")) {
    parameters = [
      { name: "name", value: "Test User" },
      { name: "mobile", value: whatsappNumber },
      { name: "referral_code", value: "TEST123" },
    ];
  } else if (template.includes("order")) {
    parameters = [
      { name: "order_id", value: "TEST12345" },
      { name: "customer_name", value: "Test User" },
      { name: "date", value: new Date().toLocaleDateString() },
      { name: "amount", value: "1000" },
      { name: "payment_method", value: "Cash on Delivery" },
      { name: "savings", value: "200" },
      {
        name: "items_list",
        value: "2 x Test Product - Rs500, 1 x Another Item - Rs500",
      },
    ];
  }
  
  return sendTemplateMessage(whatsappNumber, template, parameters);
};

module.exports = {
  sendTemplateMessage,
  sendTestMessage
};