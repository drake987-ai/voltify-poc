import type { RiskModule } from '@/ai';

/**
 * Fixed colours for the four modules, the same in light and dark themes and chosen to
 * be told apart without relying on red/green. They are always shown next to the
 * module's name, never as the only cue.
 */
export const MODULE_COLORS: Record<RiskModule, string> = {
  thermal: '#f59e0b',
  voltage: '#38bdf8',
  overload: '#a78bfa',
  health: '#94a3b8',
};

export const MODULES: readonly RiskModule[] = ['thermal', 'voltage', 'overload', 'health'];
