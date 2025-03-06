const express = require("express");
const axios = require("axios");
const bodyParser = require("body-parser");
require("dotenv").config();

// ==== ENVIRONMENT VARIABLES VALIDATION ====
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

// ==== EXPRESS APP SETUP ====
const app = express();
const PORT = process.env.PORT || 5000;

// Request logging middleware
app.use((req, res, next) => {
    console.log(`📝 [${new Date().toISOString()}] ${req.method} ${req.url}`);
    next();
});

// Body parser middleware
app.use(bodyParser.json());

// ==== EVENT TEMPLATE CONFIGURATIONS ====
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

// ==== UTILITY FUNCTIONS ====
/**
 * Format a phone number for WhatsApp by ensuring it has the country code
 * @param {string} mobile - The mobile number
 * @param {string} callingCode - Optional calling code
 * @returns {string} - Formatted WhatsApp number
 */
function formatWhatsappNumber(mobile, callingCode) {
    if (!mobile) return null;
    
    // Remove any non-digit characters
    const cleanMobile = mobile.toString().replace(/\D/g, '');
    
    // If already has country code
    if (cleanMobile.startsWith('91')) {
        return cleanMobile;
    }
    
    // If calling code is provided
    if (callingCode) {
        return `${callingCode.replace(/\D/g, '')}${cleanMobile}`;
    }
    
    // Default to Indian country code
    return `91${cleanMobile}`;
}

/**
 * Send a WhatsApp message using WATI API
 * @param {string} whatsappNumber - The recipient's WhatsApp number
 * @param {string} templateName - The template name
 * @param {Array} parameters - Template parameters
 * @returns {Promise} - API response
 */
async function sendWhatsappMessage(whatsappNumber, templateName, parameters) {
    const tenantId = process.env.TENANT_ID;
    const watiToken = process.env.WATI_API_KEY;
    
    const watiApiUrl = `https://live-mt-server.wati.io/${tenantId}/api/v1/sendTemplateMessage?whatsappNumber=${whatsappNumber}`;
    
    const payload = {
        template_name: templateName,
        broadcast_name: "growcify_notification",
        parameters: parameters
    };
    
    console.log('📤 Sending request to WATI API:', {
        url: watiApiUrl,
        payload: JSON.stringify(payload, null, 2)
    });
    
    try {
        const response = await axios.post(watiApiUrl, payload, {
            headers: {
                "Authorization": `Bearer ${watiToken}`,
                "Content-Type": "application/json"
            }
        });
        
        console.log('✅ WATI API Response:', response.data);
        return response.data;
    } catch (error) {
        console.error('❌ WATI API Error:', {
            message: error.message,
            response: error.response?.data
        });
        throw error;
    }
}

// ==== MAIN WEBHOOK ENDPOINT ====
app.post("/growcify-webhook", async (req, res) => {
    try {
        console.log('📥 Received webhook payload:', JSON.stringify(req.body, null, 2));
        
        const { event, data } = req.body;

        // Validate basic request structure
        if (!event || !data) {
            console.error('❌ Missing required fields in webhook payload');
            return res.status(400).json({ 
                success: false,
                message: "Missing required fields", 
                required: ['event', 'data'] 
            });
        }

        // Validate event type
        if (!eventTemplates[event]) {
            console.warn('⚠️ Unhandled event type received:', event);
            return res.status(400).json({ 
                success: false,
                message: "Unhandled event type",
                receivedEvent: event,
                supportedEvents: Object.keys(eventTemplates)
            });
        }

        // Extract and validate user information
        let userMobile = null;
        let callingCode = null;
        
        // User signup events
        if (event.startsWith("user.")) {
            if (!data.user?.mobile) {
                console.error('❌ Missing mobile number in user data');
                return res.status(400).json({ 
                    success: false,
                    message: "Missing mobile number in user data" 
                });
            }
            userMobile = data.user.mobile;
            callingCode = data.user.callingCode;
        }
        
        // Order events
        if (event.startsWith("order.")) {
            if (!data.order) {
                console.error('❌ Missing order details in payload');
                return res.status(400).json({ 
                    success: false,
                    message: "Missing order details" 
                });
            }
            
            // Try to find mobile number in different possible locations
            userMobile = data.user?.mobile || data.order?.userMobile || data.order?.user?.mobile;
            callingCode = data.user?.callingCode || data.order?.user?.callingCode;
            
            if (!userMobile) {
                console.error('❌ Missing mobile number for order notifications');
                return res.status(400).json({ 
                    success: false,
                    message: "Missing mobile number for order notifications" 
                });
            }
        }

        // Format WhatsApp number
        const whatsappNumber = formatWhatsappNumber(userMobile, callingCode);
        
        if (!whatsappNumber) {
            return res.status(400).json({
                success: false,
                message: "Invalid mobile number format"
            });
        }
        
        console.log(`👤 Processing ${event} event`);
        console.log('📱 Original mobile:', userMobile);
        console.log('📱 Formatted WhatsApp number:', whatsappNumber);

        // Get template configuration
        const templateConfig = eventTemplates[event];
        
        // Send WhatsApp message
        const watiResponse = await sendWhatsappMessage(
            whatsappNumber,
            templateConfig.templateName,
            templateConfig.parameters(data)
        );

        return res.status(200).json({ 
            success: true, 
            message: "WhatsApp message sent successfully!",
            event: event,
            response: watiResponse
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

app.post("/debug-webhook", (req, res) => {
    console.log('DEBUG - Headers:', req.headers);
    console.log('DEBUG - Body:', req.body);
    res.status(200).send('OK');
  });
// ==== ADDITIONAL UTILITY ENDPOINTS ====
// Test endpoint to check if server is running
app.get("/health", (req, res) => {
    res.status(200).json({
        success: true,
        message: "Server is running",
        version: "1.0.0",
        supportedEvents: Object.keys(eventTemplates)
    });
});

// Test endpoint to manually send a WhatsApp message
app.post("/test-wati", async (req, res) => {
    try {
        const { mobile, templateName, parameters } = req.body;
        
        if (!mobile || !templateName) {
            return res.status(400).json({
                success: false,
                message: "Missing required fields",
                required: ["mobile", "templateName"]
            });
        }
        
        const whatsappNumber = formatWhatsappNumber(mobile);
        const watiResponse = await sendWhatsappMessage(whatsappNumber, templateName, parameters || []);
        
        return res.status(200).json({
            success: true,
            message: "Test message sent successfully",
            response: watiResponse
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: "Failed to send test message",
            error: error.message
        });
    }
});

// List available templates
app.get("/templates", (req, res) => {
    const templates = Object.entries(eventTemplates).map(([event, config]) => ({
        event,
        templateName: config.templateName,
        parameters: config.parameters({ user: {}, order: {} }).map(p => p.name)
    }));
    
    res.status(200).json({
        success: true,
        templates
    });
});

// ==== ERROR HANDLING ====
// Catch 404 errors
app.use((req, res, next) => {
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

// Global error handler
app.use((err, req, res, next) => {
    console.error('❌ Unhandled error:', err);
    res.status(500).json({ 
        success: false,
        message: "Internal server error",
        error: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
    });
});

// ==== START SERVER ====
app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log('⚙️ Environment:', process.env.NODE_ENV || 'development');
    console.log('✅ All required environment variables are set');
    console.log('📨 Supported event types:', Object.keys(eventTemplates).join(', '));
});