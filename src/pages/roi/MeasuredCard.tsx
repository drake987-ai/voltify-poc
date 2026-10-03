import { useTranslation } from 'react-i18next';
import { Card } from '@/components/ui/Card';
import type { AsyncState } from '@/hooks/useAsync';
import type { CabinetAB } from '@/eval/cabinet';
import type { PreventionMeasure } from '@/fleet';
import type { Measured } from './levers';
import { useFormat } from './useFormat';

/** The simulation measurements that feed the careful case, with where each came from. */
export function MeasuredCard({
  cabinet,
  prevention,
}: {
  cabinet: AsyncState<CabinetAB>;
  prevention: AsyncState<PreventionMeasure>;
}) {
  const { t } = useTranslation();
  const f = useFormat();

  const row = (title: string, body: string | null, state: AsyncState<unknown>) => (
    <li className="rounded-lg border border-border bg-surface-2 p-3">
      <p className="text-sm font-semibold">{title}</p>
      {state.status === 'loading' ? (
        <p className="mt-1 text-xs text-muted" aria-busy="true">
          {t('roi.measured.pending')}
        </p>
      ) : state.status === 'error' ? (
        <p className="mt-1 text-xs text-risk-danger" role="alert">
          {t('state.error', { message: state.message })}
        </p>
      ) : (
        <p className="mt-1 text-xs leading-snug text-muted">{body}</p>
      )}
    </li>
  );

  const drop = cabinet.status === 'ready' ? cabinet.data.summaryWithout.meanTempC - cabinet.data.summaryWith.meanTempC : null;
  const p = prevention.status === 'ready' ? prevention.data : null;

  return (
    <Card>
      <h2 className="text-base font-semibold">{t('roi.measured.title')}</h2>
      <p className="mt-1 text-xs leading-snug text-muted">{t('roi.measured.intro')}</p>
      <ul className="mt-3 space-y-3">
        {row(
          t('roi.measured.cooling.title'),
          drop === null
            ? null
            : t('roi.measured.cooling.body', {
                drop: f.num(drop, 1),
                without: f.num(cabinet.status === 'ready' ? cabinet.data.summaryWithout.meanTempC : 0, 1),
                withCut: f.num(cabinet.status === 'ready' ? cabinet.data.summaryWith.meanTempC : 0, 1),
              }),
          cabinet,
        )}
        {row(
          t('roi.measured.prevention.title'),
          p === null
            ? null
            : p.rate === null
              ? t('roi.measured.prevention.none', { packs: p.packs, minutes: p.minutes })
              : t('roi.measured.prevention.body', {
                  prevented: p.prevented,
                  trips: p.baselineTrips,
                  packs: p.packs,
                  minutes: p.minutes,
                  rate: f.num(p.rate * 100, 0),
                }),
          prevention,
        )}
      </ul>
      <p className="mt-3 text-xs leading-snug text-muted">{t('roi.measured.caveat')}</p>
    </Card>
  );
}

/** What the careful case can use, from the two measurements (null while one is still running or failed). */
export function measuredFrom(cabinet: AsyncState<CabinetAB>, prevention: AsyncState<PreventionMeasure>): Measured {
  return {
    chargeTempDropC:
      cabinet.status === 'ready' ? cabinet.data.summaryWithout.meanTempC - cabinet.data.summaryWith.meanTempC : null,
    preventionRate: prevention.status === 'ready' ? prevention.data.rate : null,
  };
}
