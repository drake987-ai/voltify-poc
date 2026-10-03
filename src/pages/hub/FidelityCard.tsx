import { useTranslation } from 'react-i18next';
import { BRANDS } from '@/adapters';
import { Card } from '@/components/ui/Card';
import type { HubFidelity, HubRun } from '@/eval/hub';
import { formatNumber } from '@/lib/format';

const ROWS: { id: keyof HubFidelity; unit: string; dp: number }[] = [
  { id: 'cellMv', unit: 'mV', dp: 2 },
  { id: 'coreTempC', unit: '°C', dp: 3 },
  { id: 'currentA', unit: 'A', dp: 3 },
  { id: 'socPct', unit: '%', dp: 3 },
];

/** What each format loses on the way, measured against the simulator's own sensor reading (validation only). */
export function FidelityCard({ run }: { run: HubRun }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage ?? 'vi';
  return (
    <Card>
      <h2 className="text-base font-semibold">{t('hub.fidelity.title')}</h2>
      <p className="mt-1 max-w-3xl text-sm leading-relaxed text-muted">{t('hub.fidelity.intro')}</p>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[34rem] border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-border text-xs text-muted">
              <th scope="col" className="py-2 pr-3 font-medium" />
              {BRANDS.map((b) => (
                <th key={b} scope="col" className="px-3 py-2 font-medium">
                  {t(`brands.${b}`)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ROWS.map((r) => (
              <tr key={r.id} className="border-b border-border/60">
                <th scope="row" className="py-2 pr-3 text-left text-xs font-medium text-muted">
                  {t(`hub.fidelity.rows.${r.id}`)}
                </th>
                {BRANDS.map((b) => {
                  const e = run.streams[b].fidelity[r.id];
                  return (
                    <td key={b} className="px-3 py-2">
                      {t('hub.fidelity.meanMax', {
                        mean: formatNumber(e.mean, lang, r.dp),
                        max: formatNumber(e.max, lang, r.dp),
                        unit: r.unit,
                      })}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs leading-snug text-muted">{t('hub.fidelity.note')}</p>
    </Card>
  );
}
