import { useId, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Brand } from '@/adapters';
import { Card } from '@/components/ui/Card';
import { Select } from '@/components/ui/Select';
import { formatJson } from './format';
import { SAMPLE_IDS, judge, sampleText, type SampleId } from './verdict';

/** Paste or pick a payload and watch the adapter recognise the brand, convert it, or refuse it with a reason. */
export function TryIt({ rawByBrand }: { rawByBrand: Record<Brand, unknown> }) {
  const { t } = useTranslation();
  const areaId = useId();
  const [sample, setSample] = useState<SampleId>('B');
  const [text, setText] = useState(() => sampleText('B', rawByBrand));
  const verdict = useMemo(() => judge(text), [text]);

  const pick = (id: SampleId) => {
    setSample(id);
    setText(sampleText(id, rawByBrand));
  };

  return (
    <Card>
      <h2 className="text-base font-semibold">{t('hub.try.title')}</h2>
      <p className="mt-1 max-w-3xl text-sm leading-relaxed text-muted">{t('hub.try.intro')}</p>

      <div className="mt-3 grid gap-4 lg:grid-cols-2">
        <div className="min-w-0">
          <div className="max-w-xs">
            <Select
              label={t('hub.try.sample')}
              value={sample}
              onChange={pick}
              options={SAMPLE_IDS.map((id) => ({
                value: id,
                label: id === 'A' || id === 'B' || id === 'C' ? t(`brands.${id}`) : t(`hub.try.samples.${id}`),
              }))}
            />
          </div>
          <label htmlFor={areaId} className="mb-1 mt-3 block text-xs font-medium text-muted">
            {t('hub.try.input')}
          </label>
          <textarea
            id={areaId}
            value={text}
            onChange={(e) => setText(e.target.value)}
            spellCheck={false}
            rows={14}
            className="w-full rounded-lg border border-border bg-surface-2 p-3 font-mono text-[11px] leading-snug text-text outline-none focus-visible:ring-2 focus-visible:ring-accent"
          />
        </div>

        <div className="min-w-0" aria-live="polite">
          <p className="mb-1 text-xs font-medium text-muted">{t('hub.try.result')}</p>
          {verdict.ok ? (
            <>
              <p className="mb-2 inline-flex items-center gap-2 rounded-full border border-risk-safe/50 bg-risk-safe/10 px-3 py-1 text-sm font-semibold text-risk-safe">
                ✓ {t('hub.try.recognised', { brand: t(`brands.${verdict.brand}`) })}
              </p>
              <pre tabIndex={0} className="max-h-80 overflow-auto rounded-lg bg-surface-2 p-3 text-[11px] leading-snug">
                <code>{formatJson(verdict.telemetry)}</code>
              </pre>
            </>
          ) : (
            <div role="status" className="rounded-lg border border-risk-warning/50 bg-risk-warning/10 p-3 text-sm">
              <p className="font-semibold text-risk-warning">✕ {t(`hub.try.errors.${verdict.code}.title`)}</p>
              <p className="mt-1 leading-relaxed">{t(`hub.try.errors.${verdict.code}.body`)}</p>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
