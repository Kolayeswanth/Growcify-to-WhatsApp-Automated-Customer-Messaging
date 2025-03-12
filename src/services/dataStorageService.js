const { GoogleSpreadsheet } = require('google-spreadsheet');
const fs = require('fs');
const path = require('path');

/**
 * Service to store webhook data in Google Sheets for ML purposes
 */
class DataStorageService {
  constructor(config) {
    this.config = config;
    this.doc = null;
    this.sheets = {
      orders: null,
      users: null,
      items: null
    };
    this.initialized = false;
  }

  /**
   * Initialize connection to Google Sheets
   */
  async initialize() {
    try {
      // Create a new document using service account credentials
      this.doc = new GoogleSpreadsheet(this.config.spreadsheetId);
      
      // Authenticate with Google
      await this.doc.useServiceAccountAuth({
        client_email: this.config.client_email,
        private_key: this.config.private_key.replace(/\\n/g, '\n')
      });
      
      await this.doc.loadInfo();
      console.log(`📊 Connected to spreadsheet: ${this.doc.title}`);

      // Get or create sheets for different data types
      this.sheets.orders = this.doc.sheetsByTitle['orders'] || 
                         await this.createSheet('orders', this.getOrdersHeaders());
      
      this.sheets.users = this.doc.sheetsByTitle['users'] || 
                        await this.createSheet('users', this.getUsersHeaders());
      
      this.sheets.items = this.doc.sheetsByTitle['items'] || 
                        await this.createSheet('items', this.getItemsHeaders());
      
      this.initialized = true;
      return true;
    } catch (error) {
      console.error('❌ Failed to initialize Google Sheets:', error);
      throw error;
    }
  }

  /**
   * Create a new sheet with headers
   */
  async createSheet(title, headers) {
    const sheet = await this.doc.addSheet({ title, headerValues: headers });
    console.log(`📋 Created sheet: ${title}`);
    return sheet;
  }

  /**
   * Store order data from webhook
   */
  async storeOrderData(orderData) {
    if (!this.initialized) await this.initialize();
    
    try {
      const order = orderData.data.order;
      
      // Format the order data for storage
      const orderRow = {
        order_id: order._id,
        order_number: order.oid,
        date: new Date(order.createdAt).toISOString(),
        user_id: order.user._id,
        user_name: order.user.name,
        user_mobile: order.user.mobile,
        amount: order.amount,
        delivery_charge: order.deliveryCharge,
        discount: order.discount,
        payment_method: order.paymentMethod,
        delivery_mode: order.deliveryMode,
        status: order.status,
        type: order.type,
        item_count: order.items.length,
        timestamp: new Date().toISOString()
      };
      
      // Add the order row
      await this.sheets.orders.addRow(orderRow);
      
      // Store individual items
      if (order.items && order.items.length > 0) {
        const itemRows = order.items.map(item => ({
          order_id: order._id,
          order_number: order.oid,
          item_id: item._id._id || item._id,
          item_name: item._id.name,
          external_id: item._id.externalID,
          quantity: item.qty,
          price: item.price,
          market_price: item.marketPrice,
          size: item.size,
          unit: item.unit,
          is_combo: item.isCombo ? 'true' : 'false',
          date: new Date(order.createdAt).toISOString()
        }));
        
        await this.sheets.items.addRows(itemRows);
      }
      
      console.log(`✅ Stored order #${order.oid} data successfully`);
      return true;
    } catch (error) {
      console.error('❌ Failed to store order data:', error);
      throw error;
    }
  }

  /**
   * Store user data from webhook
   */
  async storeUserData(userData) {
    if (!this.initialized) await this.initialize();
    
    try {
      const user = userData.data.user;
      
      // Format the user data for storage
      const userRow = {
        user_id: user._id,
        name: user.name,
        mobile: user.mobile,
        email: user.email,
        calling_code: user.callingCode,
        referral_code: user.referralCode,
        created_at: new Date(user.createdAt).toISOString(),
        updated_at: new Date(user.updatedAt).toISOString(),
        event_type: userData.event,
        timestamp: new Date().toISOString()
      };
      
      // Add the user row
      await this.sheets.users.addRow(userRow);
      
      console.log(`✅ Stored user data for ${user.name} successfully`);
      return true;
    } catch (error) {
      console.error('❌ Failed to store user data:', error);
      throw error;
    }
  }

  /**
   * Define headers for orders sheet
   */
  getOrdersHeaders() {
    return [
      'order_id', 'order_number', 'date', 'user_id', 'user_name', 'user_mobile',
      'amount', 'delivery_charge', 'discount', 'payment_method', 'delivery_mode',
      'status', 'type', 'item_count', 'timestamp'
    ];
  }

  /**
   * Define headers for users sheet
   */
  getUsersHeaders() {
    return [
      'user_id', 'name', 'mobile', 'email', 'calling_code', 'referral_code',
      'created_at', 'updated_at', 'event_type', 'timestamp'
    ];
  }

  /**
   * Define headers for items sheet
   */
  getItemsHeaders() {
    return [
      'order_id', 'order_number', 'item_id', 'item_name', 'external_id',
      'quantity', 'price', 'market_price', 'size', 'unit', 'is_combo', 'date'
    ];
  }

  /**
   * Export data for ML processing
   */
  async exportDataForML(type, dateRange) {
    if (!this.initialized) await this.initialize();
    
    try {
      const sheet = this.sheets[type];
      if (!sheet) {
        throw new Error(`Invalid sheet type: ${type}`);
      }
      
      await sheet.loadCells();
      const rows = await sheet.getRows();
      
      // Filter by date range if provided
      let filteredRows = rows;
      if (dateRange) {
        const startDate = new Date(dateRange.start);
        const endDate = new Date(dateRange.end);
        
        filteredRows = rows.filter(row => {
          const rowDate = new Date(row.date || row.created_at);
          return rowDate >= startDate && rowDate <= endDate;
        });
      }
      
      // Convert to JSON
      const data = filteredRows.map(row => {
        const obj = {};
        sheet.headerValues.forEach(header => {
          obj[header] = row[header];
        });
        return obj;
      });
      
      return data;
    } catch (error) {
      console.error(`❌ Failed to export ${type} data for ML:`, error);
      throw error;
    }
  }
}

module.exports = DataStorageService;