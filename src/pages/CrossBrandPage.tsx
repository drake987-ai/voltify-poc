import { PageHeader } from '@/components/ui/PageHeader';
import { Placeholder } from '@/components/ui/Placeholder';

export default function CrossBrandPage() {
  return (
    <>
      <PageHeader page="crossBrand" dataSource={{ kind: 'simulated' }} />
      <Placeholder stage={6} />
    </>
  );
}
