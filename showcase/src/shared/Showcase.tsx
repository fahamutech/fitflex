import { DURATION, SCENES, clamp, sceneAt, seg } from './timeline';
import { THEME } from './content';
import { Backdrop } from './ui';
import { IntroScene } from '../scenes/Intro';
import { OwnerScene } from '../scenes/Owner';
import { CustomerScene } from '../scenes/Customer';
import { TrainerScene } from '../scenes/Trainer';
import { EcosystemScene } from '../scenes/Ecosystem';

export const STAGE = { wide: { w: 1920, h: 1080 }, tall: { w: 1080, h: 1350 } };
const ACCENT: Record<string, string> = { intro: THEME.teal, owner: THEME.owner, customer: THEME.customer, trainer: THEME.trainer, ecosystem: THEME.teal };

/**
 * Pure function of time: <Showcase t={12.4} />. No internal timers, so the web player
 * and the Remotion renderer produce identical frames.
 */
export function Showcase({ t, tall = false, interactive = false }: { t: number; tall?: boolean; interactive?: boolean }) {
  const tt = clamp(t, 0, DURATION);
  const sc = sceneAt(tt);
  const local = tt - sc.start;
  const len = sc.end - sc.start;
  const FADE = 0.5;
  const env = Math.min(seg(local, 0, FADE), 1 - seg(local, len - FADE, len));
  const opacity = sc.id === 'intro' && local < FADE ? 1 : sc.id === 'ecosystem' && local > len - FADE ? 1 : env;
  const idx = SCENES.findIndex((s) => s.id === sc.id);
  const props = { t: local, tall };
  const { w, h } = tall ? STAGE.tall : STAGE.wide;
  return (
    <div className={'stage ' + (tall ? 'tall' : 'wide')} style={{ width: w, height: h, ['--acc' as string]: ACCENT[sc.id] }}>
      <Backdrop t={tt} accent={ACCENT[sc.id]} tall={tall} />
      <div className="scene-wrap" style={{ opacity, transform: `scale(${0.985 + 0.015 * opacity})` }}>
        {sc.id === 'intro' && <IntroScene {...props} />}
        {sc.id === 'owner' && <OwnerScene {...props} />}
        {sc.id === 'customer' && <CustomerScene {...props} />}
        {sc.id === 'trainer' && <TrainerScene {...props} />}
        {sc.id === 'ecosystem' && <EcosystemScene {...props} interactive={interactive} />}
      </div>
      <div className="stage-progress"><i style={{ width: `${(tt / DURATION) * 100}%` }} /></div>
      <span className="sr-only">{SCENES[idx].label}</span>
    </div>
  );
}
