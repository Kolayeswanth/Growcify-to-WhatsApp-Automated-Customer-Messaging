const DataPreprocessor = require('./dataPreprocessor');

/**
 * Analyzes trends in the stored data
 */
class TrendAnalyzer {
  /**
   * Analyze product sales trends
   * @param {Array} items - Order items data
   * @param {Array} orders - Orders data
   * @param {Object} options - Analysis options
   * @returns {Object} Trend analysis results
   */
  static analyzeProductTrends(items, orders, options = {}) {
    console.log('📊 Analyzing product sales trends...');
    
    const normalizedItems = DataPreprocessor.normalizeData(items);
    const normalizedOrders = DataPreprocessor.normalizeData(orders);
    
    if (!normalizedItems.length || !normalizedOrders.length) {
      return { error: 'Insufficient data for analysis' };
    }
    
    // Group items by product
    const itemsByProduct = DataPreprocessor.groupDataBy(normalizedItems, 'item_id');
    
    // Prepare results object
    const trends = {
      topProducts: [],
      growingProducts: [],
      decliningProducts: [],
      priceTrends: [],
      seasonalProducts: []
    };
    
    // Calculate top products by total quantity
    const productTotals = Object.entries(itemsByProduct).map(([itemId, items]) => {
      const totalQuantity = items.reduce((sum, item) => sum + (parseFloat(item.quantity) || 1), 0);
      const totalRevenue = items.reduce((sum, item) => sum + ((parseFloat(item.price) || 0) * (parseFloat(item.quantity) || 1)), 0);
      const itemName = items[0].item_name;
      
      return {
        id: itemId,
        name: itemName,
        totalQuantity,
        totalRevenue,
        averagePrice: totalRevenue / totalQuantity,
        orderCount: new Set(items.map(item => item.order_id)).size
      };
    });
    
    // Sort and limit to top 10
    trends.topProducts = productTotals
      .sort((a, b) => b.totalQuantity - a.totalQuantity)
      .slice(0, 10);
      
    // Time series analysis for each product
    Object.entries(itemsByProduct).forEach(([itemId, items]) => {
      // Only analyze products with enough data points
      if (items.length < 5) return;
      
      const itemName = items[0].item_name;
      
      // Create time series by month
      const monthlySales = DataPreprocessor.createTimeSeries(
        items,
        'date',
        'quantity',
        'month'
      );
      
      // Need at least 3 months of data for trend analysis
      if (monthlySales.length < 3) return;
      
      // Calculate growth trend (simple linear regression)
      const n = monthlySales.length;
      const xValues = Array.from({length: n}, (_, i) => i);
      const yValues = monthlySales.map(m => m.sum);
      
      // Calculate slope using least squares method
      const xMean = xValues.reduce((sum, x) => sum + x, 0) / n;
      const yMean = yValues.reduce((sum, y) => sum + y, 0) / n;
      
      const numerator = xValues.reduce((sum, x, i) => sum + (x - xMean) * (yValues[i] - yMean), 0);
      const denominator = xValues.reduce((sum, x) => sum + Math.pow(x - xMean, 2), 0);
      
      const slope = denominator !== 0 ? numerator / denominator : 0;
      const intercept = yMean - slope * xMean;
      
      // Calculate price trends
      const priceTimeSeries = DataPreprocessor.createTimeSeries(
        items,
        'date',
        'price',
        'month'
      );
      
      // Calculate growth rate as percentage
      const growthRate = monthlySales.length > 1 ? 
        ((monthlySales[monthlySales.length - 1].sum / monthlySales[0].sum) - 1) * 100 : 0;
      
      // Determine trend direction
      if (slope > 0 && growthRate > 10) {
        trends.growingProducts.push({
          id: itemId,
          name: itemName,
          growthRate: growthRate.toFixed(2),
          monthlySales
        });
      } else if (slope < 0 && growthRate < -10) {
        trends.decliningProducts.push({
          id: itemId,
          name: itemName,
          growthRate: growthRate.toFixed(2),
          monthlySales
        });
      }
      
      // Add price trend if there are significant changes
      if (priceTimeSeries.length > 1) {
        const firstPrice = priceTimeSeries[0].average;
        const lastPrice = priceTimeSeries[priceTimeSeries.length - 1].average;
        const priceDiff = ((lastPrice / firstPrice) - 1) * 100;
        
        if (Math.abs(priceDiff) > 5) {
          trends.priceTrends.push({
            id: itemId,
            name: itemName,
            priceChangePercent: priceDiff.toFixed(2),
            priceTimeSeries
          });
        }
      }
    });
    
    // Sort results
    trends.growingProducts.sort((a, b) => parseFloat(b.growthRate) - parseFloat(a.growthRate));
    trends.decliningProducts.sort((a, b) => parseFloat(a.growthRate) - parseFloat(b.growthRate));
    trends.priceTrends.sort((a, b) => Math.abs(parseFloat(b.priceChangePercent)) - Math.abs(parseFloat(a.priceChangePercent)));
    
    // Limit results
    trends.growingProducts = trends.growingProducts.slice(0, 5);
    trends.decliningProducts = trends.decliningProducts.slice(0, 5);
    trends.priceTrends = trends.priceTrends.slice(0, 5);
    
    return trends;
  }
  
