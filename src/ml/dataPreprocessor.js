/**
 * Preprocesses data for machine learning models
 */
class DataPreprocessor {
    /**
     * Normalize data for ML processing
     * @param {Array} data - Raw data from storage
     * @param {Object} options - Preprocessing options
     * @returns {Array} Processed data ready for analysis
     */
    static normalizeData(data, options = {}) {
      if (!data || !Array.isArray(data) || data.length === 0) {
        console.warn('⚠️ Empty or invalid data provided for preprocessing');
        return [];
      }
  
      console.log(`🔄 Preprocessing ${data.length} records for ML analysis`);
      
      // Deep copy to avoid modifying original data
      const processedData = JSON.parse(JSON.stringify(data));
      
      // Handle numeric conversions
      processedData.forEach(item => {
        // Convert string numbers to actual numbers
        Object.keys(item).forEach(key => {
          if (typeof item[key] === 'string' && !isNaN(item[key]) && 
              key !== 'order_id' && key !== 'user_id' && key !== 'item_id' &&
              !key.includes('name') && !key.includes('code')) {
            item[key] = parseFloat(item[key]);
          }
          
          // Convert date strings to Date objects
          if (typeof item[key] === 'string' && 
              (key.includes('date') || key.includes('created_at') || key.includes('updated_at') || key.includes('timestamp'))) {
            item[key] = new Date(item[key]);
          }
        });
      });
      
      return processedData;
    }
    
    /**
     * Group data by a specific field
     * @param {Array} data - Normalized data
     * @param {String} groupBy - Field to group by
     * @returns {Object} Grouped data
     */
    static groupDataBy(data, groupBy) {
      if (!data || !Array.isArray(data) || data.length === 0) {
        return {};
      }
      
      const grouped = {};
      
      data.forEach(item => {
        const key = item[groupBy];
        if (!key) return;
        
        if (!grouped[key]) {
          grouped[key] = [];
        }
        
        grouped[key].push(item);
      });
      
      return grouped;
    }
    
    /**
     * Aggregate data for trend analysis
     * @param {Array} data - Normalized data
     * @param {String} timeField - Field containing time information
     * @param {String} valueField - Field to aggregate
     * @param {String} timeFrame - Time frame (day, week, month)
     * @returns {Array} Time series data
     */
    static createTimeSeries(data, timeField, valueField, timeFrame = 'day') {
      if (!data || !Array.isArray(data) || data.length === 0) {
        return [];
      }
      
      // Create a copy with proper date objects
      const processedData = this.normalizeData(data);
      
      // Group by time period
      const timeGroups = {};
      
      processedData.forEach(item => {
        if (!item[timeField]) return;
        
        let timeKey;
        const date = new Date(item[timeField]);
        
        // Format the date according to timeFrame
        switch(timeFrame.toLowerCase()) {
          case 'day':
            timeKey = date.toISOString().split('T')[0]; // YYYY-MM-DD
            break;
          case 'week':
            // Get the week number
            const weekNum = Math.ceil((date.getDate() + 
              new Date(date.getFullYear(), date.getMonth(), 1).getDay()) / 7);
            timeKey = `${date.getFullYear()}-W${weekNum}`;
            break;
          case 'month':
            timeKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
            break;
          default:
            timeKey = date.toISOString().split('T')[0];
        }
        
        if (!timeGroups[timeKey]) {
          timeGroups[timeKey] = {
            date: timeKey,
            count: 0,
            sum: 0,
            values: []
          };
        }
        
        const value = parseFloat(item[valueField]) || 0;
        timeGroups[timeKey].count++;
        timeGroups[timeKey].sum += value;
        timeGroups[timeKey].values.push(value);
      });
      
      // Convert to array and calculate averages
      const result = Object.values(timeGroups).map(group => ({
        date: group.date,
        count: group.count,
        sum: group.sum,
        average: group.sum / group.count,
        min: Math.min(...group.values),
        max: Math.max(...group.values)
      }));
      
      // Sort by date
      result.sort((a, b) => a.date.localeCompare(b.date));
      
      return result;
    }
    
    /**
     * Create feature vectors for product recommendations
     * @param {Array} orderItems - Order items data
     * @param {Array} orders - Orders data
     * @returns {Object} Feature vectors
     */
    static createProductFeatures(orderItems, orders) {
      if (!orderItems || !orders) return {};
      
      // Process the order data
      const processedOrders = this.normalizeData(orders);
      const orderMap = {};
      
      processedOrders.forEach(order => {
        orderMap[order.order_id] = order;
      });
      
      // Process the items data
      const processedItems = this.normalizeData(orderItems);
      
      // Build product feature vectors
      const productFeatures = {};
      const productCoCounts = {};
      
      // First pass: count product occurrences and create base features
      processedItems.forEach(item => {
        const productId = item.item_id;
        
        if (!productFeatures[productId]) {
          productFeatures[productId] = {
            id: productId,
            name: item.item_name,
            external_id: item.external_id,
            purchase_count: 0,
            total_quantity: 0,
            average_price: 0,
            price_sum: 0,
            orders: new Set(),
            common_purchases: {}
          };
        }
        
        productFeatures[productId].purchase_count++;
        productFeatures[productId].total_quantity += item.quantity || 1;
        productFeatures[productId].price_sum += item.price || 0;
        productFeatures[productId].orders.add(item.order_id);
      });
      
      // Second pass: find co-occurrence patterns
      processedItems.forEach(item => {
        const orderId = item.order_id;
        const productId = item.item_id;
        
        // Find all other products in the same order
        const orderProducts = processedItems
          .filter(otherItem => otherItem.order_id === orderId && otherItem.item_id !== productId)
          .map(otherItem => otherItem.item_id);
        
        // Count co-occurrences
        orderProducts.forEach(otherProductId => {
          if (!productFeatures[productId].common_purchases[otherProductId]) {
            productFeatures[productId].common_purchases[otherProductId] = 0;
          }
          productFeatures[productId].common_purchases[otherProductId]++;
        });
      });
      
      // Calculate averages and finalize features
      Object.values(productFeatures).forEach(product => {
        product.average_price = product.price_sum / product.purchase_count;
        product.orders = product.orders.size; // Convert Set to count
        
        // Sort common purchases by frequency
        const commonPurchases = Object.entries(product.common_purchases)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5) // Top 5 co-occurrences
          .map(([id, count]) => ({
            id,
            name: productFeatures[id]?.name || id,
            count
          }));
        
        product.common_purchases = commonPurchases;
      });
      
      return productFeatures;
    }
  }
  
  module.exports = DataPreprocessor;