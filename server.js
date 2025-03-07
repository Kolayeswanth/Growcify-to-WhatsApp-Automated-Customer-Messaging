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
    templateName: "bo_signup",
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
    templateName: "bo_order_placed",
    parameters: (data) => {
      let totalMarketPrice = 0;
      data.order?.items?.forEach((item) => {
        totalMarketPrice += item.marketPrice * item.qty || 0;
      });
      const savings = totalMarketPrice - (data.order?.amount || 0);

      let itemsList = "";
      data.order?.items?.forEach((item) => {
        itemsList += `• ${item.qty} x ${item._id.name} (${item.size} ${item.unit}) - ₹${item.price}\n`;
      });

      return [
        { name: "order_id", value: data.order?.oid?.toString() || "" },
        { name: "customer_name", value: data.order?.user?.name || "Customer" },
        {
          name: "date",
          value: new Date(data.order?.createdAt).toLocaleDateString() || "",
        },
        { name: "amount", value: data.order?.amount?.toString() || "0" },
        {
          name: "payment_method",
          value:
            data.order?.paymentMethod === "COD"
              ? "Cash on Delivery"
              : data.order?.paymentMethod || "",
        },
        { name: "savings", value: savings.toString() },
        { name: "items_list", value: itemsList },
      ];
    },
  },
  "order.cancelled": {
    templateName: "bo_order_cancelled",
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
    templateName: "bo_signin1",
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
    const secretHeader =
      req.headers["x-webhook-secret"] || req.headers["x-growcify-secret"];
    if (!secretHeader || secretHeader !== process.env.WEBHOOK_SECRET) {
      return res.status(401).json({
        success: false,
        message: "Invalid webhook secret",
      });
    }

    const { event, data } = req.body;

    if (!event || !data) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields",
        required: ["event", "data"],
      });
    }

    if (!eventTemplates[event]) {
      return res.status(400).json({
        success: false,
        message: "Unhandled event type",
        receivedEvent: event,
        supportedEvents: Object.keys(eventTemplates),
      });
    }

    if (event.startsWith("user.") && !data.user?.mobile) {
      return res.status(400).json({
        success: false,
        message: "Missing mobile number in user data",
      });
    }

    if (event.startsWith("order.")) {
      if (!data.order) {
        return res.status(400).json({
          success: false,
          message: "Missing order details",
        });
      }

      const userMobile =
        data.user?.mobile || data.order?.userMobile || data.order?.user?.mobile;

      if (!userMobile) {
        return res.status(400).json({
          success: false,
          message: "Missing mobile number for order notifications",
        });
      }

      if (!data.user) data.user = {};
      data.user.mobile = userMobile;
    }

    const templateConfig = eventTemplates[event];
    const tenantId = process.env.TENANT_ID;
    const watiToken = process.env.WATI_API_KEY;

    const whatsappNumber = data.user.mobile.startsWith("91")
      ? data.user.mobile
      : `91${data.user.mobile}`;

    const watiApiUrl = `https://live-mt-server.wati.io/${tenantId}/api/v1/sendTemplateMessage?whatsappNumber=${whatsappNumber}`;

    const payload = {
      template_name: templateConfig.templateName,
      broadcast_name: "testing",
      parameters: templateConfig.parameters(data),
    };

    const response = await axios.post(watiApiUrl, payload, {
      headers: {
        Authorization: `Bearer ${watiToken}`,
        "Content-Type": "application/json",
      },
    });

    if (response.data && response.data.result === true) {
      if (response.data.error || response.data.warning) {
        console.warn(
          "⚠️ WATI API warning/error:",
          response.data.error || response.data.warning
        );
      }

      return res.status(200).json({
        success: true,
        message: "WhatsApp message request accepted by WATI",
        event: event,
        response: response.data,
      });
    } else {
      return res.status(200).json({
        success: false,
        message: "WATI API did not confirm message delivery",
        event: event,
        response: response.data,
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error communicating with WATI API",
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
