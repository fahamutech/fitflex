import { Bars, Card, Chip, Counter, Phone, Ring, Screens } from '../shared/ui';
import { SceneCopy } from '../shared/SceneCopy';
import { COPY, THEME } from '../shared/content';
import { reveal } from '../shared/timeline';

export function TrainerScene({ t }: { t: number; tall: boolean }) {
  const A = THEME.trainer;
  const S = 13 / 6;
  return (
    <div className="split">
      <SceneCopy t={t} kicker={COPY.trainer.kicker} headline={COPY.trainer.headline} points={COPY.trainer.points} note={COPY.sample + '. Payout figures depend on gym/vendor settlement being live.'} />
      <div className="visual">
        <Phone accent={A}>
          <Screens t={t} steps={[
            { from: 0, node: (p) => (
              <div className="pad"><h4>Trainer profile</h4>
                <Card style={reveal(p, 0.1)}><div className="center"><span className="avatar big-av" /></div><b className="c">Sample Trainer</b>
                  <div className="chips c">{['Strength', 'Weight loss', 'Mobility'].map((c, i) => <span key={c} style={reveal(p, 0.5 + i * 0.2, 0.4, 8)}><Chip on>{c}</Chip></span>)}</div></Card>
              </div>) },
            { from: S, node: (p) => (
              <div className="pad"><h4>Availability</h4>
                {['Mon · 06:00–10:00', 'Wed · 16:00–20:00', 'Sat · 08:00–12:00'].map((s, i) => <Card key={s} style={reveal(p, 0.1 + i * 0.3)} className="row"><div><b>{s}</b><small>Open for sessions</small></div></Card>)}
              </div>) },
            { from: S * 2, node: (p) => (
              <div className="pad"><h4>Clients</h4>
                {[['Client A', 'Goal: build strength'], ['Client B', 'Goal: lose weight'], ['Client C', 'Goal: mobility']].map(([n, g], i) => <Card key={n} style={reveal(p, 0.1 + i * 0.3)} className="row"><span className="avatar" /><div><b>{n}</b><small>{g}</small></div></Card>)}
              </div>) },
            { from: S * 3, node: (p) => (
              <div className="pad"><h4>Goals & progress</h4>
                <div className="center"><Ring pct={0.6} p={p / 1.4} label="60%" sub="of goal" /></div>
                <Card><small>Sessions completed (sample)</small><Bars p={p / 1.6} values={[1, 2, 2, 3, 3, 4]} height={60} /></Card>
              </div>) },
            { from: S * 4, node: (p) => (
              <div className="pad"><h4>Earnings</h4>
                <Card><small>Weekly statement (sample)</small><b className="big">TZS <Counter value={285000} p={p / 1.5} /></b></Card>
                <Card style={reveal(p, 0.8)}><small>Sessions this week</small><b>9 sessions · sample</b></Card>
                <Card style={reveal(p, 1.2)}><small>Payout</small><b>Statement ready for review</b></Card>
              </div>) },
            { from: S * 5, node: (p) => (
              <div className="pad"><h4>Reputation</h4>
                <Card style={reveal(p, 0.1)}><b>Reviews from your clients</b><small>Appear here once clients rate sessions</small>
                  <div className="stars">{[0, 1, 2, 3, 4].map((i) => <i key={i} style={{ opacity: 0.25 + 0.15 * (i < 5 ? 1 : 0) }}>★</i>)}</div></Card>
                <Card style={reveal(p, 0.7)}><b>Visible to members nearby</b><small>Sample layout — no real ratings</small></Card>
              </div>) },
          ]} />
        </Phone>
      </div>
    </div>
  );
}
