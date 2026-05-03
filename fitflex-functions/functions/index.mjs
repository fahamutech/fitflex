// FitFlex Af — public REST surface (bfast-functions).
// All business logic delegated to ../src/services/* (clean architecture + DI).

import { randomUUID } from 'node:crypto';
import { collection } from '../src/infra/json-store.mjs';
import { ensureSeed } from '../src/infra/seed.mjs';
import { sign as signJwt, requireAuth } from '../src/auth/jwt.mjs';
import { verifyFirebaseIdToken } from '../src/auth/firebase.mjs';
import { issue as issueQr, verify as verifyQr } from '../src/auth/qr-token.mjs';
import { createCheckInService } from '../src/services/check-in-service.mjs';
import { PASS_TIERS } from '../src/shared/constants.mjs';
import { calculatePayout } from '../src/shared/payout-engine.mjs';

ensureSeed();

const created = new Date().toISOString();
const users = collection('users');
const gyms = collection('gyms');
const subscriptions = collection('subscriptions');
const checkins = collection('checkins');
const otps = collection('otps');
const auditLog = collection('audit_log');
const paymentRequests = collection('payment_requests');

const checkInService = createCheckInService({ users, gyms, subscriptions, checkins });
const configuredAdminEmails = new Set(
  (process.env.FITFLEX_ADMIN_EMAILS || 'mama27j@gmail.com')
    .split(',')
    .map(email => email.trim().toLowerCase())
    .filter(Boolean)
);

function isConfiguredAdminEmail(email) {
  return Boolean(email && configuredAdminEmails.has(String(email).toLowerCase()));
}

function normalizeGymPayload(body = {}, prior = {}) {
  const images = Array.isArray(body.images)
    ? body.images
    : String(body.images || prior.images?.join('\n') || '')
      .split(/\n|,/)
      .map(url => url.trim())
      .filter(Boolean);
  const lat = body.coordinates?.lat ?? body.lat ?? prior.coordinates?.lat ?? null;
  const lng = body.coordinates?.lng ?? body.lng ?? prior.coordinates?.lng ?? null;
  const venueType = body.venueType ?? prior.venueType ?? 'physical';
  const accessMode = body.accessMode ?? prior.accessMode ?? 'paid_visit';
  const isOnlineFree = venueType === 'online' || accessMode === 'free_online';
  return {
    id: body.id || prior.id,
    status: body.status || prior.status || 'active',
    commissionRate: Number(body.commissionRate ?? prior.commissionRate ?? 12),
    name: body.name ?? prior.name,
    tier: isOnlineFree ? 'online' : (body.tier ?? prior.tier ?? 'standard'),
    location: body.location ?? prior.location,
    perVisitRate: isOnlineFree ? 0 : Number(body.perVisitRate ?? prior.perVisitRate ?? 0),
    accessMode: isOnlineFree ? 'free_online' : accessMode,
    venueType,
    coordinates: {
      lat: lat === null || lat === '' ? null : Number(lat),
      lng: lng === null || lng === '' ? null : Number(lng)
    },
    images,
    operatingHours: body.operatingHours ?? prior.operatingHours ?? null
  };
}

function latestMemberSubscription(memberId) {
  return subscriptions
    .filter(s => s.memberId === memberId)
    .sort((a, b) => +new Date(b.startedAt) - +new Date(a.startedAt))[0] || null;
}

function applyPaymentStatusToSubscription(request, status, reference) {
  const subStatus = {
    approved: 'active',
    rejected: 'payment_rejected',
    cancelled: 'payment_cancelled',
    pending: 'payment_pending'
  }[status];
  if (!subStatus) return;
  subscriptions.update(s => s.id === request.subscriptionId, {
    status: subStatus,
    paymentRef: status === 'approved' ? (reference || `ADMIN_${request.id}`) : null
  });
}

// ───────────────────────────────────────── Health ─────────────────────────────────────────
export const health = {
  created, method: 'get', path: '/health',
  description: 'Liveness probe',
  responseSample: { status: 'ok' },
  onRequest: (_, res) => res.status(200).json({ status: 'ok', service: 'fitflex-functions' })
};

