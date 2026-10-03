import { useEffect, useId, useState, type ReactNode } from 'react';

interface NumberFieldProps {
  label: string;
  /** What the field means and why it has this default. */
  hint?: string;
  value: number;
  /** Called with every typed value that is a number (the caller clamps it). */
  onChange: (value: number) => void;
  min: number;
  max: number;
  step: number;
  /** Shown after the input (a unit). */
  suffix?: string;
  /** Shown under the input, e.g. the value written out in full. */
  echo?: ReactNode;
  /** Keep the label for screen readers only (the surrounding layout already names the field). */
  hideLabel?: boolean;
}

/** A number input that lets the user type freely and settles on the clamped value when they leave it. */
export function NumberField({ label, hint, value, onChange, min, max, step, suffix, echo, hideLabel }: NumberFieldProps) {
  const id = useId();
  const [draft, setDraft] = useState(String(value));

  // The value can change from outside (a reset): follow it unless it is what the user just typed.
  useEffect(() => {
    if (Number(draft) !== value) setDraft(String(value));
    // Only the outside value matters here.
  }, [value]);

  return (
    <div className="min-w-0">
      <label htmlFor={id} className={hideLabel ? 'sr-only' : 'block text-xs font-medium text-text'}>
        {label}
      </label>
      <div className={`${hideLabel ? '' : 'mt-1 '}flex items-center gap-2`}>
        <input
          id={id}
          type="number"
          inputMode="decimal"
          min={min}
          max={max}
          step={step}
          value={draft}
          aria-describedby={hint ? `${id}-hint` : undefined}
          onChange={(e) => {
            setDraft(e.target.value);
            const n = e.target.value === '' ? Number.NaN : Number(e.target.value);
            if (Number.isFinite(n)) onChange(n);
          }}
          onBlur={() => setDraft(String(value))}
          className="w-full min-w-0 rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-sm text-text outline-none focus-visible:ring-2 focus-visible:ring-accent"
        />
        {suffix ? <span className="shrink-0 text-xs text-muted">{suffix}</span> : null}
      </div>
      {echo ? <p className="mt-0.5 text-[11px] text-muted">{echo}</p> : null}
      {hint ? (
        <p id={`${id}-hint`} className="mt-0.5 text-[11px] leading-snug text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
