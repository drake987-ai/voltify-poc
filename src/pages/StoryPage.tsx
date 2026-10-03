import { PageHeader } from '@/components/ui/PageHeader';
import { Placeholder } from '@/components/ui/Placeholder';

export default function StoryPage() {
  return (
    <>
      <PageHeader page="story" dataSource={{ kind: 'simulated' }} />
      <Placeholder stage={7} />
    </>
  );
}
