const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  userId: String,
  name: String,
  mobile: String,
  email: String,
  callingCode: String,
  referralCode: String,
  rawPayload: Object,
  createdAt: {
    type: Date,
    default: Date.now
  },
  lastActivity: Date
});

module.exports = mongoose.model('User', userSchema);