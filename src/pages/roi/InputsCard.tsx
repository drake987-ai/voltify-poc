import { RotateCcw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Card } from '@/components/ui/Card';
import {
  ROI_FIELDS,
  ROI_INPUT_IDS,
  ROI_PRIMARY_IDS,
  defaultRoiInputs,
  sanitizeInput,
  type RoiInputId,
  type RoiInputs,
  type RoiUnit,
} from '@/business/roi';
import { NumberField } from './NumberField';
import { useFormat } from './useFormat';

const ADVANCED_IDS = ROI_INPUT_IDS.filter((id) => !ROI_PRIMARY_IDS.includes(id));

interface InputsCardProps {
  inputs: RoiInputs;
  onChange: (next: RoiInputs) => void;
}

/** The five inputs of the brief, then the assumptions behind the figures; every one editable. */
export function InputsCard({ inputs, onChange }: InputsCardProps) {
  const { t } = useTranslation();
  const f = useFormat();

  const unitLabel = (unit: RoiUnit): string | undefined => {
    switch (unit) {
      case 'count':
        return t('roi.units.packs');
      case 'VND':
        return '₫';
      case 'degC':
        return '°C';
      case 'efcPerDay':
        return t('roi.units.cyclesPerDay');
      case 'kWh':
        return 'kWh';
      case 'VND/kWh':
        return t('roi.units.vndPerKwh');
      case 'perThousand':
        return t('roi.units.perThousand');
      case 'fraction':
        return undefined;
    }
  };

  const field = (id: RoiInputId) => {
    const meta = ROI_FIELDS[id];
    const setValue = (raw: number) => {
      const v = sanitizeInput(id, raw);
      if (v !== null) onChange({ ...inputs, [id]: v });
    };
    return (
      <NumberField
        key={id}
        label={t(`roi.fields.${id}.label`)}
        hint={t(`roi.fields.${id}.why`)}
        value={inputs[id]}
        onChange={setValue}
        min={meta.min}
        max={meta.max}
        step={meta.step}
        suffix={unitLabel(meta.unit)}
        echo={meta.unit === 'VND' || meta.unit === 'count' ? f.num(inputs[id], 0) : undefined}
      />
    );
  };

  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-base font-semibold">{t('roi.inputs.title')}</h2>
        <button
          type="button"
          onClick={() => onChange(defaultRoiInputs())}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface-2 px-2.5 py-1 text-xs font-medium transition-colors hover:border-accent hover:text-accent"
        >
          <RotateCcw aria-hidden className="size-3.5" />
          {t('roi.inputs.reset')}
        </button>
      </div>
      <p className="mt-1 text-xs leading-snug text-muted">{t('roi.inputs.intro')}</p>

      <div className="mt-4 space-y-4">{ROI_PRIMARY_IDS.map(field)}</div>

      <details className="mt-5 rounded-lg border border-border bg-surface-2 p-3">
        <summary className="cursor-pointer text-sm font-semibold">{t('roi.inputs.advanced')}</summary>
        <div className="mt-4 space-y-4">{ADVANCED_IDS.map(field)}</div>
      </details>
    </Card>
  );
}
