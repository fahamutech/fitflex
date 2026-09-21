# FitFlex Af — WhatsApp Notification Service (Standalone)

Standalone microservice that handles all WhatsApp Business API messaging for the FitFlex platform. Calls the existing `fitflex-functions` backend via REST API to fetch data, then sends WhatsApp messages through a provider (Africa's Talking, Twilio, or Meta Direct).

## Architecture

```
fitflex-functions (existing backend)
        │
        │  1. FitFlex events happen (check-in, booking, payment, renewal)
        │     → Backend calls WhatsApp service webhook: POST /internal/notify
        │
        ▼
fitflex-whatsapp (this service)
        │
        │  2. Service resolves template + params
        │  3. Service calls WhatsApp provider API (Africa's Talking / Twilio)
        │
        ▼
WhatsApp Business API → Member's phone
```

## Endpoints

### Internal (called by fitflex-functions backend)

| Method | Path | Description |
|---|---|---|
| `POST` | `/internal/notify` | Fire-and-forget: send a notification by type + recipient |
| `POST` | `/internal/otp` | Send an OTP via WhatsApp |
| `POST` | `/internal/broadcast` | Send to multiple recipients (corporate reports, etc.) |

### WhatsApp Webhook (called by WhatsApp provider)

| Method | Path | Description |
|---|---|---|
| `POST` | `/webhooks/whatsapp-inbound` | Receive inbound WhatsApp messages (trainer-member chat, support) |
| `POST` | `/webhooks/whatsapp-status` | Delivery status callbacks (sent, delivered, read, failed) |

### Management

| Method | Path | Description |
|---|---|---|
| `GET` | `/health` | Liveness probe |
| `GET` | `/templates` | List all registered message templates + approval status |
| `POST` | `/templates/:name/test` | Send a test message to a specified number |

## Environment Variables

```env
# Server
PORT=3002

# FitFlex backend (for fetching user data, etc.)
FITFLEX_API_BASE=http://localhost:3000
FITFLEX_API_TOKEN=fitflex-internal-service-token

# WhatsApp Provider — choose ONE:
# Option A: Africa's Talking
AT_USERNAME=your_username
AT_API_KEY=your_api_key
AT_WHATSAPP_SENDER_ID=your_wa_business_number

# Option B: Twilio
TWILIO_ACCOUNT_SID=your_sid
TWILIO_AUTH_TOKEN=your_token
TWILIO_WHATSAPP_NUMBER=whatsapp:+15551234567

# Option C: Meta Direct
META_WHATSAPP_TOKEN=your_permanent_token
META_PHONE_NUMBER_ID=your_phone_number_id
META_BUSINESS_ID=your_business_id

# Feature flags
ENABLE_WHATSAPP=true   # false = log only (dev mode)
OTP_VIA_WHATSAPP=true  # send OTPs via WhatsApp instead of SMS
OTP_VIA_SMS_FALLBACK=true  # fall back to SMS if WhatsApp fails
```

## Message Templates

All templates must be pre-approved by WhatsApp/Meta before use in production.
In dev mode (`ENABLE_WHATSAPP=false`), messages are logged to console.

See `src/templates.mjs` for the full template registry.

## Run

```bash
# Install
npm install

# Dev mode (logs only, no real WhatsApp messages)
ENABLE_WHATSAPP=false npm run dev

# Production (sends real WhatsApp messages)
npm start
```
