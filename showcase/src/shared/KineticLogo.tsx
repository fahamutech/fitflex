import type { CSSProperties } from 'react';
import { clamp, easeOut, easeOutBack, seg } from './timeline';
import { THEME } from './content';
import { asset } from './asset';

/** Total animation length (s). After this the logo is identical to the supplied artwork. */
export const LOGO_ANIM = 1.9;

const bounce = (x: number) => {
  const n1 = 7.5625, d1 = 2.75;
  if (x < 1 / d1) return n1 * x * x;
  if (x < 2 / d1) return n1 * (x -= 1.5 / d1) * x + 0.75;
  if (x < 2.5 / d1) return n1 * (x -= 2.25 / d1) * x + 0.9375;
  return n1 * (x -= 2.625 / d1) * x + 0.984375;
};

/**
 * Kinetic reveal built from the real FitFlex logo, split into two layers (pin + runner):
 *  1. the location pin DROPS in and lands on its tip (squash + ripple) — "find your gym"
 *  2. the runner DASHES in from the left, leg breaking out of the pin, motion ghosts + speed lines
 *  3. the arm FLEXES (gold pulse on the bicep) — strength
 *  4. settles into the exact logo, then a barely-there breathing float.
 * Pure function of `t` (seconds since this logo started). t < 0 renders nothing.
 */
export function KineticLogo({ t, size = 300, style }: { t: number; size?: number; style?: CSSProperties }) {
  if (t < 0) return <div style={{ width: size, height: size, ...style }} />;
  const u = size / 300; // design units
  const base = asset('brand/');

  // 1. pin drop
  const dp = clamp((t - 0.1) / 0.65);
  const pinY = (1 - bounce(dp)) * -(560 * u) * (dp < 1 ? 1 : 0);
  const land = seg(t, 0.62, 0.74) * (1 - seg(t, 0.74, 1.05)); // squash window
  const squashY = 1 - 0.1 * land, squashX = 1 + 0.07 * land;
  const pinOp = seg(t, 0.1, 0.22);

  // 2. runner dash
  const rp = seg(t, 0.55, 1.3);
  const rx = (1 - easeOutBack(rp)) * -(700 * u);
  const skew = (1 - easeOut(rp)) * -16;
  const blur = (1 - easeOut(rp)) * 7;
  const rOp = seg(t, 0.55, 0.7);

  // 3. flex
  const fp = seg(t, 1.25, 1.85);
  const pulse = Math.sin(fp * Math.PI);
  const flexScale = 1 + 0.055 * pulse;

  // 4. idle breathing
  const idle = seg(t, LOGO_ANIM, LOGO_ANIM + 0.6);
  const float = Math.sin(t * 1.6) * 3 * u * idle;

  // ripple at pin tip
  const rip = seg(t, 0.68, 1.5);

  const rim = 'drop-shadow(0 0 1.5px rgba(170,215,255,.95)) drop-shadow(0 0 14px rgba(20,184,166,.35))';
  const img: CSSProperties = { position: 'absolute', inset: 0, width: '100%', height: '100%', userSelect: 'none', pointerEvents: 'none' };

  return (
    <div role="img" aria-label="FitFlex Africa logo" style={{ position: 'relative', width: size, height: size, transform: `translateY(${float}px)`, ...style }}>
      {/* soft stage light so the navy pin reads on dark backgrounds */}
      <div style={{ position: 'absolute', inset: -size * 0.22, borderRadius: '50%', opacity: seg(t, 0, 0.9) * 0.9, background: `radial-gradient(closest-side, ${THEME.teal}40, ${THEME.teal}10 55%, transparent 75%)` }} />
      {/* ripple on landing */}
      {rip > 0 && rip < 1 && (
        <div style={{ position: 'absolute', left: '50%', top: '91%', width: size * 0.9, height: size * 0.22, marginLeft: -size * 0.45, marginTop: -size * 0.11, borderRadius: '50%', border: `${2 * u}px solid ${THEME.teal}`, opacity: (1 - rip) * 0.9, transform: `scale(${0.15 + rip * 1.1})` }} />
      )}
      {/* pin */}
      <img src={base + 'logo-pin.png'} alt="" draggable={false} style={{ ...img, opacity: pinOp, filter: rim, transformOrigin: '50% 92%', transform: `translateY(${pinY}px) scale(${squashX}, ${squashY})` }} />
      {/* speed lines */}
      {[0.38, 0.46, 0.54, 0.62].map((y, i) => {
        const p = seg(t, 0.6 + i * 0.05, 1.15 + i * 0.05);
        const o = Math.sin(p * Math.PI);
        return <i key={i} style={{ position: 'absolute', left: `${-18 + i * 3}%`, top: `${y * 100}%`, width: `${30 - i * 3}%`, height: Math.max(2, 3 * u), borderRadius: 4, background: `linear-gradient(90deg, transparent, ${i % 2 ? THEME.customer : THEME.teal})`, opacity: o * 0.8, transform: `scaleX(${0.2 + p * 0.8})`, transformOrigin: 'right center' }} />;
      })}
      {/* runner ghosts */}
      {[0.32, 0.2, 0.1].map((o, i) => (
        <img key={i} src={base + 'logo-runner.png'} alt="" draggable={false} style={{ ...img, opacity: rOp * o * (1 - rp), filter: `blur(${2 + i * 2}px) hue-rotate(${-20 - i * 15}deg)`, transform: `translateX(${rx - (i + 1) * 60 * u * (1 - rp)}px) skewX(${skew}deg)` }} />
      ))}
      {/* runner */}
      <img src={base + 'logo-runner.png'} alt="" draggable={false} style={{ ...img, opacity: rOp, filter: `blur(${blur}px)`, transformOrigin: '72% 38%', transform: `translateX(${rx}px) skewX(${skew}deg) scale(${flexScale})` }} />
      {/* bicep flash */}
      {pulse > 0.01 && (
        <div style={{ position: 'absolute', left: '73%', top: '30%', width: size * 0.34, height: size * 0.34, marginLeft: -size * 0.17, marginTop: -size * 0.17, borderRadius: '50%', opacity: pulse * 0.85, background: `radial-gradient(closest-side, #ffd36bcc, #f5b94244 55%, transparent)`, mixBlendMode: 'screen', transform: `scale(${0.6 + pulse * 0.7})` }} />
      )}
    </div>
  );
}
