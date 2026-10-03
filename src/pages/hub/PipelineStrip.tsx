import { ArrowRight, Brain, Database, Plug } from 'lucide-react';
import { useTranslation } from 'react-i18next';

const STEPS = [
  { id: 'sources', Icon: Database },
  { id: 'adapter', Icon: Plug },
  { id: 'schema', Icon: Database },
  { id: 'ai', Icon: Brain },
] as const;

/** The path of one message: vendor feeds, adapter, one schema, one AI. */
export function PipelineStrip() {
  const { t } = useTranslation();
  return (
    <ol className="flex flex-col gap-2 lg:flex-row lg:items-stretch" aria-label={t('hub.pipeline.title')}>
      {STEPS.map(({ id, Icon }, i) => (
        <li key={id} className="flex min-w-0 flex-1 items-stretch gap-2">
          <div className="min-w-0 flex-1 rounded-xl border border-border bg-surface p-3">
            <p className="flex items-center gap-2 text-sm font-semibold">
              <Icon aria-hidden className="size-4 text-accent" />
              {t(`hub.pipeline.steps.${id}.title`)}
            </p>
            <p className="mt-1 text-xs leading-snug text-muted">{t(`hub.pipeline.steps.${id}.desc`)}</p>
          </div>
          {i < STEPS.length - 1 ? <ArrowRight aria-hidden className="hidden size-5 shrink-0 self-center text-muted lg:block" /> : null}
        </li>
      ))}
    </ol>
  );
}
