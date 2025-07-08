const { formatDate, formatTimestamp } = require('../utils/helpers');

/**
 * Template configurations for different event types
 */
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
    templateName: "bo_order_placed2", 
    parameters: (data) => {
      console.log("Processing order data:", JSON.stringify(data, null, 2));

      const orderAmount = data.order?.amount || 0;

      // Format items list with a simpler format - replacing newlines with commas and spaces
      let itemsList = "";
      if (data.order?.items && data.order.items.length > 0) {
        data.order.items.forEach((item, index) => {
          // Get the item name - handle both data structures
          const itemName = item.name || (item._id ? item._id.name : "Item");
          const itemSize = item.size || "";
          const itemUnit = item.unit || "";
          const itemPrice = item.price || 0;
          const itemQty = item.qty || 1;

          // Add a comma and space between items instead of newline
          if (index > 0) {
            itemsList += ", ";
          }
          // Very simple format without special characters or newlines
          itemsList += `${itemQty} x ${itemName} - Rs${itemPrice}`;
        });
      } else {
        itemsList = "Your order items";
      }

      console.log("Formatted items list:", itemsList);

      // Simple date format
      const orderDate = formatDate(data.order?.createdAt);

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
        { name: "items_list", value: itemsList.trim() },
      ];
    },
  },
  
  "order.cancelled": {
    templateName: "bo_order_cancelled1",
    parameters: (data) => [
      { name: "order_id", value: data.order?.oid?.toString() || "" },
      { name: "customer_name", value: data.order?.user?.name || "Customer" },
      { name: "date", value: formatDate(data.order?.createdAt) },
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
        value: formatTimestamp(data.user?.profile?.lastLoginAt),
      },
    ],
  },

  "order.delivered": {
    templateName: "bo_order_delivered",
    parameters: (data) => [
      { name: "order_id", value: data.order?.oid?.toString() || "" },
      { name: "customer_name", value: data.order?.user?.name || "Customer" },
      { name: "date", value: formatDate(data.order?.createdAt) },
      { name: "amount", value: data.order?.amount?.toString() || "0" },
      { name: "delivery_date", value: formatDate(new Date()) }
    ],
  },
};

module.exports = eventTemplates;