'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  DEFAULT_MAP_STYLE,
  getAvailableMapStyles,
  getMapStyleLabel,
  getNextMapStyleName,
  isMapStyleName,
  type MapStyleName,
} from '@/components/mapStyle';

const STORAGE_KEY = 'kestrel-map-style';
const MAP_STYLE_EVENT = 'kestrel-map-style-change';
let hasLoggedStyleInfo = false;

type MapStyleContextDetail = {
  styleName: MapStyleName;
};

export function useMapStyle() {
  const [styleName, setStyleNameState] = useState<MapStyleName>(DEFAULT_MAP_STYLE);
  const availableStyles = useMemo(() => getAvailableMapStyles(), []);

  useEffect(() => {
    setStyleNameState(readStoredMapStyle() ?? DEFAULT_MAP_STYLE);
    logMapStyleInfoOnce();

    function handleStorage(event: StorageEvent) {
      if (event.key === STORAGE_KEY) {
        setStyleNameState(isMapStyleName(event.newValue) ? event.newValue : DEFAULT_MAP_STYLE);
      }
    }

    function handleLocalChange(event: Event) {
      const customEvent = event as CustomEvent<MapStyleContextDetail>;
      setStyleNameState(customEvent.detail.styleName);
    }

    window.addEventListener('storage', handleStorage);
    window.addEventListener(MAP_STYLE_EVENT, handleLocalChange);

    return () => {
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener(MAP_STYLE_EVENT, handleLocalChange);
    };
  }, []);

  const setStyleName = useCallback((nextStyleName: MapStyleName) => {
    writeStoredMapStyle(nextStyleName);
    setStyleNameState(nextStyleName);
    window.dispatchEvent(
      new CustomEvent<MapStyleContextDetail>(MAP_STYLE_EVENT, {
        detail: { styleName: nextStyleName },
      }),
    );
  }, []);

  const toggleStyleName = useCallback(() => {
    setStyleName(getNextMapStyleName(styleName));
  }, [setStyleName, styleName]);

  return {
    availableStyles,
    canToggle: availableStyles.length > 1,
    label: getMapStyleLabel(styleName),
    setStyleName,
    styleName,
    toggleStyleName,
  };
}

function readStoredMapStyle(): MapStyleName | null {
  try {
    const storedStyleName = window.localStorage.getItem(STORAGE_KEY);

    return isMapStyleName(storedStyleName) ? storedStyleName : null;
  } catch {
    return null;
  }
}

function writeStoredMapStyle(styleName: MapStyleName) {
  try {
    window.localStorage.setItem(STORAGE_KEY, styleName);
  } catch {
    // A blocked or full Web Storage area should not break map rendering.
  }
}

function logMapStyleInfoOnce() {
  if (hasLoggedStyleInfo || process.env.NODE_ENV === 'production') {
    return;
  }

  hasLoggedStyleInfo = true;
  console.info(
    'Kestrel map styles use built-in no-key OpenStreetMap raster sources; no map provider key is required.',
  );
}
