import { lazy, type ReactElement } from 'react';
import {
  BellRing,
  Calculator,
  CirclePlay,
  ClipboardCheck,
  Cpu,
  HeartPulse,
  LayoutDashboard,
  Network,
  Scale,
  SlidersHorizontal,
  TrendingUp,
  type LucideIcon,
} from 'lucide-react';
import { matchPath } from 'react-router-dom';
import type { PageId } from '@/lib/pageIds';
import CrossBrandPage from '@/pages/CrossBrandPage';
import EvidencePage from '@/pages/EvidencePage';
import FleetPage from '@/pages/FleetPage';
import InterventionPage from '@/pages/InterventionPage';
import MarketPage from '@/pages/MarketPage';
import RoiPage from '@/pages/RoiPage';
import SandboxPage from '@/pages/SandboxPage';
import StoryPage from '@/pages/StoryPage';
import VitalsPage from '@/pages/VitalsPage';

// Screens that draw charts are loaded on demand so the charting library stays out of the first load.
const TwinPage = lazy(() => import('@/pages/TwinPage'));
const BmsVsVoltifyPage = lazy(() => import('@/pages/BmsVsVoltifyPage'));

export const NAV_GROUPS = ['demo', 'platform', 'business'] as const;
export type NavGroup = (typeof NAV_GROUPS)[number];

export interface AppRoute {
  id: PageId;
  path: string;
  /** Extra URL patterns that render the same page (e.g. a parameterised variant). */
  extraPaths?: readonly string[];
  icon: LucideIcon;
  group: NavGroup;
  /** Build stage (CLAUDE.md section 11) in which the real screen replaces the placeholder. */
  stage: number;
  element: ReactElement;
}

// Single source of truth: the router and the sidebar are both generated from
// this array, in this order.
export const ROUTES: readonly AppRoute[] = [
  { id: 'story', path: '/story', icon: CirclePlay, group: 'demo', stage: 7, element: <StoryPage /> },
  { id: 'sandbox', path: '/sandbox', icon: SlidersHorizontal, group: 'demo', stage: 7, element: <SandboxPage /> },
  { id: 'fleet', path: '/fleet', icon: LayoutDashboard, group: 'platform', stage: 5, element: <FleetPage /> },
  {
    id: 'twin',
    path: '/twin',
    extraPaths: ['/twin/:batteryId'],
    icon: Cpu,
    group: 'platform',
    stage: 4,
    element: <TwinPage />,
  },
  { id: 'bms', path: '/bms-vs-voltify', icon: Scale, group: 'platform', stage: 4, element: <BmsVsVoltifyPage /> },
  { id: 'vitals', path: '/vitals', icon: HeartPulse, group: 'platform', stage: 5, element: <VitalsPage /> },
  { id: 'intervention', path: '/intervention', icon: BellRing, group: 'platform', stage: 5, element: <InterventionPage /> },
  { id: 'crossBrand', path: '/cross-brand', icon: Network, group: 'platform', stage: 6, element: <CrossBrandPage /> },
  { id: 'roi', path: '/roi', icon: Calculator, group: 'business', stage: 6, element: <RoiPage /> },
  { id: 'evidence', path: '/evidence', icon: ClipboardCheck, group: 'business', stage: 7, element: <EvidencePage /> },
  { id: 'market', path: '/market', icon: TrendingUp, group: 'business', stage: 7, element: <MarketPage /> },
];

export function allPaths(route: AppRoute): string[] {
  return [route.path, ...(route.extraPaths ?? [])];
}

export function findRoute(pathname: string): AppRoute | undefined {
  return ROUTES.find((route) =>
    allPaths(route).some((pattern) => matchPath({ path: pattern, end: true }, pathname)),
  );
}
