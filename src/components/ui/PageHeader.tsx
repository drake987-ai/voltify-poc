import { useTranslation } from 'react-i18next';
import type { DataSource } from '@/lib/dataSource';
import type { PageId } from '@/lib/pageIds';
import { DataBadge } from './DataBadge';

// `dataSource` is required on purpose: no screen can ship without a data label.
export function PageHeader({ page, dataSource }: { page: PageId; dataSource: DataSource }) {
  const { t } = useTranslation();
  return (
    <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight">{t(`pages.${page}.title`)}</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted">{t(`pages.${page}.subtitle`)}</p>
      </div>
      <DataBadge source={dataSource} />
    </header>
  );
}
