const eventTemplates = require('../templates/templateConfig');
const watiService = require('./watiService');
const Order = require('../models/Order');
const User = require('../models/User');

/**
 * Store order data in database
 * @param {object} orderData - Order data from webhook
 * @returns {Promise} Stored order
 */
const storeOrderData = async (orderData) => {
  try {
    // Transform order items
    const items = orderData.items?.map(item => ({
      productId: item._id?._id || item._id,
      name: item._id?.name || item.name,
      externalID: item._id?.externalID || item.externalID,
      qty: item.qty,
      price: item.price,
      marketPrice: item.marketPrice,
      size: item.size,
      unit: item.unit,
      gst: item.gst || 0,
      isCombo: item.isCombo || false
    })) || [];

    // Create new order document
    const order = new Order({
      orderId: orderData._id,
      externalOrderId: orderData.oid,
      orderType: orderData.type || 'regular',
      status: orderData.status || 'new',
      paymentMethod: orderData.paymentMethod || 'COD',
      deliveryMode: orderData.deliveryMode || 'home-delivery',
      amount: orderData.amount || 0,
      discount: orderData.discount || 0,
      deliveryCharge: orderData.deliveryCharge || 0,
      taxInAmount: orderData.taxInAmount || 0,
      items: items,
      user: {
        userId: orderData.user?._id,
        name: orderData.user?.name,
        mobile: orderData.user?.mobile,
        email: orderData.user?.email
      },
      rawPayload: orderData
    });

    await order.save();
    console.log(`✅ Order #${orderData.oid} stored in database`);
    return order;
  } catch (error) {
    console.error(`❌ Error storing order data: ${error.message}`);
    // Continue processing but log error
    return null;
  }
};

/**
 * Store user data in database
 * @param {object} userData - User data from webhook
 * @returns {Promise} Stored user
 */
const storeUserData = async (userData) => {
  try {
    // Check if user already exists
    let user = await User.findOne({ userId: userData._id });
    
    if (user) {
      // Update existing user
      user.name = userData.name;
      user.mobile = userData.mobile;
      user.email = userData.email;
      user.callingCode = userData.callingCode;
      user.referralCode = userData.referralCode;
      user.lastActivity = new Date();
      user.rawPayload = userData;
    } else {
      // Create new user
      user = new User({
        userId: userData._id,
        name: userData.name,
        mobile: userData.mobile,
        email: userData.email,
        callingCode: userData.callingCode,
        referralCode: userData.referralCode,
        rawPayload: userData,
        lastActivity: new Date()
      });
    }

    await user.save();
    console.log(`✅ User ${userData.name} (${userData.mobile}) stored in database`);
    return user;
  } catch (error) {
    console.error(`❌ Error storing user data: ${error.message}`);
    // Continue processing but log error
    return null; 
  }
};

/**
 * Process webhook event, store in database, and send WhatsApp notification
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
  
  // Store data in database based on event type
  if (event.startsWith("order.")) {
    await storeOrderData(data.order);
  } else if (event.startsWith("user.")) {
    await storeUserData(data.user);
  }
  
  // Check if order type is 'pos' - skip WhatsApp notification for POS orders
  if (event.startsWith("order.") && data.order?.type === 'pos') {
    console.log("🏪 Order type is 'pos' - skipping WhatsApp notification");
    return {
      success: true,
      message: "Order processed and stored in database. WhatsApp notification skipped for POS orders.",
      event: event,
      orderType: 'pos',
      skipped: true
    };
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
  
  console.log(`👤 Processing ${event} event for WhatsApp notification`);
  
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
    message: "Event processed and WhatsApp message sent successfully!",
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
          _id: "user_" + Date.now(),
          name: "Test User", 
          mobile: "9876543210",
          email: "test@example.com",
          callingCode: "91",
          referralCode: "TEST123"
        } 
      } 
    };
  } else {
    return {
      event,
      data: {
        order: {
          _id: "order_" + Date.now(),
          oid: "123456",
          type: "regular", // Change to "pos" to test POS order (no WhatsApp message)
          status: "new",
          paymentMethod: "COD",
          deliveryMode: "home-delivery",
          amount: 170,
          items: [
            {
              _id: {
                _id: "prod_1",
                name: "Carrot",
                externalID: 5005
              },
              qty: 1,
              price: 50,
              marketPrice: 60,
              size: "1",
              unit: "kg",
              gst: 0
            },
            {
              _id: {
                _id: "prod_2",
                name: "Apple",
                externalID: 5025
              },
              qty: 2,
              price: 60,
              marketPrice: 75,
              size: "1",
              unit: "kg",
              gst: 0
            }
          ],
          user: { 
            _id: "user_123",
            name: "Test User", 
            mobile: "9876543210",
            email: "test@example.com"
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