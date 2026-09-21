// FitFlex Af — WhatsApp Provider Adapters
// Each adapter implements the same interface:
//   send({ to, templateName, language, params, body }) → { ok, messageId, cost }
//   sendOtp({ to, code }) → { ok, messageId }
//
// In dev mode (ENABLE_WHATSAPP=false), all adapters log to console and
// return a simulated success response — no real WhatsApp messages are sent.

// ═══════════════════════════════════════════════════════════════════════════
// Dev Adapter — logs only, no real messages sent
// ═══════════════════════════════════════════════════════════════════════════
export function createDevAdapter() {
  let counter = 0;
  return {
    name: 'dev',
    async send({ to, templateName, language, params, body }) {
      counter++;
      const rendered = body || `${templateName}(${language}) → ${to}`;
      console.log(`\n[WhatsApp DEV] #${counter} → ${to}`);
      console.log(`  Template: ${templateName} (${language})`);
      if (params) console.log(`  Params: ${JSON.stringify(params)}`);
      console.log(`  Body: ${rendered}`);
      console.log('');
      return {
        ok: true,
        messageId: `dev_${Date.now()}_${counter}`,
        cost: 0,
        provider: 'dev'
      };
    },
    async sendOtp({ to, code }) {
      return this.send({ to, templateName: 'fitflex_otp_signup', language: 'en', body: `Your FitFlex code is ${code}` });
    }
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Africa's Talking Adapter
// REST API: https://api.africastalking.com/version1/messaging/whatsapp
// WhatsApp: https://africastalking.com/chat/whatsapp
//
// Pricing (Rest of Africa):
//   Marketing:      $0.032/msg
//   Utility:        $0.008/msg
//   Authentication: $0.008/msg
//   Service:        $0.002/msg
//   Monthly fee:    $50
//   Setup:          $85 (one-time)
// ═══════════════════════════════════════════════════════════════════════════
export function createAfricaTalkingAdapter({ username, apiKey, senderId }) {
  if (!username || !apiKey)
    throw new Error('Africa\'s Talking requires AT_USERNAME and AT_API_KEY');

  const BASE = 'https://chat-api.africastalking.com/whatsapp/message';

  async function send({ to, templateName, language, params, body }) {
    // Normalize phone number (strip + prefix for AT)
    const normalizedTo = to.replace(/^\+/, '');

    const payload = {
      username,
      senderId: senderId || 'FitFlex',
      recipient: normalizedTo,
      // For template messages, use the WhatsApp template format
      template: {
        name: templateName,
        language: { code: language || 'en' },
        components: params ? Object.entries(params).map(([key, value]) => ({
          type: 'body',
          parameters: [{ type: 'text', text: String(value) }]
        })) : []
      }
    };

    const response = await fetch(BASE, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apiKey': apiKey
      },
      body: JSON.stringify(payload)
    });

    const result = await response.json();

    if (!response.ok || result.status !== 'success') {
      return {
        ok: false,
        error: result.message || `AT API error: ${response.status}`,
        provider: 'africas_talking'
      };
    }

    // Cost estimate based on category (for internal tracking)
    const cost = estimateCost('utility', 'rest_of_africa');

    return {
      ok: true,
      messageId: result.data?.messageId || `at_${Date.now()}`,
      cost,
      provider: 'africas_talking'
    };
  }

  return {
    name: 'africas_talking',
    send,
    async sendOtp({ to, code }) {
      return send({
        to,
        templateName: 'fitflex_otp_signup',
        language: 'en',
        params: { code }
      });
    }
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Twilio Adapter
// REST API: https://api.twilio.com/2010-04-01/Accounts/{sid}/Messages.json
//
// Pricing:
//   Meta rate (Rest of Africa) + $0.005/msg Twilio markup
//   Marketing:      ~$0.0275/msg
//   Utility:        ~$0.009/msg
//   Authentication: ~$0.009/msg
//   Service:        ~$0.009/msg (free until Oct 2026, then $0.009)
// ═══════════════════════════════════════════════════════════════════════════
export function createTwilioAdapter({ accountSid, authToken, whatsappNumber }) {
  if (!accountSid || !authToken)
    throw new Error('Twilio requires TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN');

  const BASE = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
  const auth = Buffer.from(`${accountSid}:${authToken}`).toString('base64');

  async function send({ to, templateName, language, params, body }) {
    // Twilio WhatsApp uses the Content Template API
    const normalizedTo = to.startsWith('+') ? to : `+${to}`;
    const fromNumber = whatsappNumber || 'whatsapp:+15551234567';

    const payload = new URLSearchParams({
      To: `whatsapp:${normalizedTo}`,
      From: fromNumber,
      Body: body || `FitFlex notification: ${templateName}`
    });

    // If template with params, use ContentTemplate
    if (templateName && params) {
      payload.delete('Body');
      payload.set('ContentTemplate', templateName);
      // Twilio template variables are space-separated
      const templateVars = Object.values(params).join(' ');
      payload.set('TemplateVariables', JSON.stringify(params));
    }

    const response = await fetch(BASE, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: payload.toString()
    });

    const result = await response.json();

    if (!response.ok) {
      return {
        ok: false,
        error: result.message || `Twilio API error: ${response.status}`,
        provider: 'twilio'
      };
    }

    const cost = estimateCost('utility', 'rest_of_africa') + 0.005;

    return {
      ok: true,
      messageId: result.sid || `tw_${Date.now()}`,
      cost,
      provider: 'twilio'
    };
  }

  return {
    name: 'twilio',
    send,
    async sendOtp({ to, code }) {
      return send({
        to,
        templateName: 'fitflex_otp_signup',
        language: 'en',
        body: `Your FitFlex verification code is ${code}. This code expires in 5 minutes.`,
        params: { code }
      });
    }
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Meta Direct Adapter (Cloud API)
// REST API: https://graph.facebook.com/v21.0/{phone_number_id}/messages
//
// This is the cheapest option but requires your own webhook infrastructure
// and Meta Business verification.
//
// Pricing (Rest of Africa):
//   Marketing:      $0.0225/msg
//   Utility:        $0.0040/msg
//   Authentication: $0.0040/msg
//   Service:        $0.0040/msg (effective Oct 2026)
// ═══════════════════════════════════════════════════════════════════════════
export function createMetaAdapter({ token, phoneNumberId }) {
  if (!token || !phoneNumberId)
    throw new Error('Meta Direct requires META_WHATSAPP_TOKEN and META_PHONE_NUMBER_ID');

  const BASE = `https://graph.facebook.com/v21.0/${phoneNumberId}/messages`;

  async function send({ to, templateName, language, params, body }) {
    const normalizedTo = to.replace(/^\+/, '');

    let payload;
    if (templateName) {
      // Template message
      payload = {
        messaging_product: 'whatsapp',
        to: normalizedTo,
        type: 'template',
        template: {
          name: templateName,
          language: { code: language || 'en' },
          components: params ? Object.entries(params).map(([key, value], i) => ({
            type: 'body',
            parameters: [{ type: 'text', text: String(value) }]
          })) : []
        }
      };
    } else {
      // Free-form text message (only valid within 24h service window)
      payload = {
        messaging_product: 'whatsapp',
        to: normalizedTo,
        type: 'text',
        text: { body: body || 'FitFlex notification' }
      };
    }

    const response = await fetch(BASE, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const result = await response.json();

    if (!response.ok) {
      return {
        ok: false,
        error: result.error?.message || `Meta API error: ${response.status}`,
        provider: 'meta'
      };
    }

    const cost = estimateCost('utility', 'rest_of_africa');

    return {
      ok: true,
      messageId: result.messages?.[0]?.id || `meta_${Date.now()}`,
      cost,
      provider: 'meta'
    };
  }

  return {
    name: 'meta',
    send,
    async sendOtp({ to, code }) {
      return send({
        to,
        templateName: 'fitflex_otp_signup',
        language: 'en',
        params: { code }
      });
    }
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Cost Estimation Helper
// Used for internal tracking — actual cost depends on provider markup + volume tiers
// ═══════════════════════════════════════════════════════════════════════════
const META_RATES_REST_OF_AFRICA = {
  marketing: 0.0225,
  utility: 0.0040,
  authentication: 0.0040,
  service: 0.0040
};

function estimateCost(category, region = 'rest_of_africa') {
  const rates = META_RATES_REST_OF_AFRICA; // default region
  return rates[category] ?? rates.utility;
}

// ═══════════════════════════════════════════════════════════════════════════
// Factory: create the right adapter based on env vars
// ═══════════════════════════════════════════════════════════════════════════
export function createProviderFromEnv(env = process.env) {
  const enabled = env.ENABLE_WHATSAPP !== 'false';

  if (!enabled) {
    console.log('[WhatsApp] ENABLE_WHATSAPP=false — using dev adapter (log only)');
    return createDevAdapter();
  }

  // Try Africa's Talking first (recommended for East Africa)
  if (env.AT_USERNAME && env.AT_API_KEY) {
    console.log('[WhatsApp] Using Africa\'s Talking provider');
    return createAfricaTalkingAdapter({
      username: env.AT_USERNAME,
      apiKey: env.AT_API_KEY,
      senderId: env.AT_WHATSAPP_SENDER_ID
    });
  }

  // Fall back to Twilio
  if (env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN) {
    console.log('[WhatsApp] Using Twilio provider');
    return createTwilioAdapter({
      accountSid: env.TWILIO_ACCOUNT_SID,
      authToken: env.TWILIO_AUTH_TOKEN,
      whatsappNumber: env.TWILIO_WHATSAPP_NUMBER
    });
  }

  // Fall back to Meta Direct
  if (env.META_WHATSAPP_TOKEN && env.META_PHONE_NUMBER_ID) {
    console.log('[WhatsApp] Using Meta Direct provider');
    return createMetaAdapter({
      token: env.META_WHATSAPP_TOKEN,
      phoneNumberId: env.META_PHONE_NUMBER_ID
    });
  }

  console.warn('[WhatsApp] No provider configured — falling back to dev adapter (log only)');
  return createDevAdapter();
}
