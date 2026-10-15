/**
 * All copy, brand tokens and configurable CTAs live here.
 * Edit this file to change wording, links or colours — no scene code needs touching.
 */
export const THEME = {
  // FitFlex teal is the showcase primary (per creative brief). The shipped apps use brand green
  // (#1F7A3A mobile / #17b26a portal) — swap `teal` here if you want the showcase to match exactly.
  teal: '#14b8a6',
  owner: '#22c55e',
  customer: '#38bdf8',
  trainer: '#f5b942',
  bg0: '#04080f',
  bg1: '#0a1424',
  ink: '#eaf2f8',
  mute: '#8ba0b5',
} as const;

export const BRAND = { name: 'FitFlex Africa', logo: 'brand/fitflex-logo.svg', icon: 'brand/fitflex-icon.png' };

/** Set to a path inside /public (e.g. 'audio/music.mp3') once you hold the rights. null = silent. */
export const AUDIO = { music: null as string | null, voiceOver: null as string | null, musicVolume: 0.35 };

export type Cta = { id: string; label: string; href: string | null };
/** href = null renders a visible placeholder. Only fill with verified destinations. */
export const CTAS: Cta[] = [
  { id: 'explore', label: 'Explore FitFlex', href: null },
  { id: 'gym', label: 'Join as a Gym Partner', href: null },
  { id: 'trainer', label: 'Join as a Trainer', href: null },
  { id: 'app', label: 'Get the App', href: null },
];
/** Real QR image for the app download. null = labelled placeholder (no fake QR is drawn as a link). */
export const APP_QR_IMAGE: string | null = null;

export const COPY = {
  intro: {
    headline: ['One Platform.', 'Every Role.', 'Stronger Together.'],
    roles: ['Gym owners', 'Gym customers', 'Personal trainers'],
  },
  owner: {
    kicker: 'For gym owners',
    headline: 'Run Your Gym. Grow Your Business.',
    points: [
      'Less manual administration',
      'Clear visibility into gym activity',
      'Promote your services and offers',
      'Make better business decisions',
    ],
  },
  customer: {
    kicker: 'For gym customers',
    headline: 'Train Your Way. Any Gym. Anytime.',
    note: 'Gym access depends on the pass you choose.',
    steps: [
      'Discover gyms near you',
      'Compare facilities',
      'Pick a flexible pass',
      'Book a trainer',
      'Check in with QR',
      'Track your progress',
      'Explore fitness products',
    ],
  },
  trainer: {
    kicker: 'For personal trainers',
    headline: 'Coach More. Impact More.',
    points: [
      'Showcase your specialisations',
      'Manage availability and sessions',
      'Keep clients and goals organised',
      'Build a stronger training business',
    ],
  },
  ecosystem: {
    links: ['Gyms ↔ Members', 'Members ↔ Trainers', 'Activity → Progress', 'Discovery → Growth'],
    tagline: 'Your Fitness. Your Business. Your Community.',
    powered: 'Powered by FitFlex Africa.',
  },
  sample: 'Illustrative sample data',
} as const;

/**
 * Honest capability map. `live` = exists in the FitFlex codebase per project notes;
 * `concept` = shown for storytelling only. VERIFY before external use (see MISSING_INPUTS.md).
 */
export const FEATURE_STATUS: { role: string; feature: string; status: 'live' | 'concept'; note?: string }[] = [
  { role: 'owner', feature: 'QR member check-in', status: 'live' },
  { role: 'owner', feature: 'Check-ins & attendance dashboard', status: 'live' },
  { role: 'owner', feature: 'Settlement / revenue figures', status: 'live', note: 'settlement job still in shadow mode' },
  { role: 'owner', feature: 'Announcements / communications', status: 'live' },
  { role: 'owner', feature: 'Offers & promotions', status: 'live', note: 'moderation & promotion module' },
  { role: 'customer', feature: 'Gym discovery & tier gym list', status: 'live' },
  { role: 'customer', feature: 'Passes & upgrade in place', status: 'live' },
  { role: 'customer', feature: 'Trainer sessions booking', status: 'live' },
  { role: 'customer', feature: 'Activity & run tracking', status: 'live' },
  { role: 'customer', feature: 'Products / marketplace', status: 'live', note: 'vendor marketplace' },
  { role: 'trainer', feature: 'Trainer profile & reviews', status: 'live' },
  { role: 'trainer', feature: 'Weekly earnings statements', status: 'live', note: 'real payouts need KYC + settlement go-live' },
  { role: 'trainer', feature: 'Client plans & progress', status: 'live' },
  { role: 'all', feature: 'Gym map filter by amenities/preferences', status: 'concept', note: 'verify exact filter set' },
];
