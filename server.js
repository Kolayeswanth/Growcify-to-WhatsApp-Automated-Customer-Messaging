const express = require("express");
const axios = require("axios");
const bodyParser = require("body-parser");
const cors = require("cors");
require("dotenv").config();

const requiredEnvVars = {
    TENANT_ID: process.env.TENANT_ID,
    WATI_API_KEY: process.env.WATI_API_KEY,
    WEBHOOK_SECRET: process.env.WEBHOOK_SECRET // Add this environment variable
};

const missingVars = Object.entries(requiredEnvVars)
    .filter(([key, value]) => !value)
    .map(([key]) => key);

if (missingVars.length > 0) {
    console.error('❌ Missing required environment variables:', missingVars.join(', '));
    process.exit(1);
}

const app = express();
app.use(cors());
const PORT = process.env.PORT || 5000;

// Request logging middleware
app.use((req, res, next) => {
    console.log(`📝 [${new Date().toISOString()}] ${req.method} ${req.url}`);
    console.log('📤 Request Headers:', JSON.stringify(req.headers, null, 2));
    next();
});

// Parse JSON bodies
app.use(bodyParser.json());

const eventTemplates = {
    "user.signup": {
        templateName: "bo_signup",
        parameters: (data) => [
            { name: "name", value: data.user?.name || "Customer" },
            { name: "mobile", value: `${data.user?.callingCode || ""}${data.user?.mobile || ""}` },
            { name: "referral_code", value: data.user?.referralCode || "" },
        ]
    },
    "order.placed": {
        templateName: "bo_order_placed",
        parameters: (data) => {
            let totalMarketPrice = 0;
            data.order?.items?.forEach(item => {
                totalMarketPrice += (item.marketPrice * item.qty) || 0;
            });
            const savings = totalMarketPrice - (data.order?.amount || 0);
            
            // Format items list
            let itemsList = '';
            data.order?.items?.forEach(item => {
                itemsList += `• ${item.qty} x ${item._id.name} (${item.size} ${item.unit}) - ₹${item.price}\n`;
            });
            
            return [
                { name: "order_id", value: data.order?.oid?.toString() || "" },
                { name: "customer_name", value: data.order?.user?.name || "Customer" },
                { name: "date", value: new Date(data.order?.createdAt).toLocaleDateString() || "" },
                { name: "amount", value: data.order?.amount?.toString() || "0" },
                { name: "payment_method", value: data.order?.paymentMethod === 'COD' ? 'Cash on Delivery' : data.order?.paymentMethod || "" },
                { name: "savings", value: savings.toString() },
                { name: "items_list", value: itemsList }
            ];
        }
    },
    "order.cancelled": {
        templateName: "bo_order_cancelled",
        parameters: (data) => [
            { name: "order_id", value: data.order?.oid?.toString() || "" },
            { name: "customer_name", value: data.order?.user?.name || "Customer" },
            { name: "date", value: new Date(data.order?.createdAt).toLocaleDateString() || "" },
            { name: "cancellation_reason", value: data.order?.cancellationReason || "Not specified" },
            { name: "refund_status", value: data.order?.isRefundProcessed ? "Processed" : "Pending" }
        ]
    },
    // Added the signin event, which was missing
    "user.signin": {
        templateName: "bo_signup",
        parameters: (data) => [
            { name: "name", value: data.user?.name || "Customer" },
            { name: "mobile", value: `${data.user?.callingCode || ""}${data.user?.mobile || ""}` },
            { name: "referral_code", value: data.user?.referralCode || "123" },
        ]
    }
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
            message: `Event type '${event}' not supported. Supported events: ${Object.keys(eventTemplates).join(', ')}`
        });
    }
    
    res.status(200).json({
        success: true,
        message: `To test this event, send a POST request to /growcify-webhook with the appropriate payload for '${event}'`,
        samplePayload: event.startsWith('user') ? 
            { event, data: { user: { name: "Test User", mobile: "9876543210" } } } :
            { event, data: { order: { oid: "123456", user: { name: "Test User", mobile: "9876543210" } } } }
    });
});