// ───────────────────────────────────────── Auth: OTP ──────────────────────────────────────
export const authRequestOtp = {
  created, method: 'post', path: '/auth/otp/request',
  description: 'Request a phone OTP. Returns the OTP in dev mode (replace with SMS in prod).',
  requestSample: { phone: '+255712345678', userType: 'member' },
  responseSample: { ok: true, devOtp: '123456' },
  onRequest: (req, res) => {
    const { phone, userType = 'member' } = req.body || {};
    if (!phone) return res.status(400).json({ error: 'phone_required' });
    if (!['member', 'trainer', 'gym_operator', 'admin'].includes(userType))
      return res.status(400).json({ error: 'invalid_userType' });
    const code = String(Math.floor(100000 + Math.random() * 900000));
    otps.upsert(o => o.phone === phone, { phone, code, userType, expiresAt: Date.now() + 5 * 60_000 });
    // ⚠️ DEV ONLY: return the code. Wire to SMS provider before prod.
    res.json({ ok: true, devOtp: code, message: 'OTP sent (dev mode returns code in payload)' });
  }
};

export const authVerifyOtp = {
  created, method: 'post', path: '/auth/otp/verify',
  description: 'Verify OTP, create user if new, return JWT.',
  requestSample: { phone: '+255712345678', code: '123456' },
  responseSample: { token: 'jwt...', user: { id: 'usr_x', userType: 'member' } },
  onRequest: (req, res) => {
    const { phone, code } = req.body || {};
    const otp = otps.find(o => o.phone === phone);
    if (!otp || otp.code !== code) return res.status(401).json({ error: 'invalid_otp' });
    if (Date.now() > otp.expiresAt) return res.status(401).json({ error: 'otp_expired' });

    let user = users.find(u => u.phone === phone);
    if (!user) {
      user = {
        id: `usr_${randomUUID().slice(0, 8)}`,
        phone, userType: otp.userType, createdAt: new Date().toISOString()
      };
      users.insert(user);
    }
    otps.update(o => o.phone === phone, { code: null });
    const token = signJwt({ sub: user.id, userType: user.userType, phone: user.phone });
    res.json({ token, user });
  }
};

export const authLogin = {
  created, method: 'post', path: '/auth/login',
  description: 'Email+password login (operators & admins). Demo only — replace with bcrypt.',
  requestSample: { email: 'operator@iron-paradise.tz', password: 'operator123' },
  responseSample: { token: 'jwt...', user: { id: 'usr_op_1', userType: 'gym_operator' } },
  onRequest: (req, res) => {
    const { email, password } = req.body || {};
    const user = users.find(u => u.email === email);
    if (!user || user.passwordHash !== `demo:${password}`)
      return res.status(401).json({ error: 'invalid_credentials' });
    const token = signJwt({ sub: user.id, userType: user.userType, gymId: user.gymId });
    res.json({ token, user });
  }
};

export const authFirebaseSession = {
  created, method: 'post', path: '/auth/firebase/session',
  description: 'Exchange a Firebase ID token for a FitFlex session. Firebase is identity only; FitFlex stores roles.',
  requestSample: { idToken: 'firebase-id-token', requestedRole: 'member' },
  responseSample: { token: 'jwt...', user: { id: 'usr_x', userType: 'member' } },
  onRequest: async (req, res) => {
    const { idToken, requestedRole = 'member' } = req.body || {};
    const fb = await verifyFirebaseIdToken(idToken);
    if (!fb) return res.status(401).json({ error: 'invalid_firebase_token' });

    const allowedSelfRoles = ['member', 'trainer'];
    const selfRole = allowedSelfRoles.includes(requestedRole) ? requestedRole : 'member';
    const isAdminEmail = isConfiguredAdminEmail(fb.email);
    let user = users.find(u => u.firebaseUid === fb.uid) || (fb.email ? users.find(u => u.email === fb.email) : null);

    if (!user) {
      user = {
        id: `usr_${randomUUID().slice(0, 8)}`,
        firebaseUid: fb.uid,
        email: fb.email,
        displayName: fb.name,
        photoUrl: fb.picture,
        userType: isAdminEmail ? 'admin' : selfRole,
        createdAt: new Date().toISOString()
      };
      users.insert(user);
    } else {
      const patch = {
        firebaseUid: isAdminEmail ? fb.uid : (user.firebaseUid || fb.uid),
        email: user.email || fb.email,
        displayName: fb.name || user.displayName,
        photoUrl: fb.picture || user.photoUrl,
        ...(isAdminEmail ? { userType: 'admin' } : {})
      };
      user = users.update(u => u.id === user.id, patch);
    }

    const token = signJwt({
      sub: user.id,
      userType: user.userType,
      email: user.email,
      gymId: user.gymId
    });
    res.json({ token, user });
  }
};

