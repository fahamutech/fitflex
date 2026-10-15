import type { ReactNode } from 'react';
import { reveal } from './timeline';

export function SceneCopy({ t, kicker, headline, points, note, children }: { t: number; kicker: string; headline: string; points?: readonly string[]; note?: string; children?: ReactNode }) {
  return (
    <div className="copy">
      <div className="kicker" style={reveal(t, 0.2)}><i />{kicker}</div>
      <h2 style={reveal(t, 0.4, 0.8, 30)}>{headline}</h2>
      {points && (
        <ul>
          {points.map((p, i) => (
            <li key={p} style={reveal(t, 1.2 + i * 0.5)}><i />{p}</li>
          ))}
        </ul>
      )}
      {children}
      {note && <p className="note" style={reveal(t, 1.5)}>{note}</p>}
    </div>
  );
}
