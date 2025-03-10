const express = require("express");
const axios = require("axios");
const bodyParser = require("body-parser");
const cors = require("cors");
require("dotenv").config();

const requiredEnvVars = {
  TENANT_ID: process.env.TENANT_ID,
  WATI_API_KEY: process.env.WATI_API_KEY,
  WEBHOOK_SECRET: process.env.WEBHOOK_SECRET,
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

const app = express();
app.use(cors());
const PORT = process.env.PORT || 5000;

// Parse JSON bodies
app.use(bodyParser.json());

const eventTemplates = {
  "user.signup": {
    templateName: "bo_signup1",
    parameters: (data) => [
      { name: "name", value: data.user?.name || "Customer" },
      {
        name: "mobile",
        value: `${data.user?.callingCode || ""}${data.user?.mobile || ""}`,
      },
      { name: "referral_code", value: data.user?.referralCode || "" },
    ],
  },
  "order.placed": {
    templateName: "bo_order_placed1", 
    parameters: (data) => {
      console.log("Processing order data:", JSON.stringify(data, null, 2));

      // Calculate total market price and savings
      let totalMarketPrice = 0;
      data.order?.items?.forEach((item) => {
        const itemMarketPrice = item.marketPrice || 0;
        const itemQty = item.qty || 1;
        totalMarketPrice += itemMarketPrice * itemQty;
      });

      const orderAmount = data.order?.amount || 0;
      const savings = Math.max(0, totalMarketPrice - orderAmount);

      // Format items list with a simpler format
      let itemsList = "";
      if (data.order?.items && data.order.items.length > 0) {
        data.order.items.forEach((item, index) => {
          // Get the item name - handle both data structures
          const itemName = item.name || (item._id ? item._id.name : "Item");
          const itemSize = item.size || "";
          const itemUnit = item.unit || "";
          const itemPrice = item.price || 0;
          const itemQty = item.qty || 1;

          // Very simple format without special characters
          itemsList += `${itemQty} x ${itemName} - Rs${itemPrice}\n`;
        });
      } else {
        itemsList = "Your order items";
      }

      console.log("Formatted items list:", itemsList);
      console.log("Calculated savings:", savings);

      // Simple date format
      const orderDate = data.order?.createdAt
        ? new Date(data.order.createdAt).toLocaleDateString("en-IN")
        : new Date().toLocaleDateString("en-IN");

      // Payment method
      const paymentMethod =
        data.order?.paymentMethod === "COD"
          ? "Cash on Delivery"
          : data.order?.paymentMethod || "Online Payment";

      return [
        { name: "order_id", value: data.order?.oid?.toString() || "" },
        { name: "customer_name", value: data.order?.user?.name || "Customer" },
        { name: "date", value: orderDate },
        { name: "amount", value: orderAmount.toString() },
        { name: "payment_method", value: paymentMethod },
        { name: "savings", value: savings.toString() },
        { name: "items_list", value: itemsList.trim() },
      ];
    },
  },
  "order.cancelled": {
    templateName: "bo_order_cancelled1",
    parameters: (data) => [
      { name: "order_id", value: data.order?.oid?.toString() || "" },
      { name: "customer_name", value: data.order?.user?.name || "Customer" },
      {
        name: "date",
        value: new Date(data.order?.createdAt).toLocaleDateString() || "",
      },
      {
        name: "cancellation_reason",
        value: data.order?.cancellationReason || "Not specified",
      },
      {
        name: "refund_status",
        value: data.order?.isRefundProcessed ? "Processed" : "Pending",
      },
    ],
  },

  "user.signin": {
    templateName: "bo_signin2",
    parameters: (data) => [
      { name: "name", value: data.user?.name || "Customer" },
      {
        name: "mobile",
        value: `${data.user?.callingCode || ""}${data.user?.mobile || ""}`,
      },
      {
        name: "last_login",
        value:
          new Date(data.user?.profile?.lastLoginAt).toLocaleString("en-IN", {
            timeZone: "Asia/Kolkata",
            hour12: true,
          }) || "",
      },
    ],
  },
};

// Health endpoint
app.get("/health", (req, res) => {
  res.status(200).json({ success: true, message: "Server is running" });
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

  res.status(200).json({
    success: true,
    message: `To test this event, send a POST request to /growcify-webhook with the appropriate payload for '${event}'`,
    samplePayload: event.startsWith("user")
      ? { event, data: { user: { name: "Test User", mobile: "9876543210" } } }
      : {
          event,
          data: {
            order: {
              oid: "123456",
              user: { name: "Test User", mobile: "9876543210" },
            },
          },
        },
  });
});

app.get("/test-wati/:template/:phone", async (req, res) => {
  try {
    const { template, phone } = req.params;
    const tenantId = process.env.TENANT_ID;
    const watiToken = process.env.WATI_API_KEY;

    const whatsappNumber = phone.startsWith("91") ? phone : `91${phone}`;

    const watiApiUrl = `https://live-mt-server.wati.io/${tenantId}/api/v1/sendTemplateMessage?whatsappNumber=${whatsappNumber}`;

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
          value:
            "• 2 x Test Product (500g) - ₹500\n• 1 x Another Item (1kg) - ₹500",
        },
      ];
    }

    const payload = {
      template_name: template,
      broadcast_name: "testing",
      parameters: parameters,
    };

    const response = await axios.post(watiApiUrl, payload, {
      headers: {
        Authorization: `Bearer ${watiToken}`,
        "Content-Type": "application/json",
      },
    });

    return res.status(200).json({
      success: true,
      message: "Test message sent to WATI",
      response: response.data,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Error sending test message",
      error: error.response?.data || error.message,
    });
  }
});

