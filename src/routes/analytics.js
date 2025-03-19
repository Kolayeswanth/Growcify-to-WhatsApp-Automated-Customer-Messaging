// src/routes/analytics.js
const express = require('express');
const router = express.Router();
const Order = require('../models/Order');
const User = require('../models/User');

// Get overall stats dashboard 
router.get('/dashboard', async (req, res) => {
  try {
    // Get counts
    const [
      totalOrders,
      totalUsers,
      totalEvents,
      totalRevenue,
      recentOrders
    ] = await Promise.all([
      Order.countDocuments(),
      User.countDocuments(),
      Order.aggregate([
        { $group: { _id: null, total: { $sum: "$amount" } } }
      ]),
      Order.find().sort({ createdAt: -1 }).limit(5)
    ]);

    res.status(200).json({
      success: true,
      data: {
        totalOrders,
        totalUsers,
        totalEvents,
        totalRevenue: totalRevenue.length ? totalRevenue[0].total : 0,
        recentOrders
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error fetching analytics",
      error: error.message
    });
  }
});

// Get order analytics
router.get('/orders', async (req, res) => {
  try {
    // Get order stats
    const [
      ordersByStatus,
      ordersByDeliveryMode,
      ordersByPaymentMethod,
      salesByDay
    ] = await Promise.all([
      Order.aggregate([
        { $group: { _id: "$status", count: { $sum: 1 } } }
      ]),
      Order.aggregate([
        { $group: { _id: "$deliveryMode", count: { $sum: 1 } } }
      ]),
      Order.aggregate([
        { $group: { _id: "$paymentMethod", count: { $sum: 1 } } }
      ]),
      Order.aggregate([
        {
          $group: {
            _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
            sales: { $sum: "$amount" },
            count: { $sum: 1 }
          }
        },
        { $sort: { _id: 1 } }
      ])
    ]);

    res.status(200).json({
      success: true,
      data: {
        ordersByStatus,
        ordersByDeliveryMode,
        ordersByPaymentMethod,
        salesByDay
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error fetching order analytics",
      error: error.message
    });
  }
});

// Get product analytics
router.get('/products', async (req, res) => {
  try {
    // Get top selling products
    const topProducts = await Order.aggregate([
      { $unwind: "$items" },
      {
        $group: {
          _id: {
            productId: "$items.productId",
            name: "$items.name"
          },
          totalSold: { $sum: "$items.qty" },
          totalRevenue: { $sum: { $multiply: ["$items.price", "$items.qty"] } },
          avgPrice: { $avg: "$items.price" },
          count: { $sum: 1 }
        }
      },
      { $sort: { totalRevenue: -1 } },
      { $limit: 10 }
    ]);

    res.status(200).json({
      success: true,
      data: {
        topProducts
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error fetching product analytics",
      error: error.message
    });
  }
});

// Get user analytics
router.get('/users', async (req, res) => {
  try {
    // Get users stats
    const [
      newUsersByDay,
      userOrderStats
    ] = await Promise.all([
      User.aggregate([
        {
          $group: {
            _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
            count: { $sum: 1 }
          }
        },
        { $sort: { _id: 1 } }
      ]),
      Order.aggregate([
        {
          $group: {
            _id: "$user.userId",
            userName: { $first: "$user.name" },
            userEmail: { $first: "$user.email" },
            userMobile: { $first: "$user.mobile" },
            orderCount: { $sum: 1 },
            totalSpent: { $sum: "$amount" },
            avgOrderValue: { $avg: "$amount" }
          }
        },
        { $sort: { totalSpent: -1 } },
        { $limit: 10 }
      ])
    ]);

    res.status(200).json({
      success: true,
      data: {
        newUsersByDay,
        topCustomers: userOrderStats
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error fetching user analytics",
      error: error.message
    });
  }
});

module.exports = router;