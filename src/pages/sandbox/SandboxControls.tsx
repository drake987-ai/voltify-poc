import { RotateCcw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { BRANDS, type Brand } from '@/adapters';
import { Card } from '@/components/ui/Card';
import { Select } from '@/components/ui/Select';
import { formatNumber } from '@/lib/format';
import { SliderField } from './SliderField';
import {
  DEFAULT_SANDBOX,
  PRESET_IDS,
  SANDBOX_DURATIONS_MIN,
  SANDBOX_RANGES,
  SANDBOX_SHORT_SEVERITIES,
  applyPreset,
  clamp,
  type PresetId,
  type SandboxParams,
} from './scenario';

interface SandboxControlsProps {
  params: SandboxParams;
  onChange: (next: SandboxParams) => void;
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="min-w-0 space-y-4 rounded-xl border border-border bg-surface-2 p-3">
      <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-accent">{title}</legend>
      {children}
    </fieldset>
  );
}

/** The scenario builder: presets for the scenarios of the brief, then a slider for every cause of heat. */
export function SandboxControls({ params, onChange }: SandboxControlsProps) {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage ?? 'vi';
  const R = SANDBOX_RANGES;
  const set = (patch: Partial<SandboxParams>) => onChange({ ...params, ...patch });
  const chip = 'rounded-full border border-border px-3 py-1 text-xs font-semibold text-muted transition-colors hover:border-accent hover:text-accent';

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-base font-semibold">{t('sandbox.controls.title')}</h2>
          <p className="mt-1 max-w-3xl text-sm leading-relaxed text-muted">{t('sandbox.controls.intro')}</p>
        </div>
        <button
          type="button"
          onClick={() => onChange({ ...DEFAULT_SANDBOX, seed: params.seed, brand: params.brand, intervention: params.intervention })}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface-2 px-2.5 py-1 text-xs font-medium transition-colors hover:border-accent hover:text-accent"
        >
          <RotateCcw aria-hidden className="size-3.5" />
          {t('sandbox.controls.reset')}
        </button>
      </div>

      <div className="mt-3" role="group" aria-label={t('sandbox.presets.label')}>
        <p className="text-xs font-medium text-muted">{t('sandbox.presets.label')}</p>
        <div className="mt-1.5 flex flex-wrap gap-2">
          {PRESET_IDS.map((id: PresetId) => (
            <button key={id} type="button" className={chip} onClick={() => onChange(applyPreset(id, params))}>
              {t(`sandbox.presets.items.${id}`)}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Group title={t('sandbox.groups.weather')}>
          <SliderField label={t('sandbox.fields.ambientPeakC')} hint={t('sandbox.hints.ambientPeakC')} value={params.ambientPeakC} {...R.ambientPeakC} unit="°C" onChange={(v) => set({ ambientPeakC: v })} />
          <SliderField label={t('sandbox.fields.coolingScale')} hint={t('sandbox.hints.coolingScale')} value={params.coolingScale} {...R.coolingScale} format={(v) => formatNumber(v, lang, 2)} unit="×" onChange={(v) => set({ coolingScale: v })} />
          <SliderField label={t('sandbox.fields.startWarmC')} hint={t('sandbox.hints.startWarmC')} value={params.startWarmC} {...R.startWarmC} unit="°C" onChange={(v) => set({ startWarmC: v })} />
        </Group>

        <Group title={t('sandbox.groups.load')}>
          <SliderField label={t('sandbox.fields.payloadKg')} hint={t('sandbox.hints.payloadKg')} value={params.payloadKg} {...R.payloadKg} unit="kg" onChange={(v) => set({ payloadKg: v })} />
          <SliderField label={t('sandbox.fields.climbGradePct')} value={params.climbGradePct} {...R.climbGradePct} unit="%" onChange={(v) => set({ climbGradePct: v })} />
          <SliderField label={t('sandbox.fields.climbDutyPct')} hint={t('sandbox.hints.climbDutyPct')} value={params.climbDutyPct} {...R.climbDutyPct} unit="%" onChange={(v) => set({ climbDutyPct: v })} />
          <SliderField label={t('sandbox.fields.speedScale')} value={params.speedScale} {...R.speedScale} format={(v) => formatNumber(v, lang, 2)} unit="×" onChange={(v) => set({ speedScale: v })} />
        </Group>

        <Group title={t('sandbox.groups.pack')}>
          <SliderField label={t('sandbox.fields.sohPct')} hint={t('sandbox.hints.sohPct')} value={params.sohPct} {...R.sohPct} unit="%" onChange={(v) => set({ sohPct: v })} />
          <Select
            label={t('sandbox.fields.brand')}
            value={params.brand}
            onChange={(brand: Brand) => set({ brand })}
            options={BRANDS.map((b) => ({ value: b, label: t(`brands.${b}`) }))}
          />
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={params.weakCell}
              onChange={(e) => set({ weakCell: e.target.checked })}
              className="mt-0.5 size-4 accent-[var(--c-accent)]"
            />
            <span>
              {t('sandbox.fields.weakCell')}
              <span className="block text-[11px] leading-snug text-muted">{t('sandbox.hints.weakCell')}</span>
            </span>
          </label>
        </Group>

        <Group title={t('sandbox.groups.fault')}>
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={params.short.on}
              onChange={(e) => set({ short: { ...params.short, on: e.target.checked } })}
              className="mt-0.5 size-4 accent-[var(--c-accent)]"
            />
            <span>
              {t('sandbox.fields.shortOn')}
              <span className="block text-[11px] leading-snug text-muted">{t('sandbox.hints.shortOn')}</span>
            </span>
          </label>
          <div className={params.short.on ? 'space-y-4' : 'pointer-events-none space-y-4 opacity-50'} aria-disabled={!params.short.on}>
            <SliderField
              label={t('sandbox.fields.onsetMin')}
              value={clamp(params.short.onsetMin, R.onsetMin.min, R.onsetMin.max)}
              {...R.onsetMin}
              unit={t('sandbox.units.min')}
              onChange={(v) => set({ short: { ...params.short, onsetMin: v } })}
            />
            <Select
              label={t('sandbox.fields.severity')}
              value={params.short.severity}
              onChange={(severity) => set({ short: { ...params.short, severity } })}
              options={SANDBOX_SHORT_SEVERITIES.map((s) => ({ value: s, label: t(`sandbox.severities.${s}`) }))}
            />
          </div>
        </Group>
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-3">
        <Select
          label={t('sandbox.fields.intervention')}
          value={params.intervention}
          onChange={(intervention) => set({ intervention })}
          options={[
            { value: 'full', label: t('ab.interventions.full') },
            { value: 'derateOnly', label: t('ab.interventions.derateOnly') },
          ]}
        />
        <Select
          label={t('sandbox.fields.duration')}
          value={String(params.durationMin) as `${(typeof SANDBOX_DURATIONS_MIN)[number]}`}
          onChange={(v) => set({ durationMin: Number(v) as SandboxParams['durationMin'] })}
          options={SANDBOX_DURATIONS_MIN.map((m) => ({ value: String(m) as `${typeof m}`, label: t('sandbox.durationOption', { minutes: m }) }))}
        />
        <div className="min-w-0">
          <label htmlFor="sandbox-seed" className="mb-1 block text-xs font-medium text-muted">
            {t('sandbox.fields.seed')}
          </label>
          <input
            id="sandbox-seed"
            type="number"
            min={R.seed.min}
            max={R.seed.max}
            step={1}
            value={params.seed}
            onChange={(e) => {
              const n = Number(e.target.value);
              if (Number.isFinite(n)) set({ seed: Math.round(clamp(n, R.seed.min, R.seed.max)) });
            }}
            className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-text outline-none focus-visible:ring-2 focus-visible:ring-accent"
          />
          <p className="mt-0.5 text-[11px] leading-snug text-muted">{t('sandbox.hints.seed')}</p>
        </div>
      </div>
    </Card>
  );
}
