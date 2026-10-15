import { Card, Chip, Phone, QrArt, Ring, Screens, Bars } from '../shared/ui';
import { SceneCopy } from '../shared/SceneCopy';
import { COPY, THEME } from '../shared/content';
import { reveal } from '../shared/timeline';

const STEP = 15 / 7;

export function CustomerScene({ t, tall }: { t: number; tall: boolean }) {
  const A = THEME.customer;
  const idx = Math.min(6, Math.floor(t / STEP));
  return (
    <div className="split">
      <SceneCopy t={t} kicker={COPY.customer.kicker} headline={COPY.customer.headline} note={COPY.customer.note}>
        <ol className="steps">
          {COPY.customer.steps.map((s, i) => (
            <li key={s} className={i === idx ? 'cur' : i < idx ? 'done' : ''} style={reveal(t, 1 + i * 0.15, 0.5, 10)}><span>{i + 1}</span>{s}</li>
          ))}
        </ol>
      </SceneCopy>
      <div className="visual">
        <Phone accent={A}>
          <Screens t={t} steps={[
            { from: 0, node: (p) => (
              <div className="pad"><h4>Discover</h4>
                <div className="chips">{['Near me', 'Showers', 'Cardio', 'Open now'].map((c, i) => <Chip key={c} on={i < 2}>{c}</Chip>)}</div>
                <div className="map">{[[30, 40], [62, 28], [48, 66], [75, 58]].map(([x, y], i) => <i key={i} className="pin" style={{ left: `${x}%`, top: `${y}%`, opacity: Math.min(1, Math.max(0, p - 0.3 - i * 0.25)) }} />)}</div>
                <Card style={reveal(p, 1.1)} className="row"><span className="avatar" /><div><b>Sample Gym A</b><small>1.2 km · Cardio, Showers</small></div></Card>
              </div>) },
            { from: STEP, node: (p) => (
              <div className="pad"><h4>Compare</h4>
                <div className="cmp">
                  {['Sample Gym A', 'Sample Gym B'].map((g, gi) => (
                    <Card key={g} style={reveal(p, 0.1 + gi * 0.2)}><b>{g}</b>
                      {['Free weights', 'Cardio', 'Showers', 'Sauna'].map((f, i) => <small key={f} style={{ opacity: (gi === 1 && i === 3) || (gi === 0 && i === 3) ? (gi === 1 ? 1 : 0.35) : 1 }}>{(gi === 0 && i === 3) ? '✕' : '✓'} {f}</small>)}
                    </Card>))}
                </div>
              </div>) },
            { from: STEP * 2, node: (p) => (
              <div className="pad"><h4>Choose a pass</h4>
                {[['Day pass', 'TZS 10,000'], ['Monthly', 'TZS 60,000'], ['Quarterly', 'TZS 150,000']].map(([n, pr], i) => (
                  <Card key={n} style={reveal(p, 0.1 + i * 0.3)} className={i === 1 ? 'row sel' : 'row'}><div><b>{n}</b><small>{pr} · illustrative</small></div></Card>))}
              </div>) },
            { from: STEP * 3, node: (p) => (
              <div className="pad"><h4>Book a trainer</h4>
                <div className="slots">{['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d, i) => <span key={d} className={i === 2 ? 'slot on' : 'slot'}>{d}</span>)}</div>
                {['07:00', '09:30', '17:00'].map((s, i) => <Card key={s} style={reveal(p, 0.4 + i * 0.3)} className={i === 1 ? 'row sel' : 'row'}><div><b>{s}</b><small>Sample Trainer · 60 min</small></div></Card>)}
              </div>) },
            { from: STEP * 4, node: (p) => (
              <div className="pad center"><h4>Check in</h4><QrArt size={170} scan={(p * 0.7) % 1} />
                <Card style={{ ...reveal(p, 1.2), width: '100%', marginTop: 16 }} className="ok">✓ Welcome in<small>Pass valid · visit logged</small></Card></div>) },
            { from: STEP * 5, node: (p) => (
              <div className="pad"><h4>Your progress</h4>
                <div className="center"><Ring pct={0.72} p={p / 1.5} label="18 / 25" sub="visits" /></div>
                <Card><small>Weekly activity (sample)</small><Bars p={p / 1.6} values={[2, 4, 3, 5, 3, 6, 4]} height={70} /></Card>
              </div>) },
            { from: STEP * 6, node: (p) => (
              <div className="pad"><h4>Fitness products</h4>
                <div className="grid2">{['Protein', 'Gloves', 'Bands', 'Bottle'].map((n, i) => <Card key={n} style={reveal(p, 0.1 + i * 0.25, 0.5, 14)}><div className="prod" /><b>{n}</b><small>Sample item</small></Card>)}</div>
              </div>) },
          ]} />
        </Phone>
      </div>
    </div>
  );
}
