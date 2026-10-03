import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Card } from '@/components/ui/Card';

export default function NotFoundPage() {
  const { t } = useTranslation();
  return (
    <Card className="max-w-xl">
      <h1 className="text-xl font-semibold">{t('common.notFoundTitle')}</h1>
      <p className="mt-2 text-sm text-muted">{t('common.notFoundBody')}</p>
      <Link to="/fleet" className="mt-4 inline-block text-sm font-medium text-accent underline">
        {t('common.backToFleet')}
      </Link>
    </Card>
  );
}
