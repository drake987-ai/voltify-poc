import type { ReactNode } from 'react';

/** A labelled figure with an optional one-line explanation underneath. */
export function Stat({ label, value, hint, tone = 'text' }: { label: string; value: ReactNode; hint?: string; tone?: 'text' | 'accent' | 'danger' }) {
  const toneClass = tone === 'accent' ? 'text-accent' : tone === 'danger' ? 'text-risk-danger' : 'text-text';
  return (
    <div className="min-w-0 rounded-xl border border-border bg-surface p-3">
      <p className="text-xs font-medium text-muted">{label}</p>
      <p className={`mt-1 truncate text-xl font-semibold tracking-tight ${toneClass}`}>{value}</p>
      {hint ? <p className="mt-1 text-xs leading-snug text-muted">{hint}</p> : null}
    </div>
  );
}
