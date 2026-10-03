import { PageHeader } from '@/components/ui/PageHeader';
import { useAsync } from '@/hooks/useAsync';
import { cabinetSpec } from '@/pages/intervention/config';
import { RoiView } from '@/pages/roi/RoiView';
import { measurePreventionAsync, runCabinetAsync } from '@/workers/client';

export default function RoiPage() {
  // The careful case rests on two measurements; both run in the worker (the cabinet one is shared with the
  // Intervention screen, so it is often already done) and the page works while they are still running.
  const spec = cabinetSpec('A');
  const cabinet = useAsync(() => runCabinetAsync(spec), JSON.stringify(spec));
  const prevention = useAsync(() => measurePreventionAsync(), 'prevention');

  return (
    <>
      <PageHeader page="roi" dataSource={{ kind: 'simulated' }} />
      <RoiView cabinet={cabinet} prevention={prevention} />
    </>
  );
}
