import { Hammer } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Card } from './Card';

export function Placeholder({ stage }: { stage: number }) {
  const { t } = useTranslation();
  return (
    <Card className="flex items-center gap-3 text-sm text-muted">
      <Hammer aria-hidden className="size-5 shrink-0 text-accent" />
      <p>{t('common.comingInStage', { stage })}</p>
    </Card>
  );
}
