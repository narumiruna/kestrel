'use client';

import { IconButton, Select, TextField } from '@radix-ui/themes';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { useId, useMemo, useRef, useState } from 'react';
import DashboardShell from '@/components/dashboard/DashboardShell';
import { LibraryItemActions } from '@/components/dashboard/LibraryItemActions';
import { matchesPlaceSearch, matchesRouteSearch } from '@/components/dashboard/librarySearch';
import {
  type LibraryEntry,
  type LibrarySort,
  sortLibraryEntries,
} from '@/components/dashboard/librarySort';
import { useDashboardLibraryData } from '@/components/dashboard/useDashboardLibraryData';
import {
  formatCoord,
  formatMode,
  formatRouteDistanceFromWaypoints,
} from '@/components/dashboard/utils';
import {
  ArrowRightIcon,
  ChevronDownIcon,
  Cross2Icon,
  MagnifyingGlassIcon,
  PlusIcon,
  SewingPinIcon,
  Share1Icon,
} from '@/components/ui/icons';
import {
  Button,
  Menu,
  MenuSurface,
  PopoverFrame,
  TextInput,
  Toggle,
  ToggleGroup,
} from '@/components/ui/radix-ui';
import { formatNumber, formatSpeed } from '@/i18n/format';
import type { Place, Route } from '@/lib/api';

export type LibraryFilter = 'all' | 'places' | 'routes';

