import { AbsoluteFill, Audio, Composition, continueRender, delayRender, staticFile, useCurrentFrame } from 'remotion';
import { useEffect, useState } from 'react';
import '../styles.css';
import { Showcase } from '../shared/Showcase';
import { DURATION, FPS } from '../shared/timeline';
import { AUDIO } from '../shared/content';

/** Deterministic: time is derived only from the frame number. Independent of the web player. */
const Video = () => {
  const frame = useCurrentFrame();
  const [h] = useState(() => delayRender('fonts'));
  useEffect(() => {
    const faces = [400, 600, 800].map((w) => new FontFace('Inter', `url(${staticFile(`fonts/Inter-${w}.ttf`)})`, { weight: String(w) }));
    Promise.all(faces.map((f) => f.load())).then((l) => { l.forEach((f) => document.fonts.add(f)); continueRender(h); }).catch(() => continueRender(h));
  }, [h]);
  return (
    <AbsoluteFill>
      <Showcase t={frame / FPS} tall={false} />
      {AUDIO.music && <Audio src={staticFile(AUDIO.music)} volume={AUDIO.musicVolume} />}
      {AUDIO.voiceOver && <Audio src={staticFile(AUDIO.voiceOver)} />}
    </AbsoluteFill>
  );
};

export const RemotionRoot = () => (
  <Composition id="FitFlexShowcase" component={Video} durationInFrames={DURATION * FPS} fps={FPS} width={1920} height={1080} />
);