// ───────────────────────────────────────── Gyms ───────────────────────────────────────────
export const listGyms = {
  created, method: 'get', path: '/gyms',
  description: 'Public list of active gyms.',
  responseSample: [{ id: 'gym_001', name: 'Iron Paradise Masaki', tier: 'standard' }],
  onRequest: (_, res) => res.json(gyms.filter(g => g.status === 'active'))
};

export const getGym = {
  created, method: 'get', path: '/gyms/:id',
  description: 'Get a single gym',
  onRequest: (req, res) => {
    const g = gyms.find(x => x.id === req.params.id);
    if (!g) return res.status(404).json({ error: 'not_found' });
    res.json(g);
  }
};

export const adminUpsertGym = {
  created, method: 'post', path: '/admin/gyms',
  description: 'Admin: create or update a gym (tier set here only — audit logged).',
  requestSample: { id: 'gym_006', name: 'New Gym', tier: 'midtier', location: 'DSM', perVisitRate: 8000, commissionRate: 12 },
  onGuard: requireAuth('admin'),
  onRequest: (req, res) => {
    const body = req.body || {};
    if (!body.name || !body.tier) return res.status(400).json({ error: 'name_and_tier_required' });
    const id = body.id || `gym_${randomUUID().slice(0, 6)}`;
    const prior = gyms.find(g => g.id === id);
    const row = normalizeGymPayload({ ...body, id }, prior);
    gyms.upsert(g => g.id === id, row);
    auditLog.insert({
      id: randomUUID(), at: new Date().toISOString(),
      actor: req.user?.sub, action: prior ? 'gym_updated' : 'gym_created',
      target: id, before: prior ?? null, after: row
    });
    res.json(row);
  }
};

export const adminDeleteGym = {
  created, method: 'delete', path: '/admin/gyms/:id',
  description: 'Admin: delete a gym from the pilot catalogue.',
  onGuard: requireAuth('admin'),
  onRequest: (req, res) => {
    const prior = gyms.find(g => g.id === req.params.id);
    if (!prior) return res.status(404).json({ error: 'not_found' });
    const assignedOperator = users.find(u => u.userType === 'gym_operator' && u.gymId === prior.id);
    const hasCheckins = checkins.find(c => c.gymId === prior.id);
    if (assignedOperator || hasCheckins) return res.status(409).json({ error: 'gym_has_activity_or_operator' });
    const removed = gyms.remove(g => g.id === prior.id);
    auditLog.insert({
      id: randomUUID(), at: new Date().toISOString(),
      actor: req.user?.sub, action: 'gym_deleted',
      target: prior.id, before: prior, after: null
    });
    res.json({ ok: true, gym: removed });
  }
};

// ───────────────────────────────────────── Subscriptions ──────────────────────────────────
export const listPasses = {
  created, method: 'get', path: '/passes',
  description: 'Platform Pass tier catalogue (v2.0 prices).',
  onRequest: (_, res) => res.json(
    Object.entries(PASS_TIERS).map(([id, cfg]) => ({
      id, ...cfg,
      visitCap: Number.isFinite(cfg.visitCap) ? cfg.visitCap : null
    }))
  )
};

