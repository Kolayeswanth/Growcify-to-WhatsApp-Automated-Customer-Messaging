const express = require("express");
const axios = require("axios");
const bodyParser = require("body-parser");
require("dotenv").config();

// ========== ENVIRONMENT SETUP & VALIDATION ==========
console.log('🔍 Starting environment validation...');
const requiredEnvVars = {
    TENANT_ID: process.env.TENANT_ID,
    WATI_API_KEY: process.env.WATI_API_KEY
};

const missingVars = Object.entries(requiredEnvVars)
    .filter(([key, value]) => !value)
    .map(([key]) => key);

if (missingVars.length > 0) {
    console.error('❌ Missing required environment variables:', missingVars.join(', '));
    process.exit(1);
}

// Log environment variables (masked for security)
console.log('⚙️ Environment configuration:');
console.log(`- TENANT_ID: ${process.env.TENANT_ID ? '******' + process.env.TENANT_ID.slice(-4) : 'NOT SET'}`);
console.log(`- WATI_API_KEY: ${process.env.WATI_API_KEY ? '******' + process.env.WATI_API_KEY.slice(-4) : 'NOT SET'}`);
console.log(`- NODE_ENV: ${process.env.NODE_ENV || 'development'}`);
console.log(`- PORT: ${process.env.PORT || 5000}`);

// ========== EXPRESS APP SETUP ==========
const app = express();
const PORT = process.env.PORT || 5000;

// CORS middleware
app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization");
    if (req.method === 'OPTIONS') {
        res.header("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE");
        return res.status(200).json({});
    }
    next();
});

// Request logging middleware
app.use((req, res, next) => {
    const timestamp = new Date().toISOString();
    console.log(`📝 [${timestamp}] ${req.method} ${req.url}`);
    
    // Log request headers for debugging
    if (process.env.NODE_ENV !== 'production') {
        console.log('📋 Request Headers:', JSON.stringify(req.headers, null, 2));
    }
    
    // Track response time
    const start = Date.now();
    res.on('finish', () => {
        const duration = Date.now() - start;
        console.log(`⏱️ [${timestamp}] ${req.method} ${req.url} - Status: ${res.statusCode} - Duration: ${duration}ms`);
    });
    
    next();
});

// Body parser middleware
app.use(bodyParser.json({
    verify: (req, res, buf) => {
        try {
            JSON.parse(buf);
        } catch (e) {
            console.error('❌ Invalid JSON in request body:', e.message);
            res.status(400).json({ success: false, message: 'Invalid JSON payload' });
            throw new Error('Invalid JSON');
        }
    }
}));

// ========== EVENT TEMPLATES ==========
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
    }
};

// ========== HELPER FUNCTIONS ==========
// Function to validate mobile number format
function validateMobileNumber(mobile) {
    // Remove any non-digit characters
    const cleaned = mobile.replace(/\D/g, '');
    
    // Check if it's a valid Indian number
    if (/^91\d{10}$/.test(cleaned)) {
        return cleaned; // Already has country code
    } else if (/^\d{10}$/.test(cleaned)) {
        return `91${cleaned}`; // Add country code
    } else {
        console.warn('⚠️ Invalid mobile number format:', mobile);
        return null;
    }
}

// Function to extract user mobile from data
function extractMobileNumber(data, event) {
    let mobile = null;
    
    if (event.startsWith("user.") && data.user?.mobile) {
        mobile = data.user.mobile;
    } else if (event.startsWith("order.")) {
        mobile = data.user?.mobile || data.order?.userMobile || data.order?.user?.mobile;
    }
    
    if (!mobile) {
        console.error('❌ No mobile number found in payload for event:', event);
        console.log('📄 Data structure:', JSON.stringify(data, null, 2));
        return null;
    }
    
    return validateMobileNumber(mobile);
}

// Function to send message to WATI API
async function sendWatiMessage(whatsappNumber, templateName, parameters) {
    const tenantId = process.env.TENANT_ID;
    const watiToken = process.env.WATI_API_KEY;
    
    // Construct API URL and payload
    const watiApiUrl = `https://live-mt-server.wati.io/${tenantId}/api/v1/sendTemplateMessage?whatsappNumber=${whatsappNumber}`;
    const payload = {
        template_name: templateName,
        broadcast_name: "testing",
        parameters: parameters
    };
    
    console.log('🚀 WATI API Request:');
    console.log(`- URL: ${watiApiUrl}`);
    console.log(`- Template: ${templateName}`);
    console.log(`- WhatsApp Number: ${whatsappNumber}`);
    console.log(`- Parameters: ${JSON.stringify(parameters, null, 2)}`);
    
    try {
        const response = await axios.post(watiApiUrl, payload, {
            headers: {
                "Authorization": `Bearer ${watiToken}`,
                "Content-Type": "application/json"
            }
        });
        
        console.log('✅ WATI API Response:', JSON.stringify(response.data, null, 2));
        return { success: true, data: response.data };
    } catch (error) {
        console.error('❌ WATI API Error:');
        console.error(`- Status: ${error.response?.status || 'Unknown'}`);
        console.error(`- Error Message: ${error.message}`);
        console.error(`- Response Data: ${JSON.stringify(error.response?.data || {}, null, 2)}`);
        
        // Check for specific error types
        if (error.response?.status === 401) {
            console.error('⚠️ Authentication failed. Check your WATI API key.');
        } else if (error.response?.status === 404) {
            console.error('⚠️ Resource not found. Check tenant ID and template name.');
        } else if (error.response?.data?.errors?.includes('Template is not Approved')) {
            console.error('⚠️ Template is not approved by WhatsApp.');
        }
        
        return { success: false, error: error.response?.data || error.message };
    }
}

