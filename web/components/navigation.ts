type LinkClick = {
  button: number;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  defaultPrevented: boolean;
  currentTarget: { target: string; hasAttribute: (name: string) => boolean };
};

export function isCurrentTabNavigation(event: LinkClick) {
  return (
    !event.defaultPrevented &&
    event.button === 0 &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.shiftKey &&
    !event.altKey &&
    (!event.currentTarget.target || event.currentTarget.target === '_self') &&
    !event.currentTarget.hasAttribute('download')
  );
}
