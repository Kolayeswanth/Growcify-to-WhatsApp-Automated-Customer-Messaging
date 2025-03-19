const mongoose = require('mongoose');

const orderItemSchema = new mongoose.Schema({
  productId: String,
  name: String,
  externalID: Number,
  qty: Number,
  price: Number,
  marketPrice: Number,
  size: String,
  unit: String,
  gst: Number,
  isCombo: { type: Boolean, default: false }
});

const orderSchema = new mongoose.Schema({
  orderId: String,
  externalOrderId: Number,
  orderType: {
    type: String,
    enum: ['regular', 'pos', 'pickup-drop'],
    default: 'regular'
  },
  status: {
    type: String,
    enum: ['new', 'accepted', 'shipped', 'delivered', 'cancelled'],
    default: 'new'
  },
  paymentMethod: {
    type: String,
    enum: ['COD', 'Online', 'CASH', 'PAS', 'UPI', 'CARD'],
    default: 'COD'
  },
  deliveryMode: {
    type: String,
    enum: ['pick-up', 'home-delivery'],
    default: 'home-delivery'
  },
  amount: Number,
  discount: Number,
  deliveryCharge: Number,
  taxInAmount: Number,
  items: [orderItemSchema],
  user: {
    userId: String,
    name: String,
    mobile: String,
    email: String
  },
  rawPayload: Object,
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Order', orderSchema);