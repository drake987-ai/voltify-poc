import { useTranslation } from 'react-i18next';
import { Card } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/PageHeader';
import { useAsync } from '@/hooks/useAsync';
import { HubView } from '@/pages/hub/HubView';
import { runHubAsync } from '@/workers/client';

export default function CrossBrandPage() {
  const { t } = useTranslation();
  const state = useAsync(() => runHubAsync(), 'hub');

  return (
    <>
      <PageHeader page="crossBrand" dataSource={{ kind: 'simulated' }} />
      {state.status === 'loading' ? (
        <Card className="text-sm text-muted" aria-busy="true">
          {t('state.loading')}
        </Card>
      ) : state.status === 'error' ? (
        <Card className="text-sm text-risk-danger" role="alert">
          {t('state.error', { message: state.message })}
        </Card>
      ) : (
        <HubView run={state.data} />
      )}
    </>
  );
}
