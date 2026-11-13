'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { errorMessage } from '@/i18n/errors';
import { createDashboardLibraryLoader } from './dashboardLibraryLoader';
import { useDashboardAuth } from './useDashboardAuth';

export function useDashboardLibraryData() {
  const auth = useDashboardAuth();
  const { apiRequest } = auth;
  const owner =
    auth.session == null ? null : JSON.stringify([auth.session.user.id, auth.session.session.id]);
  const loader = useMemo(() => createDashboardLibraryLoader(apiRequest), [apiRequest]);
  const {
    places,
    routes,
    selectedPlaceId,
    selectedRouteId,
    placesFailure,
    routesFailure,
    isLoading,
    lastLoadedAt,
  } = useSyncExternalStore(loader.subscribe, loader.getSnapshot, loader.getSnapshot);
  const {
    refresh,
    refreshPlaces,
    refreshRoutes,
    setSelectedPlaceId,
    setSelectedRouteId,
    upsertRoute,
  } = loader;
  const t = useTranslations('LibraryData');
  const te = useTranslations('Errors');
  const placesError =
    placesFailure == null ? null : t('placesError', { error: errorMessage(placesFailure, te) });
  const routesError =
    routesFailure == null ? null : t('routesError', { error: errorMessage(routesFailure, te) });

  useEffect(() => {
    if (!auth.isHydrated || !auth.isAuthenticated || owner == null) {
      return;
    }

    void refresh();
    return loader.invalidatePending;
  }, [auth.isAuthenticated, auth.isHydrated, owner, refresh, loader]);

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
