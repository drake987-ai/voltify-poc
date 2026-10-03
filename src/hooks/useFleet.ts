import { useSyncExternalStore } from 'react';
import { fleetController, type FleetViewState } from '@/workers/fleetClient';

/** The shared live fleet. Watching it (mounting any screen that calls this) keeps it running. */
export function useFleet(): FleetViewState & { controller: typeof fleetController } {
  const state = useSyncExternalStore(fleetController.subscribe, fleetController.getState);
  return { ...state, controller: fleetController };
}
