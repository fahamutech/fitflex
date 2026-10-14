import { Bars, Card, Chip, Counter, Phone, QrArt, Screens, Sparkline } from '../shared/ui';
import { SceneCopy } from '../shared/SceneCopy';
import { COPY, THEME } from '../shared/content';
import { easeOut, reveal, seg } from '../shared/timeline';

const members = [['Member A', 'Checked in 06:12'], ['Member B', 'Checked in 06:48'], ['Member C', 'Checked in 07:05'], ['Member D', 'Checked in 07:31']];

export function OwnerScene({ t, tall }: { t: number; tall: boolean }) {
  const A = THEME.owner;
  return (
    <div className="split">
      <SceneCopy t={t} kicker={COPY.owner.kicker} headline={COPY.owner.headline} points={COPY.owner.points} note={COPY.sample + ' shown. Not real performance data.'} />
      <div className="visual">
        <Phone accent={A}>
          <Screens t={t} steps={[
            { from: 0, node: (p) => (
              <div className="pad">
                <h4>Gym profile</h4>
                <Card style={reveal(p, 0.1)}>
                  <div className="hero-img" />
                  <b>Sample Gym · Dar es Salaam</b>
                  <small>Open 05:30 – 22:00</small>
                  <div className="chips">{['Free weights', 'Cardio', 'Showers', 'Parking'].map((c, i) => <span key={c} style={reveal(p, 0.5 + i * 0.2, 0.4, 8)}><Chip on>{c}</Chip></span>)}</div>
                </Card>
              </div>) },
            { from: 2.6, node: (p) => (
              <div className="pad center">
                <h4>Member check-in</h4>
                <QrArt size={170} scan={(p * 0.9) % 1} />
                <Card style={{ ...reveal(p, 1.3, 0.4, 16), marginTop: 18, width: '100%' }} className="ok">✓ Check-in confirmed<small>Member A · Monthly pass</small></Card>
              </div>) },
            { from: 5.6, node: (p) => (
              <div className="pad">
                <h4>Members today</h4>
                {members.map(([n, s], i) => (
                  <Card key={n} style={reveal(p, 0.1 + i * 0.35, 0.5, 14)} className="row"><span className="avatar" /><div><b>{n}</b><small>{s}</small></div></Card>
                ))}
              </div>) },
            { from: 8.8, node: (p) => (
              <div className="pad">
                <h4>Revenue & attendance</h4>
                <Card><small>Revenue this month (sample)</small><b className="big">TZS <Counter value={4850000} p={p / 1.6} /></b><Bars p={p / 1.8} values={[30, 46, 38, 62, 55, 74, 68]} /></Card>
                <Card><small>Daily attendance (sample)</small><Sparkline p={p / 1.8} values={[20, 28, 24, 36, 31, 44, 40, 52]} /></Card>
              </div>) },
            { from: 12.2, node: (p) => (
              <div className="pad">
                <h4>Offers & announcements</h4>
                <Card style={reveal(p, 0.1)}><span className="tagline">Offer</span><b>Weekend pass — sample promo</b><small>Visible to members nearby</small></Card>
                <Card style={reveal(p, 0.6)}><span className="tagline">Announcement</span><b>Studio closed Sunday for maintenance</b><small>Sent to members</small></Card>
                <Card style={reveal(p, 1.1)}><small>Reach this week (sample)</small><b className="big"><Counter value={1280} p={p / 1.5} /> views</b></Card>
              </div>) },
          ]} />
        </Phone>
        {/* floating notification cards */}
        <div className="float f-left" style={{ ...reveal(t, 3.6, 0.5), opacity: seg(t, 3.6, 4.1) * (1 - seg(t, 5.4, 5.8)) }}><i className="dot" />Member A checked in</div>
        <div className="float f-right" style={{ ...reveal(t, 9.6, 0.5), opacity: seg(t, 9.6, 10.1) * (1 - seg(t, 12, 12.4)) }}>↑ Attendance trending up <small>sample</small></div>
        <div className="float f-left2" style={{ opacity: seg(t, 13.4, 13.9), transform: `translateY(${(1 - easeOut(seg(t, 13.4, 13.9))) * 20}px)` }}>🔔 New offer published</div>
      </div>
    </div>
  );
}
