// FitFlex Af — WhatsApp Notification Service — Server
// Standalone HTTP service that receives notification requests from the
// fitflex-functions backend and dispatches them via WhatsApp Business API.
//
// It also receives inbound WhatsApp messages (trainer-member chat) and
// delivery status callbacks, logging them for the backend to consume.
//
// Architecture:
//   fitflex-functions → POST /internal/notify → this service → WhatsApp API
//   WhatsApp provider → POST /webhooks/whatsapp-inbound → this service → log

import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { createProviderFromEnv } from './providers.mjs';
import { getTemplate, renderTemplate, listTemplates } from './templates.mjs';

// ─── Config ────────────────────────────────────────────────────────────────
const PORT = parseInt(process.env.PORT || '3002', 10);
const FITFLEX_API_BASE = process.env.FITFLEX_API_BASE || 'http://localhost:3000';
const INTERNAL_TOKEN = process.env.FITFLEX_INTERNAL_TOKEN || 'fitflex-internal-dev';
const ENABLE_WHATSAPP = process.env.ENABLE_WHATSAPP !== 'false';

const provider = createProviderFromEnv();

// ─── In-memory log (replace with persistent store in prod) ─────────────────
const messageLog = [];
const deliveryReceipts = [];
const inboundMessages = [];

function logMessage(entry) {
  messageLog.push(entry);
  if (messageLog.length > 1000) messageLog.shift(); // cap at 1000
}

// ─── HTTP helpers ──────────────────────────────────────────────────────────
function parseBody(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', chunk => data += chunk);
    req.on('end', () => {
      try { resolve(JSON.parse(data)); }
      catch { resolve({}); }
    });
  });
}

function verifyInternalToken(req) {
  const auth = req.headers['authorization'];
  if (!auth) return false;
  const token = auth.replace(/^Bearer\s+/i, '');
  return token === INTERNAL_TOKEN;
}

