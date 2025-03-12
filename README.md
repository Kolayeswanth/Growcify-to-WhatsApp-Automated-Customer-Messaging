Webhook to WATI Integration

A Node.js application that processes webhook events from an e-commerce platform and sends personalized WhatsApp notifications to customers through the WATI API. This integration enables real-time customer communication for order updates, user account events, and promotional messages.

## Features

- **Webhook Endpoint**: Receives webhook events from your e-commerce platform
- **Event Processing**: Handles various types of events (orders, user accounts)
- **WATI Integration**: Sends customized WhatsApp template messages based on event type
- **Templating System**: Configurable templates with dynamic parameters
- **Error Handling**: Robust error handling and logging

## Supported Events

This integration handles the following webhook events:

- **User Events**
  - `user.signup`: When a new user registers
  - `user.signin`: When a user logs in

- **Order Events**
  - `order.placed`: When a customer places an order
  - `order.delivered`: When an order is delivered
  - `order.cancelled`: When an order is cancelled

## Getting Started

### Prerequisites

- Node.js (v14 or later)
- npm or yarn
- A WATI Business account
- Access to your e-commerce platform's webhook settings

### Installation

1. Clone the repository:
```bash
git clone https://github.com/kolayeswanth/whatsapp-web-hook.git
cd webhook-to-wati
```

2. Install dependencies:
```bash
npm install
```

3. Create a `.env` file with your configuration:
```
PORT=3000
WATI_ACCESS_TOKEN=your_wati_access_token
TENANT_ID=your_wati_tenant_id
WEBHOOK_SECRET=your_webhook_secret
```

4. Start the server:
```bash
npm start
```

### WATI Template Setup

Before using this integration, you need to create templates in your WATI dashboard:

1. Go to your WATI dashboard
2. Navigate to Templates section
3. Create templates with names matching those in the configuration:
   - user_signup
   - user_signin
   - order_placed
   - order_delivered
   - order_cancelled
4. Use the placeholders shown in the template examples (e.g., {{name}}, {{order_id}})

### Webhook Configuration

Configure your e-commerce platform to send webhook events to:
```
https://your-domain.com/webhook
```
## API Endpoints

### Health Check
```
GET /health
```
Verifies the server is running.

### Test Webhook Event
```
GET /test-webhook/:event
```
Get sample payload for a specific event type.

### Test WATI Integration
```
GET /test-wati/:template/:phone
```
Send a test message to a specific phone number using a template.

### Main Webhook Endpoint
```
POST /growcify-webhook
```
Receives webhook events and processes them.

## Template Examples

### User Signup Template
```
🎉 *Welcome to the Family, {{name}}!* 🎉

Thank you for joining us! Your account has been successfully created.

*Your Details:*
📱 Mobile: {{mobile}}
📧 Email: {{email}}
🎁 Referral Code: {{referral_code}}

Use your referral code to invite friends and earn exciting rewards!
```

### Order Placed Template
```
🛒 *Order Confirmed!* #{{order_id}}

Dear {{customer_name}},

Thank you for placing your order with us. We're processing it right away!

*Order Details:*
📆 Date: {{date}}
🧾 Order ID: #{{order_id}}
💰 Total Amount: ₹{{amount}}
💵 Payment Method: {{payment_method}}
🚚 Delivery Mode: {{delivery_mode}}
💸 You Saved: ₹{{savings}}

*Your Items:*
{{items_list}}

We will notify you once your order is accepted. Thank you for shopping with us!
```

## Project Structure

```
webhook-to-wati/
├── src/
│   ├── config/
│   │   └── index.js         # Configuration settings
│   ├── services/
│   │   ├── webhook.js       # Webhook processing logic
│   │   └── watiService.js   # WATI API integration
│   ├── templates/
│   │   └── templateConfig.js # Template configurations
│   └── utils/
│       └── helpers.js       # Utility functions
├── .env                     # Environment variables
├── .gitignore
├── package.json
├── README.md
└── server.js               # Entry point
```

## Customization

### Adding New Event Types

To add a new event type:

1. Add a new template configuration in `src/templates/templateConfig.js`
2. Create the corresponding template in your WATI dashboard
3. Update the webhook handler in `src/services/webhook.js` if necessary

### Modifying Templates

To modify an existing template:

1. Update the template in your WATI dashboard
2. Update the corresponding parameters in the template configuration

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgments

- [WATI API Documentation](https://docs.wati.io/)
- [Express.js](https://expressjs.com/)
- [Axios](https://axios-http.com/)