  /**
   * Analyze customer purchasing patterns
   * @param {Array} orders - Orders data
   * @param {Array} users - Users data
   * @returns {Object} Customer analysis results
   */
  static analyzeCustomerPatterns(orders, users, options = {}) {
    console.log('👥 Analyzing customer purchase patterns...');
    
    const normalizedOrders = DataPreprocessor.normalizeData(orders);
    const normalizedUsers = DataPreprocessor.normalizeData(users);
    
    if (!normalizedOrders.length) {
      return { error: 'Insufficient order data for analysis' };
    }
    
    // Group orders by user
    const ordersByUser = DataPreprocessor.groupDataBy(normalizedOrders, 'user_id');
    
    // Prepare results object
    const analysis = {
      topCustomers: [],
      customerRetention: {},
      purchaseFrequency: {},
      deliveryPreferences: {},
      paymentPreferences: {}
    };
    
    // Calculate customer metrics
    const customerMetrics = Object.entries(ordersByUser).map(([userId, userOrders]) => {
      const customerName = userOrders[0].user_name;
      const totalSpent = userOrders.reduce((sum, order) => sum + (parseFloat(order.amount) || 0), 0);
      const orderDates = userOrders.map(order => new Date(order.date)).sort((a, b) => a - b);
      
      // Calculate days between first and last order
      const daysBetweenFirstAndLast = orderDates.length > 1 ?
        Math.round((orderDates[orderDates.length - 1] - orderDates[0]) / (1000 * 60 * 60 * 24)) : 0;
      
      // Calculate average days between orders
      let avgDaysBetweenOrders = 0;
      if (orderDates.length > 1) {
        let totalDays = 0;
        for (let i = 1; i < orderDates.length; i++) {
          totalDays += Math.round((orderDates[i] - orderDates[i-1]) / (1000 * 60 * 60 * 24));
        }
        avgDaysBetweenOrders = totalDays / (orderDates.length - 1);
      }
      
      // Count delivery preferences
      const deliveryModes = {};
      userOrders.forEach(order => {
        const mode = order.delivery_mode || 'unknown';
        deliveryModes[mode] = (deliveryModes[mode] || 0) + 1;
      });
      
      // Count payment methods
      const paymentMethods = {};
      userOrders.forEach(order => {
        const method = order.payment_method || 'unknown';
        paymentMethods[method] = (paymentMethods[method] || 0) + 1;
      });
      
      return {
        id: userId,
        name: customerName,
        orderCount: userOrders.length,
        totalSpent,
        averageOrderValue: totalSpent / userOrders.length,
        firstOrder: orderDates[0],
        lastOrder: orderDates[orderDates.length - 1],
        daysSinceLastOrder: Math.round((new Date() - orderDates[orderDates.length - 1]) / (1000 * 60 * 60 * 24)),
        customerAgeInDays: daysBetweenFirstAndLast,
        avgDaysBetweenOrders,
        preferredDeliveryMode: Object.entries(deliveryModes).sort((a, b) => b[1] - a[1])[0]?.[0] || 'unknown',
        preferredPaymentMethod: Object.entries(paymentMethods).sort((a, b) => b[1] - a[1])[0]?.[0] || 'unknown'
      };
    });
    
    // Sort and limit to top customers by total spent
    analysis.topCustomers = customerMetrics
      .sort((a, b) => b.totalSpent - a.totalSpent)
      .slice(0, 10);
    
    // Calculate delivery mode preferences
    const deliveryModeCount = {};
    normalizedOrders.forEach(order => {
      const mode = order.delivery_mode || 'unknown';
      deliveryModeCount[mode] = (deliveryModeCount[mode] || 0) + 1;
    });
    
    analysis.deliveryPreferences = Object.entries(deliveryModeCount)
      .map(([mode, count]) => ({
        mode,
        count,
        percentage: (count / normalizedOrders.length * 100).toFixed(2)
      }))
      .sort((a, b) => b.count - a.count);
    
    // Calculate payment method preferences
    const paymentMethodCount = {};
    normalizedOrders.forEach(order => {
      const method = order.payment_method || 'unknown';
      paymentMethodCount[method] = (paymentMethodCount[method] || 0) + 1;
    });
    
    analysis.paymentPreferences = Object.entries(paymentMethodCount)
      .map(([method, count]) => ({
        method,
        count,
        percentage: (count / normalizedOrders.length * 100).toFixed(2)
      }))
      .sort((a, b) => b.count - a.count);
    
    // Customer retention analysis
    // Group by month of first purchase
    const customersByFirstPurchaseMonth = {};
    customerMetrics.forEach(customer => {
      const date = new Date(customer.firstOrder);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      
      if (!customersByFirstPurchaseMonth[monthKey]) {
        customersByFirstPurchaseMonth[monthKey] = [];
      }
      
      customersByFirstPurchaseMonth[monthKey].push(customer);
    });
    
    // Calculate retention by cohort
    analysis.customerRetention = Object.entries(customersByFirstPurchaseMonth)
      .map(([month, customers]) => {
        // Count customers with more than one order
        const repeatCustomers = customers.filter(c => c.orderCount > 1).length;
        
        return {
          cohort: month,
          newCustomers: customers.length,
          repeatCustomers,
          retentionRate: (repeatCustomers / customers.length * 100).toFixed(2)
        };
      })
      .sort((a, b) => a.cohort.localeCompare(b.cohort));
    
    // Purchase frequency analysis
    const frequencyDistribution = {
      '1 order': 0,
      '2-3 orders': 0,
      '4-6 orders': 0,
      '7-10 orders': 0,
      '10+ orders': 0
    };
    
    customerMetrics.forEach(customer => {
      if (customer.orderCount === 1) {
        frequencyDistribution['1 order']++;
      } else if (customer.orderCount <= 3) {
        frequencyDistribution['2-3 orders']++;
      } else if (customer.orderCount <= 6) {
        frequencyDistribution['4-6 orders']++;
      } else if (customer.orderCount <= 10) {
        frequencyDistribution['7-10 orders']++;
      } else {
        frequencyDistribution['10+ orders']++;
      }
    });
    
    analysis.purchaseFrequency = Object.entries(frequencyDistribution)
      .map(([frequency, count]) => ({
        frequency,
        count,
        percentage: (count / customerMetrics.length * 100).toFixed(2)
      }));
    
    return analysis;
  }
  
