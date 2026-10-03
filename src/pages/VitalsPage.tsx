import { PageHeader } from '@/components/ui/PageHeader';
import { Placeholder } from '@/components/ui/Placeholder';

export default function VitalsPage() {
  return (
    <>
      <PageHeader page="vitals" dataSource={{ kind: 'simulated' }} />
      <Placeholder stage={5} />
    </>
  );
}
