type KeyboardCheatsheetProps = {
  isOpen: boolean;
  onClose: () => void;
};

const shortcuts = [
  ['g p', 'Go to Places'],
  ['g r', 'Go to Routes'],
  ['n', 'Create a new entry'],
  ['/', 'Focus notebook search'],
  ['?', 'Show or hide this sheet'],
  ['Esc', 'Close overlays'],
];

export function KeyboardCheatsheet({ isOpen, onClose }: KeyboardCheatsheetProps) {
  if (!isOpen) {
    return null;
  }

  return (
    <div
      className="keyboard-cheatsheet"
      role="dialog"
      aria-modal="true"
      aria-label="Keyboard shortcuts"
    >
      <div className="keyboard-cheatsheet-card">
        <header>
          <div>
            <p className="field-kicker font-mono">shortcuts</p>
            <h2 className="font-serif">Keyboard field notes</h2>
          </div>
          <button className="secondary" type="button" onClick={onClose}>
            Close
          </button>
        </header>
        <dl>
          {shortcuts.map(([keys, label]) => (
            <div key={keys}>
              <dt className="font-mono">{keys}</dt>
              <dd>{label}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}
