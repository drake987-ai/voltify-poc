import { SHAPE_OF_LEVEL } from '@/components/map/hitTest';

const COLOR = ['var(--c-risk-safe)', 'var(--c-risk-watch)', 'var(--c-risk-warning)', 'var(--c-risk-danger)'];

/** The map marker of a risk level (0..3), for legends: the same shape and colour as on the map. */
export function LevelGlyph({ level, size = 16 }: { level: 0 | 1 | 2 | 3; size?: number }) {
  const shape = SHAPE_OF_LEVEL[level];
  const c = COLOR[level];
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden className="shrink-0">
      {shape === 'dot' ? <circle cx="8" cy="8" r="3.5" fill={c} opacity="0.8" /> : null}
      {shape === 'ring' ? <circle cx="8" cy="8" r="5" fill="none" stroke={c} strokeWidth="2.2" /> : null}
      {shape === 'triangle' ? <path d="M8 2 L14.5 13 L1.5 13 Z" fill={c} /> : null}
      {shape === 'diamond' ? <path d="M8 0.5 L15.5 8 L8 15.5 L0.5 8 Z" fill={c} stroke="var(--c-text)" strokeWidth="1" /> : null}
    </svg>
  );
}