app.post("/growcify-webhook", async (req, res) => {
  try {
    console.log(
      "📥 Received webhook payload:",
      JSON.stringify(req.body, null, 2)
    );

    const { event, data } = req.body;

    if (!event || !data) {
      console.error("❌ Missing required fields in webhook payload");
      return res.status(400).json({
        success: false,
        message: "Missing required fields",
        required: ["event", "data"],
      });
    }

    if (!eventTemplates[event]) {
      console.warn("⚠️ Unhandled event type received:", event);
      return res.status(400).json({
        success: false,
        message: "Unhandled event type",
        receivedEvent: event,
      });
    }

    // Extract mobile number based on event type
    let mobileNumber = "";

    if (event.startsWith("user.")) {
      mobileNumber = data.user?.mobile;
      if (!mobileNumber) {
        console.error("❌ Missing mobile number in user data");
        return res.status(400).json({
          success: false,
          message: "Missing mobile number in user data",
        });
      }
    } else if (event.startsWith("order.")) {
      // Extract mobile from order data structure
      mobileNumber = data.order?.user?.mobile;
      if (!mobileNumber) {
        console.error("❌ Missing mobile number in order data");
        return res.status(400).json({
          success: false,
          message: "Missing mobile number for order notifications",
        });
      }
    }

    // Get the template configuration for this event
    const templateConfig = eventTemplates[event];
    const tenantId = process.env.TENANT_ID;
    const watiToken = process.env.WATI_API_KEY;

    // Format the number properly with country code
    const whatsappNumber = mobileNumber.startsWith("91")
      ? mobileNumber
      : `91${mobileNumber}`;

    console.log(`👤 Processing ${event} event`);
    console.log("🔑 Using tenant ID:", tenantId);
    console.log("📱 Sending to WhatsApp number:", whatsappNumber);
    console.log("📋 Using template:", templateConfig.templateName);

    // Generate parameters for this event
    const parameters = templateConfig.parameters(data);
    console.log("📝 Template parameters:", JSON.stringify(parameters, null, 2));

    // Properly formatted URL with path parameter (tenantId) and query parameter (whatsappNumber)
    const watiApiUrl = `https://live-mt-server.wati.io/${tenantId}/api/v1/sendTemplateMessage?whatsappNumber=${whatsappNumber}`;

    // Properly formatted payload according to the schema
    const payload = {
      template_name: templateConfig.templateName,
      broadcast_name: "testing",
      parameters: parameters,
    };

    console.log("📤 Sending request to WATI API:", {
      url: watiApiUrl,
      payload: JSON.stringify(payload, null, 2),
    });

    const response = await axios.post(watiApiUrl, payload, {
      headers: {
        Authorization: `Bearer ${watiToken}`,
        "Content-Type": "application/json",
      },
    });

    console.log("✅ WATI API Response:", response.data);
    return res.status(200).json({
      success: true,
      message: "WhatsApp message sent successfully!",
      event: event,
      response: response.data,
    });
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
