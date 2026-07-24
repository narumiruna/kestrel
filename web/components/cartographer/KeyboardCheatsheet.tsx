'use client';

import { DialogFrame } from '@/components/ui/radix-ui';

type KeyboardCheatsheetProps = {
  isOpen: boolean;
  onClose: () => void;
};

const shortcuts = [
  ['g m', 'Go to Map'],
  ['g l', 'Go to Library'],
  ['g p', 'Go to Library / Places'],
  ['g r', 'Go to Library / Routes'],
  ['n', 'Create a new entry'],
  ['/', 'Focus notebook search'],
  ['?', 'Show or hide this sheet'],
  ['Esc', 'Close overlays'],
];

export function KeyboardCheatsheet({ isOpen, onClose }: KeyboardCheatsheetProps) {
  return (
    <DialogFrame
      className="keyboard-cheatsheet-card"
      eyebrow="shortcuts"
      open={isOpen}
      title="Keyboard field notes"
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
            <dd>{label}</dd>
          </div>
        ))}
      </dl>
    </DialogFrame>
  );
}
