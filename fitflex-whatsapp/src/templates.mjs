// FitFlex Af — WhatsApp Message Templates
// Each template corresponds to a WhatsApp Business API template that must be
// pre-approved by Meta before production use.
//
// Template variables use {{1}}, {{2}}, etc. — matching WhatsApp's format.
// In dev mode, these are rendered with actual values for console logging.
//
// Categories:
//   - authentication: OTP codes (cheapest, ~$0.004/msg for Rest of Africa)
//   - utility: transactional confirmations (check-in, booking, payout, renewal)
//   - marketing: re-engagement nudges, promo campaigns
//   - service: replies to user-initiated messages (trainer-member chat, support)

export const TEMPLATES = {
  // ─── Authentication ──────────────────────────────────────────────────────
  otp_signup: {
    name: 'fitflex_otp_signup',
    category: 'authentication',
    language: 'en',
    body: 'Your FitFlex verification code is {{1}}. This code expires in 5 minutes. Do not share it with anyone.',
    params: ['code'],
    description: 'OTP for new user signup'
  },
  otp_pin_reset: {
    name: 'fitflex_otp_pin_reset',
    category: 'authentication',
    language: 'en',
    body: 'Your FitFlex PIN reset code is {{1}}. If you did not request this, ignore this message.',
    params: ['code'],
    description: 'OTP for security PIN reset'
  },
  otp_signup_sw: {
    name: 'fitflex_otp_signup_sw',
    category: 'authentication',
    language: 'sw',
    body: 'Nambari yako ya kuthibitisha FitFlex ni {{1}}. Nambari hii itaondoka baada ya dakika 5. Usiweze kushiriki na mtu mwingine.',
    params: ['code'],
    description: 'OTP for new user signup (Swahili)'
  },

  // ─── Utility: Check-in ───────────────────────────────────────────────────
  checkin_receipt: {
    name: 'fitflex_checkin_receipt',
    category: 'utility',
    language: 'en',
    body: '✅ Checked in at {{1}} on {{2}} at {{3}}. Enjoy your workout! Visits used: {{4}}/{{5}}.',
    params: ['gymName', 'date', 'time', 'visitsUsed', 'visitCap'],
    description: 'Confirmation after successful gym check-in'
  },
  checkin_receipt_sw: {
    name: 'fitflex_checkin_receipt_sw',
    category: 'utility',
    language: 'sw',
    body: '✅ Umepinga kwenye {{1}} tarehe {{2}} saa {{3}}. Furahia zoezi lako! Matembezi: {{4}}/{{5}}.',
    params: ['gymName', 'date', 'time', 'visitsUsed', 'visitCap'],
    description: 'Check-in confirmation (Swahili)'
  },
  checkin_failed: {
    name: 'fitflex_checkin_failed',
    category: 'utility',
    language: 'en',
    body: '❌ Check-in failed at {{1}}: {{2}}. Open the FitFlex app for details.',
    params: ['gymName', 'reason'],
    description: 'Check-in failure notification with reason'
  },

  // ─── Utility: Booking ────────────────────────────────────────────────────
  booking_confirmed: {
    name: 'fitflex_booking_confirmed',
    category: 'utility',
    language: 'en',
    body: '🏋️ Your session with {{1}} on {{2}} at {{3}} is confirmed. Booking ID: {{4}}.',
    params: ['trainerName', 'date', 'time', 'bookingId'],
    description: 'Trainer booking confirmed by trainer'
  },
  booking_pending: {
    name: 'fitflex_booking_pending',
    category: 'utility',
    language: 'en',
    body: '📅 Booking request sent to {{1}} for {{2}} at {{3}}. We will notify you when the trainer confirms.',
    params: ['trainerName', 'date', 'time'],
    description: 'Booking request created — awaiting trainer confirmation'
  },
  booking_cancelled: {
    name: 'fitflex_booking_cancelled',
    category: 'utility',
    language: 'en',
    body: '❌ Your booking with {{1}} on {{2}} at {{3}} has been cancelled. Reason: {{4}}.',
    params: ['trainerName', 'date', 'time', 'reason'],
    description: 'Booking cancelled (by member or trainer)'
  },
  booking_reminder: {
    name: 'fitflex_booking_reminder',
    category: 'utility',
    language: 'en',
    body: '⏰ Reminder: Your session with {{1}} is tomorrow at {{2}} at {{3}}. See you there!',
    params: ['trainerName', 'time', 'location'],
    description: '24-hour reminder for upcoming trainer session'
  },
  booking_completed_trainer: {
    name: 'fitflex_booking_completed_trainer',
    category: 'utility',
    language: 'en',
    body: '💰 Session completed with {{1}}. Your payout: TZS {{2}} (Ref: {{3}}). Session #{{4}} this month.',
    params: ['memberName', 'payoutAmount', 'payoutRef', 'monthCount'],
    description: 'Trainer notified of completed session + payout'
  },

  // ─── Utility: Subscription ──────────────────────────────────────────────
  subscription_activated: {
    name: 'fitflex_subscription_activated',
    category: 'utility',
    language: 'en',
    body: '🎉 Your FitFlex {{1}} Pass is now active! You have {{2}} visits this billing cycle. Renews on {{3}}.',
    params: ['tier', 'visitCap', 'renewalDate'],
    description: 'Subscription activated after payment confirmation'
  },
  subscription_renewal_t3: {
    name: 'fitflex_subscription_renewal_t3',
    category: 'utility',
    language: 'en',
    body: '⏰ Your FitFlex {{1}} Pass renews in 3 days ({{2}}). Ensure your mobile money account is funded.',
    params: ['tier', 'renewalDate'],
    description: 'T-3 renewal reminder (3 days before charge)'
  },
  subscription_renewal_t1: {
    name: 'fitflex_subscription_renewal_t1',
    category: 'utility',
    language: 'en',
    body: '⚠️ Your FitFlex {{1}} Pass renews TOMORROW ({{2}}). Please ensure your M-Pesa/Airtel/Tigo account is funded.',
    params: ['tier', 'renewalDate'],
    description: 'T-1 renewal reminder (1 day before charge)'
  },
  subscription_renewal_success: {
    name: 'fitflex_subscription_renewal_success',
    category: 'utility',
    language: 'en',
    body: '✅ Your {{1}} Pass has been renewed successfully. Next renewal: {{2}}. Enjoy your workouts!',
    params: ['tier', 'nextRenewalDate'],
    description: 'Renewal payment succeeded'
  },
  subscription_payment_failed: {
    name: 'fitflex_subscription_payment_failed',
    category: 'utility',
    language: 'en',
    body: '❌ Payment failed for your {{1}} Pass renewal. You have 24 hours to retry before access is suspended. Open FitFlex to retry.',
    params: ['tier'],
    description: 'Renewal payment failed — 24h grace period warning'
  },
  subscription_expired: {
    name: 'fitflex_subscription_expired',
    category: 'utility',
    language: 'en',
    body: '⛔ Your FitFlex {{1}} Pass has expired. Reactivate now to regain gym access: {{2}}',
    params: ['tier', 'reactivationLink'],
    description: 'Subscription expired after grace period'
  },

  // ─── Utility: Payouts ───────────────────────────────────────────────────
  payout_gym_owner: {
    name: 'fitflex_payout_gym_owner',
    category: 'utility',
    language: 'en',
    body: '💸 Payout sent: TZS {{1}} to your {{2}} account. Ref: {{3}}. Visits this period: {{4}}. Band: {{5}}.',
    params: ['amount', 'walletName', 'reference', 'visitCount', 'band'],
    description: 'Weekly gym owner payout notification'
  },
  payout_trainer: {
    name: 'fitflex_payout_trainer',
    category: 'utility',
    language: 'en',
    body: '💸 Weekly payout: TZS {{1}} for {{2}} completed sessions. Ref: {{3}}.',
    params: ['amount', 'sessionCount', 'reference'],
    description: 'Weekly trainer payout notification'
  },

  // ─── Utility: Credits Wallet ───────────────────────────────────────────
  credits_topup: {
    name: 'fitflex_credits_topup',
    category: 'utility',
    language: 'en',
    body: '💰 Credits topped up: TZS {{1}} added to your FitFlex wallet. New balance: TZS {{2}}. Expires: {{3}}.',
    params: ['amount', 'newBalance', 'expiryDate'],
    description: 'Credits wallet top-up confirmation'
  },
  credits_deducted: {
    name: 'fitflex_credits_deducted',
    category: 'utility',
    language: 'en',
    body: '🔐 TZS {{1}} credits deducted for {{2}}. Remaining balance: TZS {{3}}.',
    params: ['amount', 'reason', 'newBalance'],
    description: 'Credits deduction for roaming visit'
  },
  credits_expiry_warning: {
    name: 'fitflex_credits_expiry_warning',
    category: 'utility',
    language: 'en',
    body: '⚠️ Your FitFlex credits expire in {{1}} days (on {{2}}). Top up to reset the 90-day clock.',
    params: ['daysRemaining', 'expiryDate'],
    description: 'Credits expiry warning (7 days before)'
  },

  // ─── Utility: Marketplace ───────────────────────────────────────────────
  order_placed: {
    name: 'fitflex_order_placed',
    category: 'utility',
    language: 'en',
    body: '🛒 Order placed: {{1}} for TZS {{2}}. Order ID: {{3}}. Track delivery in the FitFlex app.',
    params: ['productName', 'amount', 'orderId'],
    description: 'Marketplace order confirmation'
  },
  order_shipped: {
    name: 'fitflex_order_shipped',
    category: 'utility',
    language: 'en',
    body: '📦 Your order {{1}} has been shipped. Expected delivery: {{2}}.',
    params: ['orderId', 'eta'],
    description: 'Order fulfillment status update'
  },
  order_delivered: {
    name: 'fitflex_order_delivered',
    category: 'utility',
    language: 'en',
    body: '✅ Your order {{1}} has been delivered. You have 48 hours to report any issues.',
    params: ['orderId'],
    description: 'Order delivered — starts 48h complaint window'
  },

  // ─── Marketing: Re-engagement ───────────────────────────────────────────
  streak_nudge_5d: {
    name: 'fitflex_streak_nudge_5d',
    category: 'marketing',
    language: 'en',
    body: '💪 Hi {{1}}, you haven\'t checked in for 5 days! Your gym is waiting. Tap to book a session: {{2}}',
    params: ['memberName', 'deeplink'],
    description: '5-day inactivity streak nudge'
  },
  streak_nudge_10d: {
    name: 'fitflex_streak_nudge_10d',
    category: 'marketing',
    language: 'en',
    body: 'Hey {{1}}, it\'s been 10 days since your last workout! Don\'t break your streak — your FitFlex Pass is still active. Find a gym: {{2}}',
    params: ['memberName', 'deeplink'],
    description: '10-day inactivity streak nudge'
  },
  low_visits_nudge: {
    name: 'fitflex_low_visits_nudge',
    category: 'marketing',
    language: 'en',
    body: '📊 Hi {{1}}, you have {{2}} visits remaining this month. Don\'t waste them — they don\'t roll over! Book a gym: {{3}}',
    params: ['memberName', 'visitsRemaining', 'deeplink'],
    description: 'Nudge for members with unused visits approaching month-end'
  },

  // ─── Marketing: Corporate ──────────────────────────────────────────────
  corporate_monthly_report: {
    name: 'fitflex_corporate_monthly_report',
    category: 'utility',
    language: 'en',
    body: '📊 Monthly Wellness Report for {{1}}:\n• Staff enrolled: {{2}}\n• Active engagement: {{3}}%\n• Absenteeism drop: {{4}}%\n• Visits this month: {{5}}\n\nFull report in the FitFlex portal.',
    params: ['companyName', 'staffEnrolled', 'engagementRate', 'absenteeismDrop', 'monthVisits'],
    description: 'Monthly corporate wellness ROI report to HR admin'
  },

  // ─── Service: Trainer-Member Chat Routing ───────────────────────────────
  // These are free-form (within 24h window) — no template needed.
  // The service just logs them and routes to the correct conversation.
};

// Helper: get template by key, with language fallback
export function getTemplate(key, language = 'en') {
  // Try exact language match first
  const langKey = `${key}_${language === 'sw' ? 'sw' : 'en'}`;
  if (TEMPLATES[langKey]) return TEMPLATES[langKey];
  // Fall back to base key (English)
  if (TEMPLATES[key]) return TEMPLATES[key];
  return null;
}

// Helper: render template body with actual values
export function renderTemplate(template, values = {}) {
  let body = template.body;
  for (let i = 0; i < (template.params || []).length; i++) {
    const param = template.params[i];
    const value = values[param] ?? `{{${i + 1}}}`;
    body = body.replace(new RegExp(`\\{\\{${i + 1}\\}\\}`, 'g'), String(value));
  }
  return body;
}

// Helper: list all templates for the management endpoint
export function listTemplates() {
  return Object.entries(TEMPLATES).map(([key, t]) => ({
    key,
    name: t.name,
    category: t.category,
    language: t.language,
    description: t.description,
    params: t.params,
    body: t.body
  }));
}