export default function LibraryCatalog({
  initialFilter = 'all',
}: {
  initialFilter?: LibraryFilter;
}) {
  const t = useTranslations('LibraryCatalog');
  const locale = useLocale();
  const tm = useTranslations('routeModes');
  const {
    auth,
    error,
    isLoading,
    lastLoadedAt,
    places,
    placesError,
    refresh,
    routes,
    routesError,
  } = useDashboardLibraryData();
  const [filter, setFilter] = useState<LibraryFilter>(initialFilter);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<LibrarySort>('name');
  const searchRef = useRef<HTMLInputElement | null>(null);
  const normalizedQuery = query.trim().toLocaleLowerCase(locale);
  const filteredPlaces = useMemo(
    () => places.filter((place) => matchesPlaceSearch(place, normalizedQuery, locale)),
    [normalizedQuery, places, locale],
  );
  const filteredRoutes = useMemo(
    () =>
      routes.filter((route) =>
        matchesRouteSearch(route, normalizedQuery, locale, formatMode(route.mode, tm)),
      ),
    [normalizedQuery, routes, locale, tm],
  );

  const visibleEntries = useMemo(() => {
    const entries: LibraryEntry[] = [];
    if (filter !== 'routes') {
      entries.push(...filteredPlaces.map((item) => ({ kind: 'places' as const, item })));
    }
    if (filter !== 'places') {
      entries.push(...filteredRoutes.map((item) => ({ kind: 'routes' as const, item })));
    }
    return sortLibraryEntries(entries, sort, locale);
  }, [filter, filteredPlaces, filteredRoutes, sort, locale]);

  function clearSearch() {
    setQuery('');
    searchRef.current?.focus();
  }

  if (!auth.isHydrated || !auth.isAuthenticated || auth.session == null) {
    return (
      <main className="library-page-shell">
        <p className="muted" role="status">
          {t('loadingLibrary')}
        </p>
      </main>
    );
  }

  const showPlaces = filter !== 'routes';
  const showRoutes = filter !== 'places';
  const totalItems = places.length + routes.length;
  const didLibraryLoadFail = placesError != null && routesError != null;
  const totalVisible =
    (showPlaces ? filteredPlaces.length : 0) + (showRoutes ? filteredRoutes.length : 0);
  const activeError = (showPlaces && placesError != null) || (showRoutes && routesError != null);
  const resultSummary = isLoading
    ? t(totalItems === 0 ? 'loadingLibrary' : 'updatingLibrary')
    : t('resultSummary', {
        count: totalVisible,
        kind: filter,
        available: error == null ? 'no' : 'yes',
        searching: normalizedQuery.length > 0 ? 'yes' : 'no',
      });

  return (
    <DashboardShell
      activeSection="library"
      isRefreshing={isLoading}
      lastUpdatedAt={lastLoadedAt}
      username={auth.session.user.username}
      onLogout={auth.logout}
      onRefresh={() => void refresh()}
    >
      <section className="library-catalog" aria-labelledby="library-heading">
        <header className="library-catalog-header">
          <div>
            <h1 id="library-heading">{t('library')}</h1>
            <p>{t('savedPlacesAndRoutes')}</p>
          </div>
          <MenuSurface
            className="library-new-menu-content"
            trigger={
              <Button className="library-new-menu-trigger" type="button">
                <PlusIcon aria-hidden /> {t('newItem')}
                <ChevronDownIcon aria-hidden />
              </Button>
            }
          >
            <Menu.LinkItem
              className="ui-menu-link-item"
              render={<Link href="/dashboard/map?kind=places&new=1" />}
            >
              <SewingPinIcon aria-hidden /> {t('newPlace')}
            </Menu.LinkItem>
            <Menu.LinkItem
              className="ui-menu-link-item"
              render={<Link href="/dashboard/map?kind=routes&new=1" />}
            >
              <Share1Icon aria-hidden /> {t('newRoute')}
            </Menu.LinkItem>
          </MenuSurface>
        </header>

        <div className="library-toolbar">
          <label htmlFor="library-search" className="library-search">
            <span className="sr-only">{t('searchLibrary')}</span>
            <TextInput
              id="library-search"
              ref={searchRef}
              placeholder={t('searchNamesNotesTagsOrModes')}
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            >
              <TextField.Slot>
                <MagnifyingGlassIcon aria-hidden />
              </TextField.Slot>
              {query.length === 0 ? null : (
                <TextField.Slot side="right">
                  <IconButton
                    aria-label={t('clearSearch')}
                    type="button"
                    variant="ghost"
                    onClick={clearSearch}
                  >
                    <Cross2Icon aria-hidden />
                  </IconButton>
                </TextField.Slot>
              )}
            </TextInput>
          </label>
          <ToggleGroup
            aria-label={t('libraryItemType')}
            className="library-filter-tabs"
            type="single"
            value={filter}
            onValueChange={(nextFilter) => {
              if (nextFilter !== '') {
                setFilter(nextFilter as LibraryFilter);
              }
            }}
          >
            <Toggle value="all">
              {t('all')}
              <span>{isLoading || error != null ? '—' : formatNumber(totalItems, locale)}</span>
            </Toggle>
            <Toggle value="places">
              {t('places')}
              <span>
                {isLoading || placesError != null ? '—' : formatNumber(places.length, locale)}
              </span>
            </Toggle>
            <Toggle value="routes">
              {t('routes')}
              <span>
                {isLoading || routesError != null ? '—' : formatNumber(routes.length, locale)}
              </span>
            </Toggle>
          </ToggleGroup>
          <Select.Root value={sort} onValueChange={(value) => setSort(value as LibrarySort)}>
            <Select.Trigger aria-label={t('sortLibrary')} className="library-sort" />
            <Select.Content>
              <Select.Item value="name">{t('name')}</Select.Item>
              <Select.Item value="updated">{t('recentlyUpdated')}</Select.Item>
            </Select.Content>
          </Select.Root>
        </div>

        {error == null ? null : (
          <div className="library-load-error" role="alert">
            <div>
              <strong>
                {didLibraryLoadFail ? t('couldnTLoadYourLibrary') : t('someItemsCouldnTBeUpdated')}
              </strong>
              <p>
                {error}
                {totalItems === 0 ? '' : t('availableItemsAreStillShown')}
              </p>
            </div>
            <Button
              className="secondary"
              disabled={isLoading}
              type="button"
              onClick={() => void refresh()}
            >
              {t('tryAgain')}
            </Button>
          </div>
        )}
        {isLoading && totalItems === 0 ? <LibrarySkeleton /> : null}
        {!isLoading && !activeError && totalVisible === 0 ? (
          <LibraryEmptyState
            filter={filter}
            isSearching={normalizedQuery.length > 0}
            onClearSearch={clearSearch}
          />
        ) : null}

        <div className="library-column-headings" aria-hidden="true">
          <span />
          <div className="library-columns">
            <span>{t('name')}</span>
            <span>{t('type')}</span>
            <span>{t('details')}</span>
            <span />
          </div>
          <span>{t('actions')}</span>
        </div>
        <div className="library-item-list" aria-busy={isLoading}>
          {visibleEntries.map((entry) =>
            entry.kind === 'places' ? (
              <PlaceLibraryRow
                key={`places:${entry.item.id}`}
                place={entry.item}
                onDeleted={refresh}
              />
            ) : (
              <RouteLibraryRow
                key={`routes:${entry.item.id}`}
                route={entry.item}
                onDeleted={refresh}
              />
            ),
          )}
        </div>
        <p className="library-results-summary" role="status" aria-atomic="true">
          {resultSummary} ·{' '}
          {t('totalSummary', {
            count: totalItems,
            state: error == null && !isLoading ? 'total' : 'loaded',
          })}
        </p>
      </section>
    </DashboardShell>
  );
}

