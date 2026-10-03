import { Play } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Card } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/PageHeader';
import { stepOffsetS, STORY_STEPS, STORY_TOTAL_S } from '@/story/steps';
import { useStoryStore } from '@/story/store';
import { formatClock } from '@/lib/timelineSeries';

export default function StoryPage() {
  const { t } = useTranslation();
  const start = useStoryStore((s) => s.start);
  const goTo = useStoryStore((s) => s.goTo);

  return (
    <>
      <PageHeader page="story" dataSource={{ kind: 'simulated' }} />
      <div className="space-y-4">
        <Card className="border-accent/40">
          <h2 className="text-lg font-semibold tracking-tight">{t('story.intro.title', { minutes: Math.round(STORY_TOTAL_S / 60) })}</h2>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed">{t('story.intro.body')}</p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={start}
              className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-fg transition-opacity hover:opacity-90"
            >
              <Play aria-hidden className="size-4" />
              {t('story.intro.start')}
            </button>
            <Link to="/sandbox" className="text-sm font-medium text-accent underline">
              {t('story.intro.sandbox')}
            </Link>
          </div>
          <p className="mt-3 max-w-3xl text-xs leading-snug text-muted">{t('story.intro.repeatable')}</p>
        </Card>

        <Card>
          <h2 className="text-base font-semibold">{t('story.intro.stepsTitle')}</h2>
          <ol className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {STORY_STEPS.map((s, i) => (
              <li key={s.id} className="rounded-xl border border-border bg-surface-2 p-3">
                <p className="text-xs font-semibold text-accent">
                  {t('story.steps.screen', { n: s.screen })} · {formatClock(stepOffsetS(i))}
                </p>
                <p className="mt-1 text-sm font-semibold">{t(`story.steps.${s.id}.name`)}</p>
                <p className="mt-1 text-sm leading-snug text-muted">{t(`story.steps.${s.id}.what`)}</p>
                <button type="button" onClick={() => goTo(i)} className="mt-2 text-xs font-medium text-accent underline">
                  {t('story.intro.startHere')}
                </button>
              </li>
            ))}
          </ol>
        </Card>
      </div>
    </>
  );
}
