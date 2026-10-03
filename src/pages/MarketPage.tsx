import { PageHeader } from '@/components/ui/PageHeader';
import { Placeholder } from '@/components/ui/Placeholder';

export default function MarketPage() {
  return (
    <>
      <PageHeader page="market" dataSource={{ kind: 'reference' }} />
      <Placeholder stage={7} />
    </>
  );
}