export const subscribe = {
  created, method: 'post', path: '/me/subscribe',
  description: 'Create a pilot Platform Pass payment request. Admin approval activates the subscription.',
  requestSample: { tier: 'pro', type: 'platform_pass' },
  onGuard: requireAuth('member'),
  onRequest: (req, res) => {
    const { tier, type = 'platform_pass', homeGymId } = req.body || {};
    if (type === 'platform_pass' && !PASS_TIERS[tier])
      return res.status(400).json({ error: 'invalid_tier' });
    const now = new Date();
    const renewsAt = new Date(+now + 30 * 86_400_000);
    const amountTzs = PASS_TIERS[tier]?.price;
    const isFreeOnline = amountTzs === 0 && PASS_TIERS[tier]?.accessMode === 'free_online';
    const sub = {
      id: `sub_${randomUUID().slice(0, 8)}`,
      memberId: req.user.sub,
      type, tier: type === 'platform_pass' ? tier : null,
      status: isFreeOnline ? 'active' : 'payment_pending',
      startedAt: now.toISOString(),
      cycleStartedAt: now.toISOString(),
      renewsAt: renewsAt.toISOString(),
      expiresAt: renewsAt.toISOString(),
      homeGymId: homeGymId ?? null,
      paymentRef: isFreeOnline ? 'FREE_ONLINE' : null,
      pilotPayment: true
    };
    subscriptions.insert(sub);
    if (isFreeOnline) {
      return res.status(201).json({ subscription: sub, paymentRequest: null });
    }
    const paymentRequest = paymentRequests.insert({
      id: `pay_${randomUUID().slice(0, 8)}`,
      memberId: req.user.sub,
      subscriptionId: sub.id,
      tier,
      amountTzs,
      status: 'pending',
      provider: 'admin_approved',
      reference: null,
      requestedAt: now.toISOString(),
      decidedAt: null,
      decidedBy: null,
      note: null
    });
    res.status(202).json({ subscription: sub, paymentRequest });
  }
};

export const me = {
  created, method: 'get', path: '/me',
  description: 'Authenticated user profile + active subscription + visit counter.',
  onGuard: requireAuth(),
  onRequest: (req, res) => {
    const user = users.find(u => u.id === req.user.sub);
    const subs = subscriptions.filter(s => s.memberId === req.user.sub);
    const sub  = subs
      .filter(s => ['active', 'expired', 'suspended'].includes(s.status))
      .sort((a, b) => +new Date(b.startedAt) - +new Date(a.startedAt))[0] || null;
    const pendingPayment = paymentRequests
      .filter(p => p.memberId === req.user.sub && p.status === 'pending')
      .sort((a, b) => +new Date(b.requestedAt) - +new Date(a.requestedAt))[0] || null;
    let visitsUsed = 0, visitCap = null;
    if (sub) {
      const since = +new Date(sub.cycleStartedAt);
      visitsUsed = checkins.filter(c => c.memberId === user.id && c.visitConsumed && +new Date(c.timestamp) >= since).length;
      const cap = PASS_TIERS[sub.tier]?.visitCap;
      visitCap = Number.isFinite(cap) ? cap : null;
    }
    res.json({ user, subscription: sub, pendingPayment, visitsUsed, visitCap });
  }
};

// ───────────────────────────────────────── QR Check-in ────────────────────────────────────
export const myQr = {
  created, method: 'get', path: '/me/qr',
  description: 'Issue a 60-second rotating QR token for the authenticated member.',
  onGuard: requireAuth('member'),
  onRequest: (req, res) => {
    const active = subscriptions
      .filter(s => s.memberId === req.user.sub && s.status === 'active')
      .sort((a, b) => +new Date(b.startedAt) - +new Date(a.startedAt))[0];
    if (!active) return res.status(403).json({ error: 'active_subscription_required' });
    res.json(issueQr(req.user.sub));
  }
};

export const operatorCheckIn = {
  created, method: 'post', path: '/operator/checkins',
  description: 'Operator scans a member QR and triggers BL-012 validation + logging.',
  requestSample: { qrToken: 'usr_x.123456.signature' },
  onGuard: requireAuth('gym_operator'),
  onRequest: (req, res) => {
    const { qrToken } = req.body || {};
    const claim = verifyQr(qrToken);
    if (!claim) return res.status(401).json({ ok: false, failure: 'invalid_or_expired_qr' });
    const operator = users.find(u => u.id === req.user.sub);
    if (!operator?.gymId) return res.status(400).json({ error: 'operator_not_assigned_to_gym' });

    const result = checkInService.perform({
      memberId: claim.userId,
      gymId: operator.gymId,
      method: 'gym_scanned'
    });
    if (!result.ok) return res.status(409).json(result);
    res.json(result);
  }
};

export const operatorRecentCheckIns = {
  created, method: 'get', path: '/operator/checkins',
  description: 'List of recent check-ins at the operator gym.',
  onGuard: requireAuth('gym_operator'),
  onRequest: (req, res) => {
    const operator = users.find(u => u.id === req.user.sub);
    const list = checkins
      .filter(c => c.gymId === operator?.gymId)
      .sort((a, b) => +new Date(b.timestamp) - +new Date(a.timestamp))
      .slice(0, 50)
      .map(c => {
        const m = users.find(u => u.id === c.memberId);
        return { ...c, memberPhone: m?.phone ?? null, memberEmail: m?.email ?? null };
      });
    res.json(list);
  }
};

