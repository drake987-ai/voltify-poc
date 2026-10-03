import { PageHeader } from '@/components/ui/PageHeader';
import { Placeholder } from '@/components/ui/Placeholder';

export default function RoiPage() {
  return (
    <>
      <PageHeader page="roi" dataSource={{ kind: 'simulated' }} />
      <Placeholder stage={6} />
    </>
  );
}