app.post("/growcify-webhook", async (req, res) => {
    try {
        console.log('📥 Received webhook payload:', JSON.stringify(req.body, null, 2));
        
        // Verify webhook secret
        const secretHeader = req.headers['x-webhook-secret'] || req.headers['x-growcify-secret'];
        if (!secretHeader || secretHeader !== process.env.WEBHOOK_SECRET) {
            console.error('❌ Invalid webhook secret');
            console.error('Expected:', process.env.WEBHOOK_SECRET);
            console.error('Received:', secretHeader);
            return res.status(401).json({ 
                success: false,
                message: "Invalid webhook secret" 
            });
        }
        
        const { event, data } = req.body;

        if (!event || !data) {
            console.error('❌ Missing required fields in webhook payload');
            return res.status(400).json({ 
                success: false,
                message: "Missing required fields", 
                required: ['event', 'data'] 
            });
        }

        if (!eventTemplates[event]) {
            console.warn('⚠️ Unhandled event type received:', event);
            return res.status(400).json({ 
                success: false,
                message: "Unhandled event type",
                receivedEvent: event,
                supportedEvents: Object.keys(eventTemplates)
            });
        }

        // For user-related events, we need the mobile number
        if (event.startsWith("user.") && !data.user?.mobile) {
            console.error('❌ Missing mobile number in user data');
            return res.status(400).json({ 
                success: false,
                message: "Missing mobile number in user data" 
            });
        }

        // For order-related events, we need both order details and user mobile
        if (event.startsWith("order.")) {
            if (!data.order) {
                console.error('❌ Missing order details in payload');
                return res.status(400).json({ 
                    success: false,
                    message: "Missing order details" 
                });
            }
            
            // Assuming the mobile number might be in different places depending on payload structure
            const userMobile = data.user?.mobile || data.order?.userMobile || data.order?.user?.mobile;
            
            if (!userMobile) {
                console.error('❌ Missing mobile number for order notifications');
                return res.status(400).json({ 
                    success: false,
                    message: "Missing mobile number for order notifications" 
                });
            }
            
            // Add mobile to user object for consistent handling below
            if (!data.user) data.user = {};
            data.user.mobile = userMobile;
        }

        // Get the template configuration for this event
        const templateConfig = eventTemplates[event];
        const tenantId = process.env.TENANT_ID;
        const watiToken = process.env.WATI_API_KEY;
        
        // Format the number properly with country code
        const whatsappNumber = data.user.mobile.startsWith('91') ? 
            data.user.mobile : `91${data.user.mobile}`;

        console.log(`👤 Processing ${event} event`);
        console.log('🔑 Using tenant ID:', tenantId);
        console.log('📱 Sending to WhatsApp number:', whatsappNumber);
        console.log('📋 Using template:', templateConfig.templateName);

        // Properly formatted URL with path parameter (tenantId) and query parameter (whatsappNumber)
        const watiApiUrl = `https://live-mt-server.wati.io/${tenantId}/api/v1/sendTemplateMessage?whatsappNumber=${whatsappNumber}`;

        // Properly formatted payload according to the schema
        const payload = {
            template_name: templateConfig.templateName,
            broadcast_name: "testing",
            parameters: templateConfig.parameters(data)
        };

        console.log('📤 Sending request to WATI API:', {
            url: watiApiUrl,
            payload: payload
        });

        const response = await axios.post(watiApiUrl, payload, {
            headers: {
                "Authorization": `Bearer ${watiToken}`,
                "Content-Type": "application/json"
            }
        });

        console.log('✅ WATI API Response:', response.data);
        return res.status(200).json({ 
            success: true, 
            message: "WhatsApp message sent successfully!",
            event: event,
            response: response.data
        });

    } catch (error) {
        console.error('❌ Error details:', {
            message: error.message,
            response: error.response?.data,
            stack: error.stack
        });

        res.status(500).json({ 
            success: false,
            message: "Internal server error",
            error: error.response?.data || error.message
        });
    }
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('❌ Unhandled error:', err);
    res.status(500).json({ 
        success: false,
        message: "Internal server error",
        error: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
    });
});

// Start server
app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log('⚙️ Environment:', process.env.NODE_ENV || 'development');
    console.log('✅ All required environment variables are set');
    console.log('📨 Supported event types:', Object.keys(eventTemplates).join(', '));
});