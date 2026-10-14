import type { CSSProperties, ReactNode } from 'react';
import { clamp, easeOut, rng, seg } from './timeline';
import { COPY } from './content';
import { asset } from './asset';

/* ---------- Phone frame ---------- */
export function Phone({ children, accent, style, tag = true }: { children: ReactNode; accent: string; style?: CSSProperties; tag?: boolean }) {
  return (
    <div className="phone" style={{ ['--acc' as string]: accent, ...style }}>
      <div className="phone-notch" />
      <div className="phone-screen">
        <div className="statusbar"><span>9:41</span><span>●●● ▮</span></div>
        {children}
        {tag && <div className="sample-tag">{COPY.sample}</div>}
      </div>
    </div>
  );
}

/** Crossfades between timed panels. `from` are local seconds. */
export function Screens({ t, steps }: { t: number; steps: { from: number; node: (p: number) => ReactNode }[] }) {
  const FADE = 0.4;
  return (
    <div className="screens">
      {steps.map((s, i) => {
        const end = steps[i + 1]?.from ?? Infinity;
        const inP = seg(t, s.from, s.from + FADE);
        const outP = end === Infinity ? 0 : seg(t, end, end + FADE);
        const op = i === 0 ? 1 - outP : inP * (1 - outP);
        if (op <= 0.001) return null;
        return (
          <div key={i} className="screen" style={{ opacity: op, transform: `translateX(${(1 - easeOut(inP)) * 28 - outP * 28}px)` }}>
            {s.node(Math.max(0, t - s.from))}
          </div>
        );
      })}
    </div>
  );
}

/* ---------- Small building blocks ---------- */
export const Chip = ({ children, on, color }: { children: ReactNode; on?: boolean; color?: string }) => (
  <span className={'chip' + (on ? ' on' : '')} style={color ? { ['--acc' as string]: color } : undefined}>{children}</span>
);

export const Card = ({ children, style, className = '' }: { children: ReactNode; style?: CSSProperties; className?: string }) => (
  <div className={'card ' + className} style={style}>{children}</div>
);

export function Counter({ value, p, prefix = '', suffix = '' }: { value: number; p: number; prefix?: string; suffix?: string }) {
  return <>{prefix}{Math.round(value * easeOut(clamp(p))).toLocaleString('en-US')}{suffix}</>;
}

export function Bars({ values, p, height = 90 }: { values: number[]; p: number; height?: number }) {
  const max = Math.max(...values);
  return (
    <div className="bars" style={{ height }}>
      {values.map((v, i) => {
        const bp = easeOut(clamp(p * (1 + values.length * 0.12) - i * 0.12));
        return <i key={i} style={{ height: `${(v / max) * 100 * bp}%` }} />;
      })}
    </div>
  );
}

export function Sparkline({ values, p, w = 240, h = 70 }: { values: number[]; p: number; w?: number; h?: number }) {
  const max = Math.max(...values), min = Math.min(...values);
  const pts = values.map((v, i) => [(i / (values.length - 1)) * w, h - 6 - ((v - min) / (max - min || 1)) * (h - 14)]);
  const d = pts.map((q, i) => `${i ? 'L' : 'M'}${q[0].toFixed(1)},${q[1].toFixed(1)}`).join(' ');
  return (
    <svg width="100%" viewBox={`0 0 ${w} ${h}`} className="spark">
      <path d={d} pathLength={1} strokeDasharray={1} strokeDashoffset={1 - easeOut(clamp(p))} />
    </svg>
  );
}

export function Ring({ pct, p, size = 120, label, sub }: { pct: number; p: number; size?: number; label: string; sub?: string }) {
  const r = size / 2 - 10, c = 2 * Math.PI * r;
  return (
    <div className="ring" style={{ width: size, height: size }}>
      <svg width={size} height={size}>
        <circle cx={size / 2} cy={size / 2} r={r} className="ring-bg" />
        <circle cx={size / 2} cy={size / 2} r={r} className="ring-fg" strokeDasharray={c} strokeDashoffset={c * (1 - pct * easeOut(clamp(p)))} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      </svg>
      <div className="ring-label"><b>{label}</b>{sub && <small>{sub}</small>}</div>
    </div>
  );
}

/** Decorative QR-style pattern (NOT a scannable code). */
export function QrArt({ size = 150, scan }: { size?: number; scan?: number }) {
  const n = 21, cell = size / n, rand = rng(7);
  const cells: ReactNode[] = [];
  const finder = (x: number, y: number) => x < 7 && y < 7 || x > 13 && y < 7 || x < 7 && y > 13;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    let on: boolean;
    if (finder(x, y)) {
      const fx = x % 14 > 6 ? x - 14 : x, fy = y > 13 ? y - 14 : y;
      on = fx === 0 || fx === 6 || fy === 0 || fy === 6 || (fx >= 2 && fx <= 4 && fy >= 2 && fy <= 4);
    } else on = rand() > 0.52;
    if (on) cells.push(<rect key={x + '-' + y} x={x * cell} y={y * cell} width={cell + 0.4} height={cell + 0.4} />);
  }
  return (
    <div className="qr" style={{ width: size, height: size }}>
      <svg width={size} height={size}>{cells}</svg>
      {scan !== undefined && <div className="scanline" style={{ top: `${scan * 100}%` }} />}
    </div>
  );
}

export function Logo({ size = 120, style }: { size?: number; style?: CSSProperties }) {
  return <img src={asset('brand/fitflex-logo.svg')} alt="FitFlex Africa" width={size} height={size} style={style} draggable={false} />;
}

/* ---------- Backdrop ---------- */
export function Backdrop({ t, accent, tall }: { t: number; accent: string; tall: boolean }) {
  const r = rng(11);
  const N = 42;
  const W = tall ? 1080 : 1920, H = tall ? 1350 : 1080;
  const dots = Array.from({ length: N }, () => ({ x: r() * W, y: r() * H, s: 1 + r() * 2.4, sp: 0.15 + r() * 0.5, ph: r() * 6.28, o: 0.15 + r() * 0.4 }));
  return (
    <div className="backdrop" aria-hidden="true">
      <div className="glow g1" style={{ background: `radial-gradient(closest-side, ${accent}55, transparent)`, transform: `translate(${Math.sin(t * 0.3) * 40}px, ${Math.cos(t * 0.25) * 30}px)` }} />
      <div className="glow g2" style={{ transform: `translate(${Math.cos(t * 0.2) * 50}px, ${Math.sin(t * 0.3) * 40}px)` }} />
      <svg width={W} height={H} className="dots">
        {dots.map((d, i) => (
          <circle key={i} cx={d.x + Math.sin(t * d.sp + d.ph) * 18} cy={(d.y - t * 6 * d.sp + H * 2) % H} r={d.s} fill="#fff" opacity={d.o} />
        ))}
      </svg>
      <div className="grid-lines" />
    </div>
  );
}