export const operatorDashboard = {
  created, method: 'get', path: '/operator/dashboard',
  description: 'Basic analytics for the operator gym (today visits, period total, current band).',
  onGuard: requireAuth('gym_operator'),
  onRequest: (req, res) => {
    const operator = users.find(u => u.id === req.user.sub);
    const gym = gyms.find(g => g.id === operator?.gymId);
    if (!gym) return res.status(404).json({ error: 'gym_not_found' });

    const now = new Date();
    const startOfDay = new Date(now); startOfDay.setUTCHours(0, 0, 0, 0);
    const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const todayCount = checkins.filter(c => c.gymId === gym.id && +new Date(c.timestamp) >= +startOfDay).length;
    const monthVisits = checkins.filter(c => c.gymId === gym.id && +new Date(c.timestamp) >= +startOfMonth && c.subscriptionType === 'platform_pass').length;
    const payout = monthVisits >= 500
      ? { band: 5, note: 'Negotiate flat fee' }
      : calculatePayout({ visitCount: monthVisits, gymTier: gym.tier, negotiatedPerVisitRate: gym.perVisitRate });

    res.json({ gym, todayCount, monthVisits, payout });
  }
};

// ───────────────────────────────────────── Admin portal ──────────────────────────────────
export const adminListGyms = {
  created, method: 'get', path: '/admin/gyms',
  description: 'Admin: list gyms.',
  onGuard: requireAuth('admin'),
  onRequest: (_, res) => res.json(gyms.all())
};

export const adminPaymentRequests = {
  created, method: 'get', path: '/admin/payment-requests',
  description: 'Admin: list pilot payment requests.',
  onGuard: requireAuth('admin'),
  onRequest: (_, res) => {
    const list = paymentRequests.all()
      .sort((a, b) => +new Date(b.requestedAt) - +new Date(a.requestedAt))
      .map(p => ({
        ...p,
        member: users.find(u => u.id === p.memberId) || null,
        subscription: subscriptions.find(s => s.id === p.subscriptionId) || null
      }));
    res.json(list);
  }
};

export const adminDecidePaymentRequest = {
  created, method: 'post', path: '/admin/payment-requests/:id/decision',
  description: 'Admin: approve or reject a pilot payment request. Approval activates the subscription.',
  onGuard: requireAuth('admin'),
  onRequest: (req, res) => {
    const { decision, reference, note } = req.body || {};
    if (!['approve', 'reject'].includes(decision)) return res.status(400).json({ error: 'invalid_decision' });
    const request = paymentRequests.find(p => p.id === req.params.id);
    if (!request) return res.status(404).json({ error: 'not_found' });
    if (request.status !== 'pending') return res.status(409).json({ error: 'already_decided' });

    const now = new Date().toISOString();
    const status = decision === 'approve' ? 'approved' : 'rejected';
    const updated = paymentRequests.update(p => p.id === request.id, {
      status,
      reference: reference || request.reference,
      note: note || null,
      decidedAt: now,
      decidedBy: req.user.sub
    });
    const subStatus = decision === 'approve' ? 'active' : 'payment_rejected';
    subscriptions.update(s => s.id === request.subscriptionId, {
      status: subStatus,
      paymentRef: reference || `ADMIN_${request.id}`
    });
    auditLog.insert({
      id: randomUUID(),
      at: now,
      actor: req.user.sub,
      action: `payment_${status}`,
      target: request.id,
      before: request,
      after: updated
    });
    res.json(updated);
  }
};