function LibraryEmptyState({
  filter,
  isSearching,
  onClearSearch,
}: {
  filter: LibraryFilter;
  isSearching: boolean;
  onClearSearch: () => void;
}) {
  const t = useTranslations('LibraryCatalog');
  return (
    <div className="library-empty-state">
      <div className="library-empty-icon" aria-hidden>
        {isSearching ? (
          <MagnifyingGlassIcon />
        ) : filter === 'routes' ? (
          <Share1Icon />
        ) : (
          <SewingPinIcon />
        )}
      </div>
      <h2 className="library-empty-title">
        {isSearching ? t('noMatching', { kind: filter }) : t('noneYet', { kind: filter })}
      </h2>
      <p className="muted library-empty-copy">
        {isSearching
          ? t('tryAnotherNameNoteTagOrModeOrClearYour')
          : filter === 'places'
            ? t('saveALocationOnTheMapToFindItHere')
            : filter === 'routes'
              ? t('connectPointsOnTheMapAndSaveARouteTo')
              : t('saveAPlaceForASingleLocationOrBuildA')}
      </p>
      <div className="library-empty-actions">
        {isSearching ? (
          <Button className="secondary" type="button" onClick={onClearSearch}>
            {t('clearSearch')}
          </Button>
        ) : (
          <>
            {filter === 'routes' ? null : (
              <Button asChild>
                <Link href="/dashboard/map?kind=places&new=1">{t('createPlace')}</Link>
              </Button>
            )}
            {filter === 'places' ? null : (
              <Button asChild variant={filter === 'routes' ? 'solid' : 'soft'}>
                <Link href="/dashboard/map?kind=routes&new=1">{t('createRoute')}</Link>
              </Button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function PlaceLibraryRow({ place, onDeleted }: { place: Place; onDeleted: () => Promise<void> }) {
  const t = useTranslations('LibraryCatalog');
  return (
    <article className="library-item-row">
      <div className="library-item-type" aria-hidden="true">
        <SewingPinIcon />
      </div>
      <Link
        className="library-item-main library-columns"
        href={`/dashboard/map?kind=places&selected=${encodeURIComponent(place.id)}`}
      >
        <div className="library-item-title-row">
          <h3 title={place.name}>{place.name}</h3>
        </div>
        <span className="library-item-kind">{t('place')}</span>
        <p className="library-item-meta">
          {formatCoord(place.latitude)}, {formatCoord(place.longitude)}
        </p>
        <span className="library-open-label">
          {t('openOnMap')}
          <ArrowRightIcon aria-hidden />
        </span>
      </Link>
      <div className="library-row-actions">
        <LibraryNotes name={place.name} description={place.description} tags={place.tags} />
        <LibraryItemActions
          itemId={place.id}
          itemKind="places"
          itemName={place.name}
          onDeleted={onDeleted}
        />
      </div>
    </article>
  );
}

function RouteLibraryRow({ route, onDeleted }: { route: Route; onDeleted: () => Promise<void> }) {
  const t = useTranslations('LibraryCatalog');
  const tm = useTranslations('routeModes');
  const locale = useLocale();
  const waypointCount = route.currentRevision?.waypoints.length ?? 0;

  return (
    <article className="library-item-row">
      <div className="library-item-type library-item-type-route" aria-hidden="true">
        <Share1Icon />
      </div>
      <Link
        className="library-item-main library-columns"
        href={`/dashboard/map?kind=routes&selected=${encodeURIComponent(route.id)}`}
      >
        <div className="library-item-title-row">
          <h3 title={route.name}>{route.name}</h3>
          {route.isPublic ? <span className="chip">{t('public')}</span> : null}
        </div>
        <span className="library-item-kind">{t('route')}</span>
        <p
          className="library-item-meta"
          title={t('routeDetails', {
            count: waypointCount,
            speed: formatSpeed(route.defaultSpeedKmh, locale),
          })}
        >
          {formatRouteDistanceFromWaypoints(route.currentRevision?.waypoints ?? [], locale)} ·{' '}
          {formatMode(route.mode, tm)}
        </p>
        <span className="library-open-label">
          {t('openOnMap')}
          <ArrowRightIcon aria-hidden />
        </span>
      </Link>
      <div className="library-row-actions">
        <LibraryNotes name={route.name} description={route.description} />
        <LibraryItemActions
          itemId={route.id}
          itemKind="routes"
          itemName={route.name}
          onDeleted={onDeleted}
        />
      </div>
    </article>
  );
}

function LibraryNotes({
  name,
  description,
  tags = [],
}: {
  name: string;
  description: string | null;
  tags?: string[];
}) {
  const t = useTranslations('LibraryCatalog');
  const [isOpen, setIsOpen] = useState(false);
  const referenceUrlId = useId();
  if (!description && tags.length === 0) return null;
  const link = /^https?:\/\/\S+$/i.test(description?.trim() ?? '') ? description?.trim() : null;
  return (
    <PopoverFrame
      className="library-notes-popover"
      title={t('notesFor', { name })}
      open={isOpen}
      onOpenChange={setIsOpen}
      trigger={
        <Button aria-label={t('viewNotes', { name })} variant="ghost" type="button">
          {t('notes')}
        </Button>
      }
    >
      {description ? (
        <p>
          {link ? (
            <a href={link} title={link} target="_blank" rel="noopener noreferrer">
              {t('linkToReference')}
            </a>
          ) : (
            description
          )}
        </p>
      ) : null}
      {link == null ? null : (
        <label htmlFor={referenceUrlId}>
          {t('referenceURL')}
          <TextInput id={referenceUrlId} readOnly value={link} />
        </label>
      )}
      {tags.length === 0 ? null : (
        <p className="muted">{t('tagsList', { tags: tags.join(' · ') })}</p>
      )}
    </PopoverFrame>
  );
}

function LibrarySkeleton() {
  const t = useTranslations('LibraryCatalog');
  return (
    <div aria-label={t('loadingLibraryItems')} className="library-skeleton" role="status">
      <span className="library-skeleton-line" />
      <span className="library-skeleton-line" />
      <span className="library-skeleton-line" />
    </div>
  );
}