// ========== ROUTES ==========
// Health check endpoint
app.get("/health", (req, res) => {
    res.status(200).json({ status: "ok", timestamp: new Date().toISOString() });
});

// Main webhook endpoint
app.post("/growcify-webhook", async (req, res) => {
    const processingStartTime = Date.now();
    console.log('==================================================');
    console.log(`🔄 PROCESSING WEBHOOK [${new Date().toISOString()}]`);
    
    try {
        // Log full request body for debugging
        console.log('📥 FULL WEBHOOK PAYLOAD:', JSON.stringify(req.body, null, 2));
        
        const { event, data } = req.body;
        
        // Validate required fields
        if (!event || !data) {
            console.error('❌ Missing required fields in webhook payload');
            return res.status(400).json({ 
                success: false,
                message: "Missing required fields", 
                required: ['event', 'data'] 
            });
        }
        
        console.log(`📌 Processing event type: ${event}`);
        
        // Check if event type is supported
        if (!eventTemplates[event]) {
            console.warn('⚠️ Unhandled event type received:', event);
            return res.status(400).json({ 
                success: false,
                message: "Unhandled event type",
                receivedEvent: event,
                supportedEvents: Object.keys(eventTemplates)
            });
        }
        
        // Get WhatsApp number
        const whatsappNumber = extractMobileNumber(data, event);
        if (!whatsappNumber) {
            return res.status(400).json({ 
                success: false,
                message: "Invalid or missing mobile number" 
            });
        }
        
        // For order-related events, validate order details
        if (event.startsWith("order.") && !data.order) {
            console.error('❌ Missing order details in payload');
            return res.status(400).json({ 
                success: false,
                message: "Missing order details" 
            });
        }
        
        // Get template configuration and generate parameters
        const templateConfig = eventTemplates[event];
        console.log(`📋 Using template: ${templateConfig.templateName}`);
        
        // Generate template parameters
        console.log('🔄 Generating template parameters...');
        let parameters;
        try {
            parameters = templateConfig.parameters(data);
            console.log('✅ Parameters generated successfully:', JSON.stringify(parameters, null, 2));
        } catch (paramError) {
            console.error('❌ Error generating parameters:', paramError);
            return res.status(400).json({ 
                success: false,
                message: "Error processing template parameters",
                error: paramError.message
            });
        }
        
        // Send message to WATI
        console.log(`📱 Sending message to WhatsApp number: ${whatsappNumber}`);
        const watiResult = await sendWatiMessage(whatsappNumber, templateConfig.templateName, parameters);
        
        if (!watiResult.success) {
            return res.status(500).json({ 
                success: false,
                message: "Failed to send WhatsApp message",
                error: watiResult.error
            });
        }
        
        const processingTime = Date.now() - processingStartTime;
        console.log(`✅ Webhook processed successfully in ${processingTime}ms`);
        
        return res.status(200).json({ 
            success: true, 
            message: "WhatsApp message sent successfully!",
            event: event,
            processingTime: `${processingTime}ms`,
            response: watiResult.data
        });
        
    } catch (error) {
        console.error('❌ UNHANDLED ERROR:');
        console.error(`- Message: ${error.message}`);
        console.error(`- Stack: ${error.stack}`);
        
        if (error.response) {
            console.error('- API Response Status:', error.response.status);
            console.error('- API Response Headers:', JSON.stringify(error.response.headers, null, 2));
            console.error('- API Response Data:', JSON.stringify(error.response.data, null, 2));
        }
        
        if (error.request) {
            console.error('- Request was made but no response received');
        }
        
        res.status(500).json({ 
            success: false,
            message: "Internal server error",
            error: error.message
        });
    }
    
    console.log('==================================================');
});

// Test endpoint for WATI integration
app.post("/test-wati", async (req, res) => {
    try {
        const { whatsappNumber, templateName, parameters } = req.body;
        
        if (!whatsappNumber || !templateName) {
            return res.status(400).json({
                success: false,
                message: "Missing required fields",
                required: ['whatsappNumber', 'templateName']
            });
        }
        
        console.log('🧪 Testing WATI integration directly');
        const result = await sendWatiMessage(whatsappNumber, templateName, parameters || []);
        
        return res.status(result.success ? 200 : 500).json(result);
    } catch (error) {
        console.error('❌ Error in test-wati endpoint:', error);
        return res.status(500).json({
            success: false,
            message: "Internal server error",
            error: error.message
        });
    }
});

// List templates endpoint
app.get("/templates", (req, res) => {
    const templates = Object.entries(eventTemplates).map(([eventType, config]) => ({
        eventType,
        templateName: config.templateName,
        parameterFunction: config.parameters.toString()
    }));
    
    res.status(200).json({ templates });
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('❌ UNHANDLED ERROR IN MIDDLEWARE:', err);
    res.status(500).json({ 
        success: false,
        message: "Internal server error",
        error: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
    });
});

// Catch-all route for undefined endpoints
app.use((req, res) => {
    console.warn(`⚠️ Attempted access to undefined route: ${req.method} ${req.url}`);
    res.status(404).json({
        success: false,
        message: "Endpoint not found",
        availableEndpoints: [
            "POST /growcify-webhook - Main webhook handler",
            "POST /test-wati - Test WATI integration directly",
            "GET /templates - List available templates",
            "GET /health - Health check"
        ]
    });
});

// ========== SERVER INITIALIZATION ==========
app.listen(PORT, () => {
    console.log('==================================================');
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`🌐 Webhook URL: https://whtsapp-web-hook.onrender.com/growcify-webhook`);
    console.log('⚙️ Environment:', process.env.NODE_ENV || 'development');
    console.log('✅ All required environment variables are set');
    console.log('📨 Supported event types:', Object.keys(eventTemplates).join(', '));
    console.log('==================================================');
});