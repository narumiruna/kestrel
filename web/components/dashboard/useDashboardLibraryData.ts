'use client';

import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useState } from 'react';
import { errorMessage } from '@/i18n/errors';
import type { Place, Route } from '@/lib/api';
import { upsertRouteById } from './routeDraftState';
import { useDashboardAuth } from './useDashboardAuth';

export function useDashboardLibraryData() {
  const auth = useDashboardAuth();
  const [places, setPlaces] = useState<Place[]>([]);
  const [routes, setRoutes] = useState<Route[]>([]);
  const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(null);
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const t = useTranslations('LibraryData');
  const te = useTranslations('Errors');
  const [placesFailure, setPlacesError] = useState<unknown>(null);
  const [routesFailure, setRoutesError] = useState<unknown>(null);
  const placesError =
    placesFailure == null ? null : t('placesError', { error: errorMessage(placesFailure, te) });
  const routesError =
    routesFailure == null ? null : t('routesError', { error: errorMessage(routesFailure, te) });
  const [isLoading, setIsLoading] = useState(true);
  const [lastLoadedAt, setLastLoadedAt] = useState<Date | null>(null);

  const refresh = useCallback(async () => {
    setPlacesError(null);
    setRoutesError(null);
    setIsLoading(true);

    const [placesResult, routesResult] = await Promise.allSettled([
      auth.apiRequest<Place[]>('/places'),
      auth.apiRequest<Route[]>('/routes'),
    ]);

    if (placesResult.status === 'fulfilled') {
      const nextPlaces = placesResult.value;
      setPlaces(nextPlaces);
      setSelectedPlaceId((current) =>
        nextPlaces.some((place) => place.id === current) ? current : (nextPlaces[0]?.id ?? null),
      );
    } else {
      setPlacesError(placesResult.reason);
    }

    if (routesResult.status === 'fulfilled') {
      const nextRoutes = routesResult.value;
      setRoutes(nextRoutes);
      setSelectedRouteId((current) =>
        nextRoutes.some((route) => route.id === current) ? current : (nextRoutes[0]?.id ?? null),
      );
    } else {
      setRoutesError(routesResult.reason);
    }

    if (placesResult.status === 'fulfilled' || routesResult.status === 'fulfilled') {
      setLastLoadedAt(new Date());
    }
    setIsLoading(false);
  }, [auth]);

  const upsertRoute = useCallback((route: Route) => {
    setRoutes((currentRoutes) => upsertRouteById(currentRoutes, route));
    setSelectedRouteId(route.id);
    setLastLoadedAt(new Date());
  }, []);

  const refreshPlaces = useCallback(async () => {
    setPlacesError(null);
    try {
      const nextPlaces = await auth.apiRequest<Place[]>('/places');
      setPlaces(nextPlaces);
      setSelectedPlaceId((current) =>
        nextPlaces.some((place) => place.id === current) ? current : (nextPlaces[0]?.id ?? null),
      );
      setLastLoadedAt(new Date());
    } catch (nextError) {
      setPlacesError(nextError);
    }
  }, [auth]);

  const refreshRoutes = useCallback(async () => {
    setRoutesError(null);
    try {
      const nextRoutes = await auth.apiRequest<Route[]>('/routes');
      setRoutes(nextRoutes);
      setSelectedRouteId((current) =>
        nextRoutes.some((route) => route.id === current) ? current : (nextRoutes[0]?.id ?? null),
      );
      setLastLoadedAt(new Date());
    } catch (nextError) {
      setRoutesError(nextError);
    }
  }, [auth]);

  useEffect(() => {
    if (!auth.isHydrated || !auth.isAuthenticated) {
      return;
    }

    void refresh();
  }, [auth.isAuthenticated, auth.isHydrated, refresh]);

  const error = [placesError, routesError].filter(Boolean).join(' · ') || null;

  return {
    auth,
    error,
    isLoading,
    lastLoadedAt,
    places,
    placesError,
    refresh,
    refreshPlaces,
    refreshRoutes,
    routes,
    routesError,
    selectedPlaceId,
    selectedRouteId,
    setSelectedPlaceId,
    setSelectedRouteId,
    upsertRoute,
  };
}
