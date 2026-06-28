'use client';

import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FieldNotebook } from '@/components/cartographer/FieldNotebook';
import { IndexCard } from '@/components/cartographer/IndexCard';
import { KeyboardCheatsheet } from '@/components/cartographer/KeyboardCheatsheet';
import { ScaleBar } from '@/components/cartographer/ScaleBar';
import { Stage } from '@/components/cartographer/Stage';
import { StatusStrip } from '@/components/cartographer/StatusStrip';
import { UserMark } from '@/components/cartographer/UserMark';
import { useKeyboardShortcuts } from '@/components/cartographer/useKeyboardShortcuts';
import PlaceEditor from '@/components/dashboard/PlaceEditor';
import { PlaceRemoteControlAction } from '@/components/dashboard/RemoteControlPanel';
import { useDashboardAuth } from '@/components/dashboard/useDashboardAuth';
import { formatCoord, formatError } from '@/components/dashboard/utils';
import { DEFAULT_MAP_CENTER } from '@/components/mapStyle';
import type { Place, PlaceInput } from '@/lib/api';

const CartographerPlaceMap = dynamic(
  () => import('@/components/cartographer/CartographerPlaceMap'),
  {
    ssr: false,
  },
);
const ZoomStack = dynamic(
  () => import('@/components/cartographer/ZoomStack').then((module) => module.ZoomStack),
  {
    ssr: false,
  },
);

type PlaceViewportControls = {
  fit: () => void;
  zoomIn: () => void;
  zoomOut: () => void;
};

