import { BookOpen, Database, FlaskConical } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { DataSource } from '@/lib/dataSource';

export function DataBadge({ source }: { source: DataSource }) {
  const { t } = useTranslation();

  let Icon = FlaskConical;
  let label: string;
  let hint: string;
  switch (source.kind) {
    case 'simulated':
      label = t('dataSource.simulated');
      hint = t('dataSource.simulatedHint');
      break;
    case 'real':
      Icon = Database;
      label = t('dataSource.real', { dataset: source.dataset });
      hint = t('dataSource.realHint');
      break;
    case 'reference':
      Icon = BookOpen;
      label = t('dataSource.reference');
      hint = t('dataSource.referenceHint');
      break;
  }

  return (
    <span
      title={hint}
      className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-accent/40 bg-accent/10 px-2.5 py-1 text-xs font-medium text-accent"
    >
      <Icon aria-hidden className="size-3.5" />
      {label}
    </span>
  );
}
