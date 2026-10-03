import type { ComponentProps } from 'react';

export function Card({ className = '', ...props }: ComponentProps<'div'>) {
  return (
    <div
      className={`rounded-xl border border-border bg-surface p-4 ${className}`}
      {...props}
    />
  );
}