export default function PlacesDashboardPage() {
  const auth = useDashboardAuth();
  const router = useRouter();
  const searchRef = useRef<HTMLInputElement | null>(null);
  const [places, setPlaces] = useState<Place[]>([]);
  const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(null);
  const [draftPlaceCoords, setDraftPlaceCoords] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [lastLoadedAt, setLastLoadedAt] = useState<Date | null>(null);
  const [placeQuery, setPlaceQuery] = useState('');
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [viewportControls, setViewportControls] = useState<PlaceViewportControls | null>(null);
  const [isPlaceDirty, setIsPlaceDirty] = useState(false);
  const [newPlaceDraftNonce, setNewPlaceDraftNonce] = useState(0);
  const [isLibraryCollapsed, setIsLibraryCollapsed] = useState(false);
  const [isEditorCollapsed, setIsEditorCollapsed] = useState(false);

  const selectedPlace = useMemo(
    () => places.find((place) => place.id === selectedPlaceId) ?? null,
    [places, selectedPlaceId],
  );
  const activeCoords = useMemo(
    () =>
      draftPlaceCoords ??
      (selectedPlace == null
        ? DEFAULT_MAP_CENTER
        : { latitude: selectedPlace.latitude, longitude: selectedPlace.longitude }),
    [draftPlaceCoords, selectedPlace],
  );
  const filteredPlaces = useMemo(() => {
    const normalizedQuery = placeQuery.trim().toLowerCase();

    if (normalizedQuery.length === 0) {
      return places;
    }

    return places.filter((place) =>
      [place.name, place.description ?? '', ...place.tags]
        .join(' ')
        .toLowerCase()
        .includes(normalizedQuery),
    );
  }, [placeQuery, places]);
  const lastUpdatedLabel = useRelativeUpdatedLabel(lastLoadedAt);

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

  const selectPlace = useCallback(
    (placeId: string) => {
      if (placeId === selectedPlaceId) {
        return;
      }

      if (!confirmDiscardUnsavedChanges(isPlaceDirty)) {
        return;
      }

      const place = places.find((currentPlace) => currentPlace.id === placeId);
      setIsPlaceDirty(false);
      setSelectedPlaceId(placeId);
      setDraftPlaceCoords(
        place == null ? null : { latitude: place.latitude, longitude: place.longitude },
      );
    },
    [isPlaceDirty, places, selectedPlaceId],
  );

  const createNewPlace = useCallback(() => {
    if (!confirmDiscardUnsavedChanges(isPlaceDirty)) {
      return;
    }

    setIsPlaceDirty(false);
    setDraftPlaceCoords(activeCoords);
    setSelectedPlaceId(null);
    setNewPlaceDraftNonce((currentNonce) => currentNonce + 1);
  }, [activeCoords, isPlaceDirty]);

  useEffect(() => {
    if (!isPlaceDirty) {
      return;
    }

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isPlaceDirty]);

  useKeyboardShortcuts({
    onClose: () => setIsHelpOpen(false),
    onFocusSearch: () => searchRef.current?.focus(),
    onGoPlaces: () => router.push('/dashboard/places'),
    onGoRoutes: () => router.push('/dashboard/routes'),
    onNew: createNewPlace,
    onToggleHelp: () => setIsHelpOpen((current) => !current),
  });

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
    setIsPlaceDirty(false);
    setSelectedPlaceId(savedPlace.id);
    setDraftPlaceCoords({ latitude: savedPlace.latitude, longitude: savedPlace.longitude });
  }

  async function deletePlace(placeId: string) {
    await auth.apiRequest(`/places/${placeId}`, { method: 'DELETE' });
    await loadPlaces();
    setSelectedPlaceId(null);
    setDraftPlaceCoords(DEFAULT_MAP_CENTER);
  }

  async function changePassword(input: { currentPassword: string; newPassword: string }) {
    await auth.apiRequest('/auth/password/change', {
      body: JSON.stringify(input),
      method: 'POST',
    });
  }

  return (
    <Stage
      map={
        <CartographerPlaceMap
          draftCoords={activeCoords}
          places={places}
          selectedPlaceId={selectedPlaceId}
          onChangeDraftCoords={setDraftPlaceCoords}
          onReady={setViewportControls}
          onSelectPlace={selectPlace}
        />
      }
      isLeftPanelCollapsed={isLibraryCollapsed}
      isRightPanelCollapsed={isEditorCollapsed}
      mode="places"
      onToggleLeftPanel={() => setIsLibraryCollapsed((current) => !current)}
      onToggleMapFocus={() => {
        const shouldRestorePanels = isLibraryCollapsed && isEditorCollapsed;
        setIsLibraryCollapsed(!shouldRestorePanels);
        setIsEditorCollapsed(!shouldRestorePanels);
      }}
      onToggleRightPanel={() => setIsEditorCollapsed((current) => !current)}
    >
      <StatusStrip
        error={error}
        isRefreshing={isLoading}
        lastUpdatedLabel={lastUpdatedLabel}
        onRefresh={() => void loadPlaces()}
      />
      <UserMark
        username={auth.session.user.username}
        onChangePassword={changePassword}
        onLogout={auth.logout}
      />
      <FieldNotebook
        activeSection="places"
        newLabel="New place"
        searchPlaceholder="Search places..."
        searchRef={searchRef}
        searchValue={placeQuery}
        onNewEntry={createNewPlace}
        onSearchChange={setPlaceQuery}
      >
        {isLoading ? <NotebookSkeleton /> : null}
        {filteredPlaces.map((place) => (
          <button
            className={`notebook-entry${selectedPlaceId === place.id ? ' active' : ''}`}
            key={place.id}
            type="button"
            onClick={() => selectPlace(place.id)}
          >
            <strong>{place.name}</strong>
            <span className="font-mono">
              {formatCoord(place.latitude)}, {formatCoord(place.longitude)}
            </span>
            <TagRow tags={place.tags} />
          </button>
        ))}
        {filteredPlaces.length === 0 && !isLoading ? (
          <div className="notebook-empty">
            <p className="muted no-margin">
              {places.length === 0
                ? 'No places yet. Use New place to save your first coordinate.'
                : 'No places match this search.'}
            </p>
          </div>
        ) : null}
      </FieldNotebook>
      <IndexCard
        actions={
          <PlaceRemoteControlAction key={selectedPlace?.id ?? 'new-place'} place={selectedPlace} />
        }
        eyebrow={
          <span>
            Places / <span>{selectedPlace?.name ?? 'New place'}</span>
          </span>
        }
        stamp={selectedPlace == null ? 'draft' : 'archived favorite'}
        subtitle="Pin the exact coordinates, add field notes, then save the card."
        title={selectedPlace?.name ?? 'New place'}
        variant="place"
        meta={
          <div className="index-card-coordinate-grid font-mono">
            <span>lat {formatCoord(activeCoords.latitude)}</span>
            <span>lng {formatCoord(activeCoords.longitude)}</span>
          </div>
        }
      >
        <PlaceEditor
          draftCoords={activeCoords}
          key={selectedPlace?.id ?? `new-place-${newPlaceDraftNonce}`}
          onDelete={selectedPlace == null ? undefined : () => void deletePlace(selectedPlace.id)}
          onDirtyChange={setIsPlaceDirty}
          onDiscard={(coords) => {
            setDraftPlaceCoords(coords);
            setIsPlaceDirty(false);
          }}
          onSave={(input) => void savePlace(input)}
          place={selectedPlace}
          showHeader={false}
          showMap={false}
        />
      </IndexCard>
      <ZoomStack
        onFit={() => viewportControls?.fit()}
        onZoomIn={() => viewportControls?.zoomIn()}
        onZoomOut={() => viewportControls?.zoomOut()}
      />
      <ScaleBar />
      <KeyboardCheatsheet isOpen={isHelpOpen} onClose={() => setIsHelpOpen(false)} />
    </Stage>
  );
}

function confirmDiscardUnsavedChanges(isDirty: boolean): boolean {
  return !isDirty || window.confirm('Discard unsaved changes? Save first to keep them.');
}

function NotebookSkeleton() {
  return (
    <div aria-label="Loading places" className="skeleton-list" role="status">
      <span className="skeleton-line wide" />
      <span className="skeleton-line" />
      <span className="skeleton-line short" />
    </div>
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

function useRelativeUpdatedLabel(lastUpdatedAt: Date | null): string | null {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (lastUpdatedAt == null) {
      return;
    }

    setNow(Date.now());
    const intervalId = window.setInterval(() => setNow(Date.now()), 30_000);

    return () => window.clearInterval(intervalId);
  }, [lastUpdatedAt]);

  if (lastUpdatedAt == null) {
    return null;
  }

  const elapsedSeconds = Math.max(0, Math.floor((now - lastUpdatedAt.getTime()) / 1000));

  if (elapsedSeconds < 10) {
    return 'just now';
  }

  if (elapsedSeconds < 60) {
    return `${elapsedSeconds}s ago`;
  }

  const elapsedMinutes = Math.floor(elapsedSeconds / 60);

  if (elapsedMinutes < 60) {
    return `${elapsedMinutes}m ago`;
  }

  return lastUpdatedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
