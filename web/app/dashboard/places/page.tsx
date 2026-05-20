'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import DashboardShell from '@/components/dashboard/DashboardShell';
import PlaceEditor from '@/components/dashboard/PlaceEditor';
import { useDashboardAuth } from '@/components/dashboard/useDashboardAuth';
import { formatCoord, formatError } from '@/components/dashboard/utils';
import type { Place, PlaceInput } from '@/lib/api';

export default function PlacesDashboardPage() {
  const auth = useDashboardAuth();
  const [places, setPlaces] = useState<Place[]>([]);
  const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(null);
  const [draftPlaceCoords, setDraftPlaceCoords] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [lastLoadedAt, setLastLoadedAt] = useState<Date | null>(null);

  const selectedPlace = useMemo(
    () => places.find((place) => place.id === selectedPlaceId) ?? null,
    [places, selectedPlaceId],
  );

  const loadPlaces = useCallback(async () => {
    setError(null);
    setIsLoading(true);

    try {
      const nextPlaces = await auth.apiRequest<Place[]>('/places');
      setPlaces(nextPlaces);
      setSelectedPlaceId((current) => current ?? nextPlaces[0]?.id ?? null);
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

    void loadPlaces();
  }, [auth.isAuthenticated, auth.isHydrated, loadPlaces]);

  if (!auth.isHydrated || !auth.isAuthenticated || auth.session == null) {
    return (
      <main className="shell">
        <p className="muted">Loading session…</p>
      </main>
    );
  }

  async function savePlace(input: PlaceInput) {
    const savedPlace =
      selectedPlace == null
        ? await auth.apiRequest<Place>('/places', {
            body: JSON.stringify(input),
            method: 'POST',
          })
        : await auth.apiRequest<Place>(`/places/${selectedPlace.id}`, {
            body: JSON.stringify(input),
            method: 'PATCH',
          });

    await loadPlaces();
    setSelectedPlaceId(savedPlace.id);
  }

  async function deletePlace(placeId: string) {
    await auth.apiRequest(`/places/${placeId}`, { method: 'DELETE' });
    await loadPlaces();
    setSelectedPlaceId(null);
  }

  function createNewPlace() {
    if (selectedPlace != null) {
      setDraftPlaceCoords({
        latitude: selectedPlace.latitude,
        longitude: selectedPlace.longitude,
      });
    }

    setSelectedPlaceId(null);
  }

  return (
    <DashboardShell
      activeSection="places"
      isRefreshing={isLoading}
      lastUpdatedLabel={lastLoadedAt?.toLocaleTimeString() ?? null}
      onLogout={auth.logout}
      onRefresh={() => void loadPlaces()}
      username={auth.session.user.username}
    >
      {error == null ? null : <div className="error dashboard-error">{error}</div>}

      <section className="dashboard-grid">
        <aside className={`dashboard-sidebar${isSidebarOpen ? '' : ' collapsed'}`}>
          <div className="card stack">
            <div className="dashboard-sidebar-header">
              <h2 className="dashboard-sidebar-title">Places</h2>
              <div className="row dashboard-sidebar-actions">
                <button
                  aria-expanded={isSidebarOpen}
                  aria-label={isSidebarOpen ? 'Collapse places sidebar' : 'Expand places sidebar'}
                  className="secondary dashboard-sidebar-toggle"
                  type="button"
                  onClick={() => setIsSidebarOpen((current) => !current)}
                >
                  {isSidebarOpen ? '‹' : '›'}
                </button>
                <button
                  className="secondary dashboard-sidebar-new button-icon-label"
                  type="button"
                  onClick={createNewPlace}
                >
                  <PlusIcon />
                  New
                </button>
              </div>
            </div>
            <div className="dashboard-sidebar-content">
              {isLoading ? <SidebarSkeleton /> : null}
              <div className="list">
                {places.map((place) => (
                  <button
                    className={`list-item ${selectedPlaceId === place.id ? 'active' : ''}`}
                    key={place.id}
                    type="button"
                    onClick={() => setSelectedPlaceId(place.id)}
                  >
                    <strong>{place.name}</strong>
                    <span className="place-card-coordinates">
                      {formatCoord(place.latitude)}, {formatCoord(place.longitude)}
                    </span>
                    <TagRow tags={place.tags} />
                  </button>
                ))}
                {places.length === 0 && !isLoading ? (
                  <div className="empty-state">
                    <p className="muted">No favorite places yet.</p>
                    <button className="secondary" type="button" onClick={createNewPlace}>
                      Create your first favorite place
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </aside>

        <section aria-busy={isLoading} className="grid">
          {isLoading ? <div className="loading-shimmer" /> : null}
          <PlaceEditor
            draftCoords={draftPlaceCoords ?? undefined}
            key={selectedPlace?.id ?? 'new-place'}
            onDelete={selectedPlace == null ? undefined : () => void deletePlace(selectedPlace.id)}
            onSave={(input) => void savePlace(input)}
            place={selectedPlace}
          />
        </section>
      </section>
    </DashboardShell>
  );
}

function SidebarSkeleton() {
  return (
    <div aria-label="Loading places" className="skeleton-list" role="status">
      <span className="skeleton-line wide" />
      <span className="skeleton-line" />
      <span className="skeleton-line short" />
    </div>
  );
}

function PlusIcon() {
  return (
    <svg aria-hidden="true" className="lucide-icon" fill="none" viewBox="0 0 24 24">
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </svg>
  );
}

function TagRow({ tags }: { tags: string[] }) {
  if (tags.length === 0) {
    return null;
  }

  return (
    <span className="chip-row">
      {tags.map((tag) => (
        <span className="chip" key={tag}>
          {tag}
        </span>
      ))}
    </span>
  );
}
