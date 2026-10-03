import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card } from '@/components/ui/Card';
import { computeRoi, defaultRoiInputs, type RoiInputs } from '@/business/roi';
import type { CabinetAB } from '@/eval/cabinet';
import type { PreventionMeasure } from '@/fleet';
import type { AsyncState } from '@/hooks/useAsync';
import { InputsCard } from './InputsCard';
import { LeversCard } from './LeversCard';
import { scenarioOf, type Overrides } from './levers';
import { MeasuredCard, measuredFrom } from './MeasuredCard';
import { ResultsTable } from './ResultsTable';
import { SensitivityCard } from './SensitivityCard';
import type { TraceId } from './trace';

interface RoiViewProps {
  cabinet: AsyncState<CabinetAB>;
  prevention: AsyncState<PreventionMeasure>;
}

/** The calculator: inputs and levers on the left, both cases and the steps behind each figure on the right. */
export function RoiView({ cabinet, prevention }: RoiViewProps) {
  const { t } = useTranslation();
  const [inputs, setInputs] = useState<RoiInputs>(defaultRoiInputs);
  const [overrides, setOverrides] = useState<Overrides>({});
  const [open, setOpen] = useState<TraceId | null>('net');

  const measured = useMemo(() => measuredFrom(cabinet, prevention), [cabinet, prevention]);
  const results = useMemo(
    () => ({
      careful: computeRoi(inputs, scenarioOf('careful', inputs, measured, overrides)),
      target: computeRoi(inputs, scenarioOf('target', inputs, measured, overrides)),
    }),
    [inputs, measured, overrides],
  );

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
      <div className="min-w-0 space-y-4">
        <InputsCard inputs={inputs} onChange={setInputs} />
        <MeasuredCard cabinet={cabinet} prevention={prevention} />
      </div>

      <div className="min-w-0 space-y-4">
        <LeversCard inputs={inputs} measured={measured} overrides={overrides} onChange={setOverrides} />
        <ResultsTable results={results} open={open} onToggle={(id) => setOpen(open === id ? null : id)} />
        <SensitivityCard inputs={inputs} careful={results.careful} target={results.target} />
        <Card className="border-accent/40">
          <h2 className="text-base font-semibold">{t('roi.limits.title')}</h2>
          <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-muted">
            <li>{t('roi.limits.illustrative')}</li>
            <li>{t('roi.limits.target')}</li>
            <li>{t('roi.limits.measured')}</li>
            <li>{t('roi.limits.noPromise')}</li>
          </ul>
        </Card>
      </div>
    </div>
  );
}
