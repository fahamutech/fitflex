import { COPY, THEME } from '../shared/content';
import { KineticLogo } from '../shared/KineticLogo';
import { easeOut, reveal, seg } from '../shared/timeline';

export function IntroScene({ t, tall }: { t: number; tall: boolean }) {
  const words = COPY.intro.headline;
  const nodes = [
    { label: COPY.intro.roles[0], c: THEME.owner, x: tall ? 230 : 360, y: tall ? 0 : 20 },
    { label: COPY.intro.roles[1], c: THEME.customer, x: 540, y: tall ? 130 : -60 },
    { label: COPY.intro.roles[2], c: THEME.trainer, x: tall ? 850 : 1180, y: tall ? 0 : 20 },
  ];
  return (
    <div className="intro">
      <KineticLogo t={t} size={tall ? 340 : 320} />
      <h1 className="intro-h">
        {words.map((w, i) => (
          <span key={w} style={{ display: 'block', ...reveal(t, 1.7 + i * 0.3, 0.7, 30), color: i === 2 ? THEME.teal : undefined }}>{w}</span>
        ))}
      </h1>
      <div className="trio" style={{ width: tall ? 1080 : 1920 }}>
        <svg className="trio-lines" viewBox={`0 0 ${tall ? 1080 : 1920} 200`} preserveAspectRatio="none">
          {[0, 2].map((k) => {
            const n = nodes[k];
            const x1 = n.x, y1 = 60 + n.y, x2 = nodes[1].x, y2 = 60 + nodes[1].y;
            const p = easeOut(seg(t, 3.3 + k * 0.2, 4.3));
            return <line key={k} x1={x1} y1={y1} x2={x1 + (x2 - x1) * p} y2={y1 + (y2 - y1) * p} stroke={THEME.teal} strokeWidth="2" strokeDasharray="6 8" opacity=".7" />;
          })}
        </svg>
        {nodes.map((n, i) => (
          <div key={n.label} className="node-pos" style={{ left: n.x, top: 20 + n.y }}>
            <div className="node" style={{ ['--acc' as string]: n.c, ...reveal(t, 2.9 + i * 0.25, 0.6, 20) }}>
              <span className="node-dot" />{n.label}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
