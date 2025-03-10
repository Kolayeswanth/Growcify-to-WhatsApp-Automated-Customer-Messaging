/**
 * Format WhatsApp number to ensure it has the correct format
 * @param {string} mobileNumber - The mobile number to format
 * @returns {string} Properly formatted WhatsApp number
 */
const formatWhatsAppNumber = (mobileNumber) => {
    if (!mobileNumber) return "";
    
    let formattedNumber = mobileNumber;
    
    // Remove the + sign if it exists
    if (formattedNumber.startsWith("+")) {
      formattedNumber = formattedNumber.substring(1);
    }
    
    // Add 91 country code if not present
    if (!formattedNumber.startsWith("91")) {
      formattedNumber = `91${formattedNumber}`;
    }
    
    return formattedNumber;
  };
  
  /**
   * Format date to a localized string
   * @param {string|Date} date - The date to format
   * @returns {string} Formatted date string
   */
  const formatDate = (date) => {
    if (!date) return "";
    
    try {
      return new Date(date).toLocaleDateString("en-IN");
    } catch (error) {
      console.error("Error formatting date:", error);
      return "";
    }
  };
  
  /**
   * Format timestamp to a localized date-time string
   * @param {string|Date} timestamp - The timestamp to format
   * @returns {string} Formatted date-time string
   */
  const formatTimestamp = (timestamp) => {
    if (!timestamp) return "";
    
    try {
      return new Date(timestamp).toLocaleString("en-IN", {
        timeZone: "Asia/Kolkata",
        hour12: true,
      });
    } catch (error) {
      console.error("Error formatting timestamp:", error);
      return "";
    }
  };
  
  module.exports = {
    formatWhatsAppNumber,
    formatDate,
    formatTimestamp
  };