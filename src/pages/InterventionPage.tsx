import { PageHeader } from '@/components/ui/PageHeader';
import { Placeholder } from '@/components/ui/Placeholder';

export default function InterventionPage() {
  return (
    <>
      <PageHeader page="intervention" dataSource={{ kind: 'simulated' }} />
      <Placeholder stage={5} />
    </>
  );
}