export const adminUpdatePaymentRequest = {
  created, method: 'post', path: '/admin/payment-requests/:id',
  description: 'Admin: update pilot payment request status, reference, and note.',
  onGuard: requireAuth('admin'),
  onRequest: (req, res) => {
    const { status, reference, note } = req.body || {};
    const allowed = ['pending', 'approved', 'rejected', 'cancelled'];
    if (status && !allowed.includes(status)) return res.status(400).json({ error: 'invalid_status' });
    const request = paymentRequests.find(p => p.id === req.params.id);
    if (!request) return res.status(404).json({ error: 'not_found' });
    const nextStatus = status || request.status;
    const now = new Date().toISOString();
    const updated = paymentRequests.update(p => p.id === request.id, {
      status: nextStatus,
      reference: reference ?? request.reference,
      note: note ?? request.note ?? null,
      decidedAt: nextStatus === 'pending' ? null : (request.decidedAt || now),
      decidedBy: nextStatus === 'pending' ? null : req.user.sub
    });
    applyPaymentStatusToSubscription(request, nextStatus, reference ?? request.reference);
    auditLog.insert({
      id: randomUUID(), at: now,
      actor: req.user.sub,
      action: 'payment_updated',
      target: request.id,
      before: request,
      after: updated
    });
    res.json(updated);
  }
};

export const adminMembers = {
  created, method: 'get', path: '/admin/members',
  description: 'Admin: members and their latest subscription/payment state.',
  onGuard: requireAuth('admin'),
  onRequest: (_, res) => {
    const list = users.filter(u => u.userType === 'member').map(u => ({
      ...u,
      accountStatus: u.accountStatus || 'active',
      subscription: latestMemberSubscription(u.id),
      pendingPayment: paymentRequests
        .filter(p => p.memberId === u.id && p.status === 'pending')
        .sort((a, b) => +new Date(b.requestedAt) - +new Date(a.requestedAt))[0] || null
    }));
    res.json(list);
  }
};

export const adminSetMemberStatus = {
  created, method: 'post', path: '/admin/members/:id/status',
  description: 'Admin: activate or suspend a member and latest subscription.',
  onGuard: requireAuth('admin'),
  onRequest: (req, res) => {
    const { status } = req.body || {};
    if (!['active', 'suspended'].includes(status)) return res.status(400).json({ error: 'invalid_status' });
    const member = users.find(u => u.id === req.params.id && u.userType === 'member');
    if (!member) return res.status(404).json({ error: 'not_found' });
    const before = { ...member, subscription: latestMemberSubscription(member.id) };
    const updatedUser = users.update(u => u.id === member.id, { accountStatus: status });
    const sub = latestMemberSubscription(member.id);
    let updatedSub = sub;
    if (sub) {
      updatedSub = subscriptions.update(s => s.id === sub.id, {
        status: status === 'suspended' ? 'suspended' : (sub.status === 'suspended' ? 'active' : sub.status)
      });
    }
    const after = { ...updatedUser, subscription: updatedSub };
    auditLog.insert({
      id: randomUUID(), at: new Date().toISOString(),
      actor: req.user.sub,
      action: `member_${status}`,
      target: member.id,
      before,
      after
    });
    res.json(after);
  }
};

// ───────────────────────────────────────── Renewal scheduler (stub) ───────────────────────
export const renewalNotifier = {
  created, rule: '0 9 * * *', // every day 09:00 UTC
  description: 'Send T-3 / T-1 / T0 renewal notifications (BL-008). Currently logs only — push/SMS pending US-020.',
  onJob: () => {
    const now = Date.now();
    subscriptions.filter(s => s.status === 'active').forEach(s => {
      const days = Math.round((+new Date(s.renewsAt) - now) / 86_400_000);
      if ([3, 1, 0].includes(days)) {
        console.log(`[renewal] member=${s.memberId} sub=${s.id} T-${days} renewsAt=${s.renewsAt}`);
      }
    });
  }
};

// ───────────────────────────────────────── Selcom webhook (stub, idempotent) ──────────────
export const selcomWebhook = {
  created, method: 'post', path: '/webhooks/selcom',
  description: 'Selcom payment webhook. Idempotent on payment_id. ⛔ OI-004: signature verification pending.',
  requestSample: { payment_id: 'sel_x', status: 'success', subscription_id: 'sub_x' },
  onRequest: (req, res) => {
    const { payment_id, status, subscription_id } = req.body || {};
    if (!payment_id) return res.status(400).json({ error: 'missing_payment_id' });
    const seen = collection('webhook_seen');
    if (seen.find(w => w.id === payment_id)) return res.json({ ok: true, idempotent: true });
    seen.insert({ id: payment_id, at: new Date().toISOString() });
    if (status === 'success' && subscription_id) {
      subscriptions.update(s => s.id === subscription_id, { status: 'active', paymentRef: payment_id });
    }
    res.json({ ok: true });
  }
};
