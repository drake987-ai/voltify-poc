import { BRANDS } from '@/adapters';
import { PageHeader } from '@/components/ui/PageHeader';
import { ReferencesCard } from '@/components/ui/ReferencesCard';
import { useAsync } from '@/hooks/useAsync';
import { abSpec } from '@/pages/ab/abConfig';
import { cabinetSpec } from '@/pages/intervention/config';
import {
  AdvantageAndModel,
  CompetitorTable,
  ImpactCard,
  MarketSizing,
  ProblemSolution,
  RoadmapCard,
  TargetsCard,
  UvpCard,
} from '@/pages/market/Sections';
import { runABAsync, runCabinetAsync } from '@/workers/client';

export default function MarketPage() {
  // The targets table sets the brief's targets beside what the PoC has measured; both runs are shared with other screens.
  const ab = useAsync(
    async () => {
      const runs = await Promise.all(BRANDS.map((b) => runABAsync(abSpec('severeHeatLoad', b, 'full'))));
      return { A: runs[0], B: runs[1], C: runs[2] };
    },
    'market-ab',
  );
  const spec = cabinetSpec('A');
  const cabinet = useAsync(() => runCabinetAsync(spec), JSON.stringify(spec));

  return (
    <>
      <PageHeader page="market" dataSource={{ kind: 'reference' }} />
      <div className="space-y-4">
        <UvpCard />
        <ProblemSolution />
        <TargetsCard ab={ab} cabinet={cabinet} />
        <MarketSizing />
        <CompetitorTable />
        <AdvantageAndModel />
        <RoadmapCard />
        <ImpactCard />
        <ReferencesCard />
      </div>
    </>
  );
}
