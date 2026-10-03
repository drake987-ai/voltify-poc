import { PageHeader } from '@/components/ui/PageHeader';
import { Placeholder } from '@/components/ui/Placeholder';

export default function EvidencePage() {
  return (
    <>
      <PageHeader page="evidence" dataSource={{ kind: 'simulated' }} />
      <Placeholder stage={7} />
    </>
  );
}
