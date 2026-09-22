export type RouteSavePresentation = {
  detail: string | null;
  showDiscard: boolean;
  showSaveButton: boolean;
  showStickyBar: boolean;
  status: 'error' | 'idle' | 'progress' | 'success' | 'warning';
  title: string;
};

export function getRouteSavePresentation({
  changeSummary,
  error,
  isDirty,
  isNew,
  isSaving,
  revisionNumber,
  saveNotice,
  validationReason,
}: {
  changeSummary: string;
  error: string | null;
  isDirty: boolean;
  isNew: boolean;
  isSaving: boolean;
  revisionNumber: number | null;
  saveNotice: string | null;
  validationReason: string | null;
}): RouteSavePresentation {
  if (isSaving) {
    return {
      detail: 'Keep this page open until the cloud confirms the revision.',
      showDiscard: false,
      showSaveButton: true,
      showStickyBar: true,
      status: 'progress',
      title: 'Saving route…',
    };
  }

  if (error != null) {
    return {
      detail: error,
      showDiscard: isDirty,
      showSaveButton: true,
      showStickyBar: true,
      status: 'error',
      title: 'Route not saved',
    };
  }

  if (isDirty) {
    return {
      detail: (validationReason ?? changeSummary) || 'Route changed',
      showDiscard: true,
      showSaveButton: true,
      showStickyBar: true,
      status: validationReason == null ? 'warning' : 'error',
      title: validationReason == null ? 'Unsaved changes' : 'Not ready to save',
    };
  }

  if (isNew) {
    return {
      detail: validationReason ?? 'Add route details before saving.',
      showDiscard: false,
      showSaveButton: true,
      showStickyBar: true,
      status: 'idle',
      title: 'Not saved yet',
    };
  }

  return {
    detail: revisionNumber == null ? null : `Revision ${revisionNumber}`,
    showDiscard: false,
    showSaveButton: false,
    showStickyBar: false,
    status: 'success',
    title: saveNotice ?? 'Saved to cloud',
  };
}
