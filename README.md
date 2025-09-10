Growcify → WhatsApp (WATI) Automated Customer Messaging

A Node.js service that listens to Growcify-style ecommerce webhooks and sends real-time, personalized WhatsApp template messages via WATI. It also stores orders and users in MongoDB and exposes analytics endpoints.

## What it does

- Receives webhook events at `POST /growcify-webhook`
- Maps each event to a WATI-approved WhatsApp template and fills dynamic parameters
- Sends the message using WATI's API
- Persists orders and users to MongoDB for reporting
- Provides basic analytics APIs (dashboard, orders, products, users)

## Supported events → templates

- user.signup → template: `bo_signup1`
- user.signin → template: `bo_signin2`
- order.placed → template: `bo_order_placed2`
- order.cancelled → template: `bo_order_cancelled1`
- order.delivered → template: `bo_order_delivered`

Parameter names are exactly as used by WATI in `src/templates/templateConfig.js`.

## Requirements

- Node.js 14+ and npm
- MongoDB (local or hosted)
- WATI business account (tenant + API key)

## Environment variables (.env)

These are validated on startup:

- PORT=5000 (optional)
- TENANT_ID=your_wati_tenant_id
- WATI_API_KEY=your_wati_api_key
- WEBHOOK_SECRET=your_webhook_secret  (required, reserved for request verification)
- MONGO_URI=mongodb://localhost:27017/webhook-to-wati

Note: The service sends via `https://live-mt-server.wati.io/{TENANT_ID}/api/v1/sendTemplateMessage`.

## Run locally

1) Install dependencies
2) Create `.env` as above
3) Start the server

On Windows PowerShell:

```powershell
npm install
npm start
```

Dev mode with auto-reload:

```powershell
npm run dev
```

## API endpoints

- GET /health → server status
- POST /growcify-webhook → main webhook receiver
- GET /test-webhook/:event → sample payload for an event (`user.signup`, `user.signin`, `order.placed`, `order.cancelled`, `order.delivered`)
- GET /test-wati/:template/:phone → send a test WhatsApp message using a template name to a phone

Analytics:
- GET /api/analytics/dashboard
- GET /api/analytics/orders
- GET /api/analytics/products
- GET /api/analytics/users

## Payload shape (examples)

user.signup:

```json
{
  "event": "user.signup",
  "data": {
    "user": {
      "_id": "user_123",
      "name": "Test User",
      "mobile": "9876543210",
      "email": "test@example.com",
      "callingCode": "91",
      "referralCode": "ABCD12"
    }
  }
}
```

order.placed:

```json
{
  "event": "order.placed",
  "data": {
    "order": {
      "_id": "order_123",
      "oid": 123456,
      "amount": 170,
      "paymentMethod": "COD",
      "deliveryMode": "home-delivery",
      "items": [
        { "_id": { "_id": "prod_1", "name": "Carrot", "externalID": 5005 }, "qty": 1, "price": 50, "unit": "kg" },
        { "_id": { "_id": "prod_2", "name": "Apple",  "externalID": 5025 }, "qty": 2, "price": 60, "unit": "kg" }
      ],
      "user": { "_id": "user_123", "name": "Test User", "mobile": "9876543210", "email": "test@example.com" }
    }
  }
}
```

## Template parameters (by event)

Defined in `src/templates/templateConfig.js`:

- user.signup: name, mobile, referral_code
- user.signin: name, mobile, last_login
- order.placed: order_id, customer_name, date, amount, payment_method, items_list
- order.cancelled: order_id, customer_name, date, cancellation_reason, refund_status
- order.delivered: order_id, customer_name, date, amount, delivery_date

## Data storage

- Orders saved in MongoDB (`src/models/Order.js`)
- Users saved in MongoDB (`src/models/User.js`)

## Phone number formatting

Outbound WhatsApp numbers are normalized to Indian format: it strips a leading `+` and prefixes `91` if missing (see `src/utils/helpers.js`). Ensure input numbers are valid.

## Notes & limitations

- `WEBHOOK_SECRET` is required and reserved for request verification, but signature validation is not yet implemented in `src/services/webhook.js`.
- Create and approve the exact template names in your WATI dashboard before sending.
- The service uses WATI Multi-tenant base URL hardcoded in config.

## Project structure

```
src/
  config/        # env + MongoDB connection
  models/        # Mongoose models (Order, User)
  routes/        # Analytics endpoints
  services/      # Webhook processor + WATI client
  templates/     # Event→template mapping and parameters
  utils/         # Helpers (phone, date formatting)
server.js        # Express app bootstrap
package.json     # scripts and deps
```

## Acknowledgements

- WATI API
