import { PageHeader } from '@/components/ui/PageHeader';
import { Placeholder } from '@/components/ui/Placeholder';

export default function FleetPage() {
  return (
    <>
      <PageHeader page="fleet" dataSource={{ kind: 'simulated' }} />
      <Placeholder stage={5} />
    </>
  );
}
