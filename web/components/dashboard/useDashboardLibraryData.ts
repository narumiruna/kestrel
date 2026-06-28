'use client';

import { useCallback, useEffect, useState } from 'react';
import type { Place, Route } from '@/lib/api';
import { useDashboardAuth } from './useDashboardAuth';
import { formatError } from './utils';

export function useDashboardLibraryData() {
  const auth = useDashboardAuth();
  const [places, setPlaces] = useState<Place[]>([]);
  const [routes, setRoutes] = useState<Route[]>([]);
  const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(null);
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [lastLoadedAt, setLastLoadedAt] = useState<Date | null>(null);

  const refresh = useCallback(async () => {
    setError(null);
    setIsLoading(true);

    try {
      const [nextPlaces, nextRoutes] = await Promise.all([
        auth.apiRequest<Place[]>('/places'),
        auth.apiRequest<Route[]>('/routes'),
      ]);
      setPlaces(nextPlaces);
      setRoutes(nextRoutes);
      setSelectedPlaceId((current) =>
        nextPlaces.some((place) => place.id === current) ? current : (nextPlaces[0]?.id ?? null),
      );
      setSelectedRouteId((current) =>
        nextRoutes.some((route) => route.id === current) ? current : (nextRoutes[0]?.id ?? null),
      );
      setLastLoadedAt(new Date());
    } catch (nextError) {
      setError(formatError(nextError));
    } finally {
      setIsLoading(false);
    }
  }, [auth]);

  useEffect(() => {
    if (!auth.isHydrated || !auth.isAuthenticated) {
      return;
    }

    void refresh();
  }, [auth.isAuthenticated, auth.isHydrated, refresh]);

  return {
    auth,
    error,
    isLoading,
    lastLoadedAt,
    places,
    refresh,
    routes,
    selectedPlaceId,
    selectedRouteId,
    setSelectedPlaceId,
    setSelectedRouteId,
  };
}
