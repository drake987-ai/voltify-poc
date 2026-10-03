import { useTranslation } from 'react-i18next';
import { Card } from '@/components/ui/Card';
import { formatClock } from '@/lib/timelineSeries';
import { formatPayload, type CommandChannel, type CommandEntry } from './commands';

const CHANNEL_STYLE: Record<CommandChannel, string> = {
  platform: 'border-accent/50 text-accent',
  vehicle: 'border-risk-warning/50 text-risk-warning',
  app: 'border-risk-watch/50 text-risk-watch',
  station: 'border-risk-safe/50 text-risk-safe',
  cabinet: 'border-accent/50 text-accent',
};

interface CommandLogProps {
  title: string;
  entries: readonly CommandEntry[];
  /** Entries with a later time are not shown yet. */
  tS: number;
}

/** Messages the platform has sent so far, each with an example of its payload (simulated). */
export function CommandLog({ title, entries, tS }: CommandLogProps) {
  const { t } = useTranslation();
  const shown = entries.filter((e) => e.tS <= tS);
  return (
    <Card>
      <h2 className="text-base font-semibold">{title}</h2>
      <p className="mt-1 text-xs leading-snug text-muted">{t('intervention.log.note')}</p>
      {shown.length === 0 ? (
        <p className="mt-3 text-sm text-muted">{t('intervention.log.empty')}</p>
      ) : (
        <ol className="mt-3 max-h-[26rem] space-y-3 overflow-y-auto pr-1">
          {shown.map((e, i) => (
            <li key={`${e.kind}-${e.tS}-${i}`} className="rounded-lg border border-border bg-surface-2 p-3">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="font-semibold">{formatClock(e.tS)}</span>
                <span className={`rounded-md border px-1.5 py-0.5 text-[11px] font-semibold ${CHANNEL_STYLE[e.channel]}`}>
                  {t(`intervention.log.channels.${e.channel}`)}
                </span>
                <span className="min-w-0 text-text">{t(`intervention.log.kinds.${e.kind}`)}</span>
              </div>
              <pre className="mt-2 overflow-x-auto rounded-md bg-surface p-2 text-[11px] leading-snug text-muted">
                <code>{formatPayload(e.payload)}</code>
              </pre>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}
