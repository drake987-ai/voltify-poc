import { ArrowDown } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { BRANDS, type Brand } from '@/adapters';
import { Card } from '@/components/ui/Card';
import type { HubFrame, HubRun } from '@/eval/hub';
import { formatNumber } from '@/lib/format';
import { formatClock } from '@/lib/timelineSeries';
import { formatJson } from './format';

const Json = ({ text, label }: { text: string; label: string }) => (
  <pre
    tabIndex={0}
    aria-label={label}
    className="max-h-72 overflow-auto rounded-lg bg-surface-2 p-3 text-[11px] leading-snug text-text focus-visible:ring-2 focus-visible:ring-accent"
  >
    <code>{text}</code>
  </pre>
);

interface FeedCardsProps {
  run: HubRun;
  /** The latest message of each brand at the moment being played (null before its first). */
  frames: Record<Brand, HubFrame | null>;
}

/** Per brand: the payload as the vendor sent it, and the canonical telemetry the adapter made of it. */
export function FeedCards({ run, frames }: FeedCardsProps) {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage ?? 'vi';
  return (
    <div className="grid gap-4 xl:grid-cols-3">
      {BRANDS.map((b) => {
        const s = run.streams[b];
        const f = frames[b];
        return (
          <Card key={b} className="min-w-0">
            <h3 className="text-base font-semibold">{t(`brands.${b}`)}</h3>
            <p className="mt-1 text-xs text-muted">
              {t('hub.feeds.cadence', { seconds: s.intervalS })} · {t('hub.feeds.size', { bytes: formatNumber(s.meanBytes, lang, 0) })}
            </p>
            <p className="mt-1 text-xs text-muted">{t(`hub.feeds.shape.${b}`)}</p>

            <p className="mt-3 text-xs font-semibold text-muted">
              {t('hub.feeds.raw')} {f ? `· ${t('hub.feeds.last', { time: formatClock(f.tS) })}` : ''}
            </p>
            {f ? <Json text={formatJson(f.raw)} label={t('hub.feeds.rawAria', { brand: t(`brands.${b}`) })} /> : <p className="mt-1 text-sm text-muted">{t('hub.feeds.none')}</p>}

            <p className="my-2 flex items-center justify-center gap-2 text-xs font-semibold text-accent" aria-hidden>
              <ArrowDown className="size-4" />
              {t('hub.feeds.adapterArrow')}
            </p>

            <p className="text-xs font-semibold text-muted">{t('hub.feeds.canonical')}</p>
            {f ? (
              <Json text={formatJson(f.telemetry)} label={t('hub.feeds.canonicalAria', { brand: t(`brands.${b}`) })} />
            ) : (
              <p className="mt-1 text-sm text-muted">{t('hub.feeds.none')}</p>
            )}
          </Card>
        );
      })}
    </div>
  );
}