  /**
   * Generate product recommendations
   * @param {Object} productFeatures - Product feature vectors
   * @param {Array} recentOrders - Recent order data
   * @param {String} userId - User ID to generate recommendations for
   * @returns {Array} Recommended products
   */
  static generateRecommendations(productFeatures, recentOrders, userId = null) {
    console.log('🔍 Generating product recommendations...');
    
    if (!productFeatures || Object.keys(productFeatures).length === 0) {
      return { error: 'Insufficient product data for recommendations' };
    }
    
    // If userId is provided, generate personalized recommendations
    if (userId) {
      // Find user's recent orders
      const userOrders = recentOrders.filter(order => order.user_id === userId);
      
      if (userOrders.length === 0) {
        // Fall back to general recommendations if no user history
        return this.generatePopularRecommendations(productFeatures);
      }
      
      // Find products the user has purchased
      const userProducts = new Set();
      userOrders.forEach(order => {
        // This assumes there's a relationship to items that we can query
        // In a real implementation, you'd need to load the items for these orders
        // For now, we'll assume the order has an 'items' array
        if (order.items) {
          order.items.forEach(item => {
            userProducts.add(item.item_id || item._id);
          });
        }
      });
      
      // Find related products based on common purchases
      const recommendations = [];
      userProducts.forEach(productId => {
        if (productFeatures[productId] && productFeatures[productId].common_purchases) {
          productFeatures[productId].common_purchases.forEach(relatedProduct => {
            if (!userProducts.has(relatedProduct.id)) {
              // Add to recommendations if not already purchased
              recommendations.push({
                id: relatedProduct.id,
                name: relatedProduct.name,
                score: relatedProduct.count,
                reason: `Frequently bought with ${productFeatures[productId].name}`
              });
            }
          });
        }
      });
      
      // Sort and deduplicate recommendations
      const uniqueRecommendations = [];
      const seen = new Set();
      
      recommendations
        .sort((a, b) => b.score - a.score)
        .forEach(rec => {
          if (!seen.has(rec.id)) {
            seen.add(rec.id);
            uniqueRecommendations.push(rec);
          }
        });
      
      return uniqueRecommendations.slice(0, 5);
    } else {
      // Generate general recommendations
      return this.generatePopularRecommendations(productFeatures);
    }
  }
  
  /**
   * Generate popular product recommendations
   * @param {Object} productFeatures - Product feature vectors
   * @returns {Array} Popular product recommendations
   */
  static generatePopularRecommendations(productFeatures) {
    // Convert to array for sorting
    const products = Object.values(productFeatures);
    
    // Sort by purchase count (popularity)
    const popularProducts = products
      .sort((a, b) => b.purchase_count - a.purchase_count)
      .slice(0, 5)
      .map(product => ({
        id: product.id,
        name: product.name,
        score: product.purchase_count,
        reason: 'Popular product'
      }));
    
    return popularProducts;
  }
}

module.exports = TrendAnalyzer;