import { useTranslation } from 'react-i18next';
import { BRANDS, CANONICAL_FIELDS, FIELD_MAP } from '@/adapters';
import { Card } from '@/components/ui/Card';

/** Field by field: where each canonical value is found in each vendor's payload and how it is converted. */
export function MappingTable() {
  const { t } = useTranslation();
  return (
    <Card>
      <h2 className="text-base font-semibold">{t('hub.mapping.title')}</h2>
      <p className="mt-1 max-w-3xl text-sm leading-relaxed text-muted">{t('hub.mapping.intro')}</p>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[56rem] border-collapse text-left text-xs">
          <thead>
            <tr className="border-b border-border text-muted">
              <th scope="col" className="py-2 pr-3 font-medium">{t('hub.mapping.canonical')}</th>
              {BRANDS.map((b) => (
                <th key={b} scope="col" className="px-3 py-2 font-medium">
                  {t(`brands.${b}`)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {CANONICAL_FIELDS.map((field) => (
              <tr key={field} className="border-b border-border/60 align-top">
                <th scope="row" className="py-2 pr-3 text-left font-semibold">
                  {t(`hub.mapping.fields.${field}`)}
                  <span className="block font-mono text-[10px] font-normal text-muted">{field}</span>
                </th>
                {BRANDS.map((b) => {
                  const src = FIELD_MAP[b][field];
                  return (
                    <td key={b} className="px-3 py-2">
                      <code className="block font-mono text-[11px] text-accent">{src.paths.join(', ')}</code>
                      <span className="block text-muted">{src.unit}</span>
                      <code className="block font-mono text-[11px]">= {src.expr}</code>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
