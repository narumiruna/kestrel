'use client';

import { useTranslations } from 'next-intl';
import { DialogFrame } from '@/components/ui/radix-ui';

type KeyboardCheatsheetProps = {
  isOpen: boolean;
  onClose: () => void;
};

const shortcuts = [
  ['g m', 'goMap'],
  ['g l', 'goLibrary'],
  ['g p', 'goPlaces'],
  ['g r', 'goRoutes'],
  ['n', 'createEntry'],
  ['/', 'focusSearch'],
  ['?', 'toggleHelp'],
  ['Esc', 'closeOverlays'],
] as const;

export function KeyboardCheatsheet({ isOpen, onClose }: KeyboardCheatsheetProps) {
  const t = useTranslations('KeyboardCheatsheet');
  return (
    <DialogFrame
      className="keyboard-cheatsheet-card"
      eyebrow={t('shortcuts')}
      open={isOpen}
      title={t('keyboardFieldNotes')}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
    >
      <dl>
        {shortcuts.map(([keys, label]) => (
          <div key={keys}>
            <dt className="font-mono">{keys}</dt>
            <dd>{t(label)}</dd>
          </div>
        ))}
      </dl>
    </DialogFrame>
  );
}
