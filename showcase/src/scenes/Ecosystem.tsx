import { COPY, CTAS, THEME, APP_QR_IMAGE } from '../shared/content';
import { Phone, Card } from '../shared/ui';
import { KineticLogo } from '../shared/KineticLogo';
import { easeOut, reveal, seg } from '../shared/timeline';

export function EcosystemScene({ t, tall, interactive }: { t: number; tall: boolean; interactive?: boolean }) {
  const W = tall ? 1080 : 1920;
  const cy = tall ? 360 : 400;
  const pos = [
    { x: W / 2 - (tall ? 300 : 560), y: cy, c: THEME.owner, name: 'Gym owner' },
    { x: W / 2, y: cy - (tall ? 40 : 90), c: THEME.customer, name: 'Gym customer' },
    { x: W / 2 + (tall ? 300 : 560), y: cy, c: THEME.trainer, name: 'Trainer' },
  ];
  const links: [number, number][] = [[0, 1], [1, 2], [0, 2], [1, 1]];
  const cta = seg(t, 7, 8.2);
  return (
    <div className="eco" style={{ width: W }}>
      <svg className="eco-svg" width={W} height={tall ? 700 : 760} viewBox={`0 0 ${W} ${tall ? 700 : 760}`}>
        {links.slice(0, 3).map(([a, b], i) => {
          const p = easeOut(seg(t, 1 + i * 0.7, 2.4 + i * 0.7));
          const A = pos[a], B = pos[b];
          return <line key={i} x1={A.x} y1={A.y} x2={A.x + (B.x - A.x) * p} y2={A.y + (B.y - A.y) * p} stroke={THEME.teal} strokeWidth="2.5" strokeDasharray="8 10" strokeDashoffset={-t * 30} opacity=".8" />;
        })}
        {pos.map((P, i) => <circle key={i} cx={P.x} cy={P.y} r={(tall ? 150 : 190) * easeOut(seg(t, 0.2 + i * 0.2, 1.2))} fill={P.c} opacity=".08" />)}
      </svg>
      {pos.map((P, i) => (
        <div key={i} className="eco-node" style={{ left: P.x, top: P.y, ...reveal(t, 0.2 + i * 0.2, 0.7, 30), ['--acc' as string]: P.c, transform: `translate(-50%,-50%) scale(${0.85 + 0.15 * easeOut(seg(t, 0.2 + i * 0.2, 1))})`, opacity: seg(t, 0.2 + i * 0.2, 0.9) }}>
          <Phone accent={P.c} tag={false} style={{ transform: 'scale(.52)', transformOrigin: 'center' }}>
            <div className="pad"><h4>{P.name}</h4><Card><b>{['Dashboard', 'Discover', 'Schedule'][i]}</b></Card><Card><small>{COPY.sample}</small></Card></div>
          </Phone>
          <span className="eco-name">{P.name}</span>
        </div>
      ))}
      <div className="eco-labels">
        {COPY.ecosystem.links.map((l, i) => <span key={l} style={reveal(t, 2.6 + i * 0.5, 0.5, 10)}>{l}</span>)}
      </div>
      <div className="eco-close">
        <KineticLogo t={t - 4.7} size={110} style={{ marginBottom: -8 }} />
        <h2 style={reveal(t, 5.2, 0.8, 24)}>{COPY.ecosystem.tagline}</h2>
        <p style={reveal(t, 6.1, 0.7, 14)}>{COPY.ecosystem.powered}</p>
        <div className="ctas" style={{ opacity: cta, transform: `translateY(${(1 - cta) * 16}px)` }}>
          {CTAS.map((c) => (
            interactive && c.href
              ? <a key={c.id} className="cta" href={c.href}>{c.label}</a>
              : <span key={c.id} className={'cta' + (c.href ? '' : ' ph')} title={c.href ? undefined : 'Placeholder — set a verified link in content.ts'}>{c.label}</span>
          ))}
          <span className="qr-ph">{APP_QR_IMAGE ? <img src={APP_QR_IMAGE} alt="Get the app" /> : 'App QR · placeholder'}</span>
        </div>
      </div>
    </div>
  );
}
