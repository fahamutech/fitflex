import { useEffect, useMemo, useRef, useState } from 'react';
import { DURATION, SCENES, sceneAt } from '../shared/timeline';
import { Showcase, STAGE } from '../shared/Showcase';
import { AUDIO } from '../shared/content';

const usePrefersReduced = () => {
  const [r, setR] = useState(() => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches);
  useEffect(() => {
    const m = matchMedia('(prefers-reduced-motion: reduce)');
    const f = () => setR(m.matches);
    m.addEventListener('change', f);
    return () => m.removeEventListener('change', f);
  }, []);
  return r;
};

export function Player() {
  const reduced = usePrefersReduced();
  // ?t=12.5 opens paused at that second (handy for QA / deep links)
  const qt = useMemo(() => { const v = parseFloat(new URLSearchParams(location.search).get('t') ?? ''); return Number.isFinite(v) ? Math.min(DURATION - 0.001, Math.max(0, v)) : null; }, []);
  const [t, setT] = useState(qt ?? (reduced ? SCENES[0].end - 1 : 0));
  const [playing, setPlaying] = useState(qt === null && !reduced);
  const [box, setBox] = useState({ w: 1280, h: 720 });
  const vp = useRef<HTMLDivElement>(null);
  const audio = useRef<HTMLAudioElement>(null);
  const tRef = useRef(t);
  tRef.current = t;

  useEffect(() => {
    const el = vp.current!;
    const ro = new ResizeObserver(() => setBox({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setBox({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!playing) return;
    let raf = 0, last = performance.now();
    const loop = (now: number) => {
      const dt = (now - last) / 1000; last = now;
      const nt = tRef.current + dt;
      if (nt >= DURATION) { setT(DURATION - 0.001); setPlaying(false); return; }
      setT(nt);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [playing]);

  useEffect(() => {
    const a = audio.current;
    if (!a) return;
    a.volume = AUDIO.musicVolume;
    if (playing) a.play().catch(() => {}); else a.pause();
  }, [playing]);

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      if (e.code === 'Space') { e.preventDefault(); toggle(); }
    };
    addEventListener('keydown', k);
    return () => removeEventListener('keydown', k);
  });

  const tall = box.w / Math.max(1, box.h) < 0.95;
  const st = tall ? STAGE.tall : STAGE.wide;
  const scale = Math.min(box.w / st.w, box.h / st.h);
  const cur = sceneAt(t);

  const toggle = () => { if (t >= DURATION - 0.01) setT(0); setPlaying((p) => !p); };
  const replay = () => { setT(0); setPlaying(!reduced || true); if (audio.current) audio.current.currentTime = 0; };
  const goto = (s: number) => { setT(s + (reduced ? 0 : 0)); };
  const settle = useMemo(() => (id: string) => { const s = SCENES.find((x) => x.id === id)!; return s.start + (s.end - s.start) - 0.6; }, []);

  return (
    <div className="player">
      <div className="viewport" ref={vp} role="region" aria-label="FitFlex Africa product showcase">
        <div className="stage-box" style={{ width: st.w * scale, height: st.h * scale }}>
          <div style={{ transform: `scale(${scale})`, transformOrigin: 'top left', width: st.w, height: st.h }}>
            <Showcase t={t} tall={tall} interactive />
          </div>
        </div>
      </div>
      <div className="controls">
        <button onClick={toggle} aria-label={playing ? 'Pause' : 'Play'}>{playing ? '❚❚ Pause' : '▶ Play'}</button>
        <button onClick={replay} aria-label="Replay from start">↺ Replay</button>
        <input type="range" min={0} max={DURATION} step={0.05} value={t} aria-label="Timeline" onChange={(e) => { setPlaying(false); setT(+e.target.value); }} />
        <span className="time" aria-live="off">{t.toFixed(0)}s / {DURATION}s</span>
        <nav className="scenes-nav" aria-label="Scenes">
          {SCENES.map((s) => (
            <button key={s.id} aria-current={cur.id === s.id} onClick={() => { setPlaying(false); goto(reduced ? settle(s.id) : s.start); }}>{s.label}</button>
          ))}
        </nav>
        {reduced && <span className="time">Reduced motion: autoplay off — use the scene buttons or timeline.</span>}
      </div>
      {AUDIO.music && <audio ref={audio} src={import.meta.env.BASE_URL + AUDIO.music} loop />}
    </div>
  );
}
