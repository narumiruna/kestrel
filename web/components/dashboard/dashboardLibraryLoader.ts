import type { Dispatch, SetStateAction } from 'react';
import type { AuthenticatedApiRequest, Place, Route } from '../../lib/api.ts';
import { upsertRouteById } from './routeDraftState.ts';

type LibraryData = {
  places: Place[];
  routes: Route[];
  selectedPlaceId: string | null;
  selectedRouteId: string | null;
  placesFailure: unknown;
  routesFailure: unknown;
  isLoading: boolean;
  lastLoadedAt: Date | null;
};
type Resource = 'places' | 'routes';

export function createDashboardLibraryLoader(apiRequest: AuthenticatedApiRequest) {
  let state: LibraryData = {
    places: [],
    routes: [],
    selectedPlaceId: null,
    selectedRouteId: null,
    placesFailure: null,
    routesFailure: null,
    isLoading: true,
    lastLoadedAt: null,
  };
  const generations = { places: 0, routes: 0 };
  const pending = { places: false, routes: false };
  const listeners = new Set<() => void>();
  function update(patch: Partial<LibraryData>) {
    state = { ...state, ...patch };
    for (const listener of listeners) listener();
  }
  function loading() {
    return pending.places || pending.routes;
  }

  async function load<T>(resource: Resource, commit: (items: T[]) => Partial<LibraryData>) {
    const generation = ++generations[resource];
    const failureKey = resource === 'places' ? 'placesFailure' : 'routesFailure';
    pending[resource] = true;
    update({ [failureKey]: null, isLoading: true });
    try {
      const items = await apiRequest<T[]>(`/${resource}`);
      if (generation !== generations[resource]) return;
      pending[resource] = false;
      update({ ...commit(items), lastLoadedAt: new Date(), isLoading: loading() });
    } catch (failure) {
      if (generation !== generations[resource]) return;
      pending[resource] = false;
      update({ [failureKey]: failure, isLoading: loading() });
    }
  }

  const refreshPlaces = () =>
    load<Place>('places', (places) => ({
      places,
      selectedPlaceId: places.some((place) => place.id === state.selectedPlaceId)
        ? state.selectedPlaceId
        : (places[0]?.id ?? null),
    }));
  const refreshRoutes = () =>
    load<Route>('routes', (routes) => ({
      routes,
      selectedRouteId: routes.some((route) => route.id === state.selectedRouteId)
        ? state.selectedRouteId
        : (routes[0]?.id ?? null),
    }));
  const setSelectedPlaceId: Dispatch<SetStateAction<string | null>> = (value) => {
    update({ selectedPlaceId: typeof value === 'function' ? value(state.selectedPlaceId) : value });
  };
  const setSelectedRouteId: Dispatch<SetStateAction<string | null>> = (value) => {
    update({ selectedRouteId: typeof value === 'function' ? value(state.selectedRouteId) : value });
  };

  return {
    getSnapshot: () => state,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    refresh: async () => {
      await Promise.all([refreshPlaces(), refreshRoutes()]);
    },
    refreshPlaces,
    refreshRoutes,
    setSelectedPlaceId,
    setSelectedRouteId,
    upsertRoute: (route: Route) => {
      // A saved route is newer than every route read already in flight.
      generations.routes += 1;
      pending.routes = false;
      update({
        routes: upsertRouteById(state.routes, route),
        selectedRouteId: route.id,
        routesFailure: null,
        isLoading: loading(),
        lastLoadedAt: new Date(),
      });
    },
    invalidatePending: () => {
      generations.places += 1;
      generations.routes += 1;
      pending.places = false;
      pending.routes = false;
      update({ isLoading: false });
    },
  };
}
