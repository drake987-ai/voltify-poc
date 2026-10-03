import { useId } from 'react';

interface SliderFieldProps {
  label: string;
  hint?: string;
  value: number;
  min: number;
  max: number;
  step: number;
  /** Text shown next to the value, e.g. "°C". */
  unit?: string;
  /** How the current value is written (language-aware number formatting). */
  format?: (v: number) => string;
  onChange: (v: number) => void;
}

/** A labelled slider with its value written beside it and the full range available by keyboard. */
export function SliderField({ label, hint, value, min, max, step, unit, format, onChange }: SliderFieldProps) {
  const id = useId();
  return (
    <div className="min-w-0">
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={id} className="text-xs font-medium text-text">
          {label}
        </label>
        <output htmlFor={id} className="text-sm font-semibold">
          {format ? format(value) : value}
          {unit ? <span className="ml-0.5 text-xs font-normal text-muted">{unit}</span> : null}
        </output>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-describedby={hint ? `${id}-hint` : undefined}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-1 h-1.5 w-full cursor-pointer accent-[var(--c-accent)]"
      />
      {hint ? (
        <p id={`${id}-hint`} className="mt-0.5 text-[11px] leading-snug text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