function json(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

// ─── Notification dispatch ─────────────────────────────────────────────────

// Core: send a WhatsApp message from a template key + params
async function sendNotification({ to, templateKey, language = 'en', params = {}, metadata = {} }) {
  if (!to) return { ok: false, error: 'recipient_required' };
  if (!templateKey) return { ok: false, error: 'template_key_required' };

  const template = getTemplate(templateKey, language);
  if (!template) return { ok: false, error: `unknown_template: ${templateKey}` };

  const renderedBody = renderTemplate(template, params);

  const result = await provider.send({
    to,
    templateName: template.name,
    language: template.language,
    params,
    body: renderedBody
  });

  const logEntry = {
    id: randomUUID(),
    timestamp: new Date().toISOString(),
    to,
    templateKey,
    templateName: template.name,
    category: template.category,
    language: template.language,
    body: renderedBody,
    params,
    provider: result.provider,
    messageId: result.messageId,
    ok: result.ok,
    error: result.error || null,
    cost: result.cost || 0,
    ...metadata
  };
  logMessage(logEntry);

  return { ...result, logId: logEntry.id };
}

// Send an OTP via WhatsApp (with optional SMS fallback)
async function sendOtp({ to, code, language = 'en' }) {
  const result = await provider.sendOtp({ to, code });

  const logEntry = {
    id: randomUUID(),
    timestamp: new Date().toISOString(),
    to,
    type: 'otp',
    provider: result.provider,
    messageId: result.messageId,
    ok: result.ok,
    error: result.error || null,
    cost: result.cost || 0
  };
  logMessage(logEntry);

  return { ...result, logId: logEntry.id };
}

// Broadcast: send the same template to multiple recipients
async function broadcast({ recipients, templateKey, language = 'en', params = {}, metadata = {} }) {
  if (!Array.isArray(recipients) || recipients.length === 0)
    return { ok: false, error: 'recipients_required' };

  const results = [];
  for (const to of recipients) {
    // Stagger sends to avoid rate limiting (50ms between messages)
    if (results.length > 0) await new Promise(r => setTimeout(r, 50));
    const r = await sendNotification({ to, templateKey, language, params, metadata });
    results.push({ to, ...r });
  }

  return {
    ok: true,
    sent: results.filter(r => r.ok).length,
    failed: results.filter(r => !r.ok).length,
    results
  };
}

// ─── HTTP Server ────────────────────────────────────────────────────────────
const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const path = url.pathname;
  const method = req.method;

  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (method === 'OPTIONS') return json(res, 204, {});

  // ─── Health ──────────────────────────────────────────────────────────────
  if (path === '/health' && method === 'GET') {
    return json(res, 200, {
      status: 'ok',
      service: 'fitflex-whatsapp',
      provider: provider.name,
      enabled: ENABLE_WHATSAPP,
      uptime: process.uptime()
    });
  }

  // ─── Internal: Send Notification (called by fitflex-functions) ─────────
  if (path === '/internal/notify' && method === 'POST') {
    if (!verifyInternalToken(req))
      return json(res, 401, { error: 'unauthorized' });

    const body = await parseBody(req);
    const result = await sendNotification(body);
    return json(res, result.ok ? 200 : 400, result);
  }

  // ─── Internal: Send OTP ─────────────────────────────────────────────────
  if (path === '/internal/otp' && method === 'POST') {
    if (!verifyInternalToken(req))
      return json(res, 401, { error: 'unauthorized' });

    const body = await parseBody(req);
    if (!body.to || !body.code)
      return json(res, 400, { error: 'to_and_code_required' });

    const result = await sendOtp(body);
    return json(res, result.ok ? 200 : 400, result);
  }

  // ─── Internal: Broadcast ────────────────────────────────────────────────
  if (path === '/internal/broadcast' && method === 'POST') {
    if (!verifyInternalToken(req))
      return json(res, 401, { error: 'unauthorized' });

    const body = await parseBody(req);
    const result = await broadcast(body);
    return json(res, 200, result);
  }

  // ─── WhatsApp Inbound Webhook (called by provider) ───────────────────────
  if (path === '/webhooks/whatsapp-inbound' && method === 'POST') {
    const body = await parseBody(req);

    // Log the inbound message (trainer-member chat, support queries)
    const entry = {
      id: randomUUID(),
      timestamp: new Date().toISOString(),
      from: body.From || body.from || null,
      to: body.To || body.to || null,
      text: body.Body || body.text || body.message?.text || null,
      raw: body
    };
    inboundMessages.push(entry);
    if (inboundMessages.length > 500) inboundMessages.shift();

    console.log(`[WhatsApp inbound] from=${entry.from}: ${entry.text?.slice(0, 80)}`);

    // In production, this would forward the message to fitflex-functions
    // for storage in the Conversations collection. For now, just acknowledge.
    return json(res, 200, { ok: true });
  }

  // ─── WhatsApp Status Webhook (delivery receipts) ─────────────────────────
  if (path === '/webhooks/whatsapp-status' && method === 'POST') {
    const body = await parseBody(req);

    const entry = {
      id: randomUUID(),
      timestamp: new Date().toISOString(),
      messageId: body.MessageSid || body.id || null,
      status: body.MessageStatus || body.status || null,
      from: body.From || body.from || null,
      to: body.To || body.to || null,
      raw: body
    };
    deliveryReceipts.push(entry);
    if (deliveryReceipts.length > 1000) deliveryReceipts.shift();

    return json(res, 200, { ok: true });
  }

  // ─── Management: List Templates ─────────────────────────────────────────
  if (path === '/templates' && method === 'GET') {
    return json(res, 200, { templates: listTemplates() });
  }

  // ─── Management: Test a Template ─────────────────────────────────────────
  if (path.startsWith('/templates/') && path.endsWith('/test') && method === 'POST') {
    if (!verifyInternalToken(req))
      return json(res, 401, { error: 'unauthorized' });

    const templateKey = path.split('/')[2];
    const body = await parseBody(req);
    if (!body.to)
      return json(res, 400, { error: 'to_required' });

    const result = await sendNotification({
      to: body.to,
      templateKey,
      language: body.language || 'en',
      params: body.params || {}
    });
    return json(res, result.ok ? 200 : 400, result);
  }

  // ─── Management: View Message Log ────────────────────────────────────────
  if (path === '/internal/log' && method === 'GET') {
    if (!verifyInternalToken(req))
      return json(res, 401, { error: 'unauthorized' });

    const limit = parseInt(url.searchParams.get('limit') || '50', 10);
    return json(res, 200, {
      messages: messageLog.slice(-limit).reverse(),
      total: messageLog.length
    });
  }

  // ─── 404 ────────────────────────────────────────────────────────────────
  return json(res, 404, { error: 'not_found', path });
});

server.listen(PORT, () => {
  console.log(`\n┌──────────────────────────────────────────────────────┐`);
  console.log(`│  FitFlex WhatsApp Service                            │`);
  console.log(`│  Port: ${PORT}                                          │`);
  console.log(`│  Provider: ${provider.name}                                       │`);
  console.log(`│  Enabled: ${ENABLE_WHATSAPP}                                       │`);
  console.log(`│  FitFlex API: ${FITFLEX_API_BASE}                       │`);
  console.log(`└──────────────────────────────────────────────────────┘\n`);
});

export { sendNotification, sendOtp, broadcast };
