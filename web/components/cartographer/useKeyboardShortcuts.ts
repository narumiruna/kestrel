'use client';

import { useEffect, useRef } from 'react';

type ShortcutHandlers = {
  onClose?: () => void;
  onFocusSearch?: () => void;
  onGoLibrary?: () => void;
  onGoMap?: () => void;
  onGoPlaces?: () => void;
  onGoRoutes?: () => void;
  onNew?: () => void;
  onToggleHelp?: () => void;
};

const SEQUENCE_TIMEOUT_MS = 900;

export function useKeyboardShortcuts({
  onClose,
  onFocusSearch,
  onGoLibrary,
  onGoMap,
  onGoPlaces,
  onGoRoutes,
  onNew,
  onToggleHelp,
}: ShortcutHandlers) {
  const sequenceRef = useRef<string | null>(null);
  const timeoutRef = useRef<number | null>(null);

  useEffect(() => {
    function clearSequence() {
      sequenceRef.current = null;
      if (timeoutRef.current != null) {
        window.clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    }

    function startSequence(value: string) {
      clearSequence();
      sequenceRef.current = value;
      timeoutRef.current = window.setTimeout(clearSequence, SEQUENCE_TIMEOUT_MS);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (isEditableTarget(event.target)) {
        return;
      }

      if (event.key === 'Escape') {
        clearSequence();
        onClose?.();
        return;
      }

      if (event.key === '?') {
        event.preventDefault();
        clearSequence();
        onToggleHelp?.();
        return;
      }

      if (event.key === '/') {
        event.preventDefault();
        clearSequence();
        onFocusSearch?.();
        return;
      }

      if (event.key.toLowerCase() === 'n') {
        event.preventDefault();
        clearSequence();
        onNew?.();
        return;
      }

      if (event.key.toLowerCase() === 'g') {
        event.preventDefault();
        startSequence('g');
        return;
      }

      if (sequenceRef.current === 'g') {
        const key = event.key.toLowerCase();

        if (key === 'l') {
          event.preventDefault();
          clearSequence();
          onGoLibrary?.();
          return;
        }

        if (key === 'm') {
          event.preventDefault();
          clearSequence();
          onGoMap?.();
          return;
        }

        if (key === 'p') {
          event.preventDefault();
          clearSequence();
          onGoPlaces?.();
          return;
        }

        if (key === 'r') {
          event.preventDefault();
          clearSequence();
          onGoRoutes?.();
          return;
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      clearSequence();
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose, onFocusSearch, onGoLibrary, onGoMap, onGoPlaces, onGoRoutes, onNew, onToggleHelp]);
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  const tagName = target.tagName.toLowerCase();

  return (
    tagName === 'input' ||
    tagName === 'select' ||
    tagName === 'textarea' ||
    target.isContentEditable
  );
}
