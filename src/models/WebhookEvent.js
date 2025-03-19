const mongoose = require('mongoose');

const webhookEventSchema = new mongoose.Schema({
  eventType: {
    type: String,
    required: true,
    index: true
  },
  payload: {
    type: Object,
    required: true
  },
  processed: {
    type: Boolean,
    default: true
  },
  error: String,
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('WebhookEvent', webhookEventSchema);