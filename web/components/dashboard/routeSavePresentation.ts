type SaveMessageKey =
  | 'savingDetail'
  | 'savingTitle'
  | 'errorTitle'
  | 'changed'
  | 'dirtyTitle'
  | 'invalidTitle'
  | 'newDetail'
  | 'newTitle'
  | 'revision'
  | 'saved';
export type RouteSaveTranslator = (key: SaveMessageKey, values?: { number: number }) => string;

export type RouteSavePresentation = {
  detail: string | null;
  showDiscard: boolean;
  showSaveButton: boolean;
  showStickyBar: boolean;
  status: 'error' | 'idle' | 'progress' | 'success' | 'warning';
  title: string;
};

export function getRouteSavePresentation(
  {
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
  },
  t: RouteSaveTranslator,
): RouteSavePresentation {
  if (isSaving) {
    return {
      detail: t('savingDetail'),
      showDiscard: false,
      showSaveButton: true,
      showStickyBar: true,
      status: 'progress',
      title: t('savingTitle'),
    };
  }

  if (error != null) {
    return {
      detail: error,
      showDiscard: isDirty,
      showSaveButton: true,
      showStickyBar: true,
      status: 'error',
      title: t('errorTitle'),
    };
  }

  if (isDirty) {
    return {
      detail: (validationReason ?? changeSummary) || t('changed'),
      showDiscard: true,
      showSaveButton: true,
      showStickyBar: true,
      status: validationReason == null ? 'warning' : 'error',
      title: validationReason == null ? t('dirtyTitle') : t('invalidTitle'),
    };
  }

  if (isNew) {
    return {
      detail: validationReason ?? t('newDetail'),
      showDiscard: false,
      showSaveButton: true,
      showStickyBar: true,
      status: 'idle',
      title: t('newTitle'),
    };
  }

  return {
    detail: revisionNumber == null ? null : t('revision', { number: revisionNumber }),
    showDiscard: false,
    showSaveButton: false,
    showStickyBar: false,
    status: 'success',
    title: saveNotice ?? t('saved'),
  };
}
