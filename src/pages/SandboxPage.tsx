import { PageHeader } from '@/components/ui/PageHeader';
import { Placeholder } from '@/components/ui/Placeholder';

export default function SandboxPage() {
  return (
    <>
      <PageHeader page="sandbox" dataSource={{ kind: 'simulated' }} />
      <Placeholder stage={7} />
    </>
  );
}
