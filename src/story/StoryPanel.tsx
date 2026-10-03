import { ChevronLeft, ChevronRight, Pause, Play, RotateCcw, X } from 'lucide-react';
import { useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { formatClock } from '@/lib/timelineSeries';
import { useFormat } from '@/pages/roi/useFormat';
import { prepareStep, runBeat } from './actions';
import { totalElapsedS } from './clock';
import { formatFacts } from './facts';
import { BEAT_IDS, STORY_STEPS, STORY_TOTAL_S, beatIndex } from './steps';
import { useStoryStore } from './store';
import { useStoryNumbers } from './useStoryFacts';

const button =
  'inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface-2 px-2.5 py-1.5 text-sm font-medium text-text transition-colors hover:border-accent hover:text-accent';

/**
 * The guided demo: a strip docked under the screen being shown. It moves from screen to screen on its
 * own clock, puts each screen in its starting state, and shows the caption that belongs to the moment.
 */
export function StoryPanel() {
  const { t } = useTranslation();
  const f = useFormat();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { status, step, elapsedS, runId } = useStoryStore();
  const store = useStoryStore.getState;
  const active = status === 'playing' || status === 'paused';
  const numbers = useStoryNumbers(status !== 'idle');
  const facts = useMemo(() => formatFacts(numbers, f), [numbers, f]);
  const expectedPath = useRef<string>('');

  // The clock: one tick every 100 ms of real time, however long the browser really took.
  useEffect(() => {
    if (status !== 'playing') return;
    let last = performance.now();
    const id = setInterval(() => {
      const now = performance.now();
      store().tick((now - last) / 1000);
      last = now;
    }, 100);
    return () => clearInterval(id);
  }, [status, store]);

  // Entering a step: show its screen and put it in its starting state.
  useEffect(() => {
    if (status === 'idle' || status === 'ended') return;
    const def = STORY_STEPS[step];
    expectedPath.current = def.path;
    prepareStep(def.id);
    navigate(def.path);
  }, [step, runId, status === 'idle']);

  // A caption coming up.
  const beat = beatIndex(step, elapsedS);
  useEffect(() => {
    if (status === 'playing') runBeat(STORY_STEPS[step].id, BEAT_IDS[beat]);
  }, [step, beat, runId, status === 'playing']);

  // The viewer going somewhere else by hand pauses the story instead of fighting them.
  useEffect(() => {
    if (status === 'playing' && expectedPath.current && !pathname.startsWith(expectedPath.current)) store().pause();
  }, [pathname]);

  // Escape leaves the story.
  useEffect(() => {
    if (status === 'idle') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') store().stop();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [status, store]);

  if (status === 'idle') return null;

  const def = STORY_STEPS[step];
  const total = totalElapsedS({ status, step, elapsedS });
  const caption = t(`story.beats.${def.id}.${BEAT_IDS[beat]}`, facts);

  return (
    <section aria-label={t('story.panel.aria')} className="shrink-0 border-t-2 border-accent bg-surface px-4 py-3">
      {status === 'ended' ? (
        <div className="mx-auto max-w-5xl">
          <h2 className="text-base font-semibold">{t('story.end.title')}</h2>
          <p className="mt-1 text-sm leading-relaxed">{t('story.end.body')}</p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-xs leading-snug text-muted">
            {(['simulated', 'targets', 'phases'] as const).map((k) => (
              <li key={k}>{t(`story.end.limits.${k}`)}</li>
            ))}
          </ul>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button type="button" className={button} onClick={() => store().toggle()}>
              <RotateCcw aria-hidden className="size-4" />
              {t('story.panel.replay')}
            </button>
            <Link to="/evidence" onClick={() => store().stop()} className={button}>
              {t('story.end.evidence')}
            </Link>
            <Link to="/sandbox" onClick={() => store().stop()} className={button}>
              {t('story.end.sandbox')}
            </Link>
            <Link to="/market" onClick={() => store().stop()} className={button}>
              {t('story.end.market')}
            </Link>
            <button type="button" className={`${button} ml-auto`} onClick={() => store().stop()}>
              <X aria-hidden className="size-4" />
              {t('story.panel.exit')}
            </button>
          </div>
        </div>
      ) : (
        <div className="mx-auto max-w-5xl">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-accent">
              {t('story.panel.step', { current: step + 1, total: STORY_STEPS.length })} · {t(`story.steps.${def.id}.name`)}
            </p>
            <ol className="flex gap-1.5" aria-label={t('story.panel.steps')}>
              {STORY_STEPS.map((s, i) => (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => store().goTo(i)}
                    aria-current={i === step ? 'step' : undefined}
                    title={t(`story.steps.${s.id}.name`)}
                    className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${
                      i === step ? 'border-accent bg-accent/15 text-accent' : 'border-border text-muted hover:text-text'
                    }`}
                  >
                    {t('story.steps.screen', { n: s.screen })}
                  </button>
                </li>
              ))}
            </ol>
            <p className="ml-auto text-xs text-muted">
              {t('story.panel.time', { elapsed: formatClock(total), total: formatClock(STORY_TOTAL_S) })}
            </p>
          </div>

          <progress className="mt-2 block h-1.5 w-full accent-[var(--c-accent)]" value={total} max={STORY_TOTAL_S} aria-label={t('story.panel.progress')} />

          <p className="mt-3 min-h-[3.25rem] text-base leading-snug" aria-live="polite">
            {caption}
          </p>

          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button type="button" className={button} onClick={() => store().prev()} aria-label={t('story.panel.prev')}>
              <ChevronLeft aria-hidden className="size-4" />
              {t('story.panel.prev')}
            </button>
            <button type="button" className={button} onClick={() => store().toggle()}>
              {active && status === 'playing' ? <Pause aria-hidden className="size-4" /> : <Play aria-hidden className="size-4" />}
              {status === 'playing' ? t('story.panel.pause') : t('story.panel.resume')}
            </button>
            <button type="button" className={button} onClick={() => store().next()} aria-label={t('story.panel.next')}>
              {t('story.panel.next')}
              <ChevronRight aria-hidden className="size-4" />
            </button>
            <button type="button" className={`${button} ml-auto`} onClick={() => store().stop()}>
              <X aria-hidden className="size-4" />
              {t('story.panel.exit')}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
