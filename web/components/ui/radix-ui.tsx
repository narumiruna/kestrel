'use client';

import {
  AlertDialog,
  Checkbox,
  Dialog,
  DropdownMenu,
  Popover,
  Button as RadixButton,
  Tabs as RadixTabs,
  TextArea as RadixTextArea,
  Select,
  TextField,
  Tooltip,
} from '@radix-ui/themes';
import { useRouter } from 'next/navigation';
import { Collapsible, ToggleGroup as RadixToggleGroup } from 'radix-ui';
import {
  type ComponentProps,
  type ReactElement,
  type ReactNode,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react';

export const Button = RadixButton;
export const TextArea = RadixTextArea;
export const TextInput = TextField.Root;
export const Toggle = RadixToggleGroup.Item;

export function ToggleGroup({
  'aria-label': ariaLabel,
  children,
  className,
  disabled,
  onValueChange,
  value,
}: {
  'aria-label': string;
  children: ReactNode;
  className?: string;
  disabled?: boolean;
  onValueChange: (value: string[]) => void;
  value: string[];
}) {
  return (
    <RadixToggleGroup.Root
      aria-label={ariaLabel}
      className={className}
      disabled={disabled}
      type="single"
      value={value.at(-1)}
      onValueChange={(nextValue) => onValueChange(nextValue.length === 0 ? [] : [nextValue])}
    >
      {children}
    </RadixToggleGroup.Root>
  );
}

function TabsIndicator(_props: { className?: string }) {
  return null;
}

function TabsList({
  activateOnFocus: _activateOnFocus,
  ...props
}: ComponentProps<typeof RadixTabs.List> & { activateOnFocus?: boolean }) {
  return <RadixTabs.List {...props} />;
}

export const Tabs = {
  Content: RadixTabs.Content,
  Indicator: TabsIndicator,
  List: TabsList,
  Panel: RadixTabs.Content,
  Root: RadixTabs.Root,
  Tab: RadixTabs.Trigger,
  Trigger: RadixTabs.Trigger,
};

function MenuLinkItem({
  children,
  onSelect,
  render,
  ...props
}: Omit<ComponentProps<typeof DropdownMenu.Item>, 'asChild'> & {
  children: ReactNode;
  render: ReactElement<{ href: string }>;
}) {
  const router = useRouter();

  return (
    <DropdownMenu.Item
      {...props}
      onSelect={(event) => {
        onSelect?.(event);
        if (!event.defaultPrevented) {
          router.push(render.props.href);
        }
      }}
    >
      {children}
    </DropdownMenu.Item>
  );
}

export const Menu = {
  ...DropdownMenu,
  LinkItem: MenuLinkItem,
};

export { Tooltip };

type CheckboxFieldProps = {
  checked: boolean;
  children: ReactNode;
  className?: string;
  disabled?: boolean;
  name?: string;
  onCheckedChange: (checked: boolean) => void;
};

export function CheckboxField({
  checked,
  children,
  className = '',
  disabled,
  name,
  onCheckedChange,
}: CheckboxFieldProps) {
  const id = useId();

  return (
    <div className={`ui-checkbox-field ${className}`.trim()}>
      <Checkbox
        checked={checked}
        className="ui-checkbox"
        disabled={disabled}
        id={id}
        name={name}
        onCheckedChange={(nextChecked) => onCheckedChange(nextChecked === true)}
      />
      <label htmlFor={id}>{children}</label>
    </div>
  );
}

type SelectFieldProps<Value extends string> = {
  className?: string;
  disabled?: boolean;
  label: ReactNode;
  options: ReadonlyArray<{ disabled?: boolean; label: ReactNode; value: Value }>;
  placeholder?: string;
  value: Value;
  onValueChange: (value: Value) => void;
};

export function SelectField<Value extends string>({
  className = '',
  disabled,
  label,
  onValueChange,
  options,
  placeholder,
  value,
}: SelectFieldProps<Value>) {
  const labelId = useId();

  return (
    <div className={`ui-select-field ${className}`.trim()}>
      <span className="ui-select-label" id={labelId}>
        {label}
      </span>
      <Select.Root value={value} onValueChange={(nextValue) => onValueChange(nextValue as Value)}>
        <Select.Trigger
          aria-labelledby={labelId}
          className="ui-select-trigger"
          disabled={disabled}
          placeholder={placeholder}
        />
        <Select.Content className="ui-select-popup" position="popper">
          {options.map((option) => (
            <Select.Item
              className="ui-select-item"
              disabled={option.disabled}
              key={option.value}
              value={option.value}
            >
              {option.label}
            </Select.Item>
          ))}
        </Select.Content>
      </Select.Root>
    </div>
  );
}

type DisclosureProps = {
  children: ReactNode;
  className?: string;
  defaultOpen?: boolean;
  disabled?: boolean;
  open?: boolean;
  summary: ReactNode;
  onOpenChange?: (open: boolean) => void;
};

export function Disclosure({
  children,
  className = '',
  defaultOpen,
  disabled,
  onOpenChange,
  open,
  summary,
}: DisclosureProps) {
  return (
    <Collapsible.Root
      className={`ui-disclosure ${className}`.trim()}
      defaultOpen={defaultOpen}
      disabled={disabled}
      open={open}
      onOpenChange={onOpenChange}
    >
      <Collapsible.Trigger className="ui-disclosure-trigger">
        <span className="ui-disclosure-summary">{summary}</span>
        <ChevronIcon />
      </Collapsible.Trigger>
      <Collapsible.Content className="ui-disclosure-panel">{children}</Collapsible.Content>
    </Collapsible.Root>
  );
}

type DialogFrameProps = {
  children: ReactNode;
  className?: string;
  description?: ReactNode;
  eyebrow?: ReactNode;
  open: boolean;
  restoreFocusElement?: HTMLElement | null;
  title: ReactNode;
  trigger?: ReactElement;
  onOpenChange: (open: boolean) => void;
};

export function DialogFrame({
  children,
  className = '',
  description,
  eyebrow,
  onOpenChange,
  open,
  restoreFocusElement,
  title,
  trigger,
}: DialogFrameProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      {trigger == null ? null : <Dialog.Trigger>{trigger}</Dialog.Trigger>}
      <Dialog.Content
        className={`ui-dialog-popup ${className}`.trim()}
        maxWidth="540px"
        onCloseAutoFocus={(event) => {
          if (restoreFocusElement != null) {
            event.preventDefault();
            restoreFocusElement.focus();
          }
        }}
      >
        <header className="ui-dialog-header">
          <div>
            {eyebrow == null ? null : <p className="field-kicker font-mono">{eyebrow}</p>}
            <Dialog.Title className="ui-dialog-title font-serif">{title}</Dialog.Title>
            {description == null ? null : (
              <Dialog.Description className="ui-dialog-description muted">
                {description}
              </Dialog.Description>
            )}
          </div>
          <Dialog.Close>
            <RadixButton className="secondary" type="button" variant="soft">
              Close
            </RadixButton>
          </Dialog.Close>
        </header>
        {children}
      </Dialog.Content>
    </Dialog.Root>
  );
}

type ConfirmDialogProps = {
  cancelLabel?: string;
  confirmLabel: string;
  description: ReactNode;
  disabled?: boolean;
  eyebrow?: ReactNode;
  isConfirming?: boolean;
  open?: boolean;
  restoreFocusElement?: HTMLElement | null;
  title: ReactNode;
  trigger?: ReactElement;
  onConfirm: () => Promise<void> | void;
  onOpenChange?: (open: boolean) => void;
};

export function ConfirmDialog({
  cancelLabel = 'Cancel',
  confirmLabel,
  description,
  disabled,
  eyebrow = 'Please confirm',
  isConfirming: controlledIsConfirming,
  onConfirm,
  onOpenChange,
  open,
  restoreFocusElement,
  title,
  trigger,
}: ConfirmDialogProps) {
  const [internalIsConfirming, setInternalIsConfirming] = useState(false);
  const cancelButtonRef = useRef<HTMLButtonElement | null>(null);
  const isConfirming = controlledIsConfirming ?? internalIsConfirming;

  useEffect(() => {
    if (open !== true) {
      return;
    }

    const timeoutId = window.setTimeout(() => cancelButtonRef.current?.focus(), 250);
    return () => window.clearTimeout(timeoutId);
  }, [open]);

  async function confirm() {
    setInternalIsConfirming(true);
    try {
      await onConfirm();
    } finally {
      setInternalIsConfirming(false);
    }
  }

  return (
    <AlertDialog.Root open={open} onOpenChange={onOpenChange}>
      {trigger == null ? null : (
        <AlertDialog.Trigger disabled={disabled}>{trigger}</AlertDialog.Trigger>
      )}
      <AlertDialog.Content
        className="ui-dialog-popup ui-alert-dialog-popup"
        maxWidth="500px"
        onCloseAutoFocus={(event) => {
          if (restoreFocusElement != null) {
            event.preventDefault();
            restoreFocusElement.focus();
          }
        }}
      >
        <div>
          <p className="field-kicker font-mono">{eyebrow}</p>
          <AlertDialog.Title className="ui-dialog-title font-serif">{title}</AlertDialog.Title>
          <AlertDialog.Description className="ui-dialog-description muted">
            {description}
          </AlertDialog.Description>
          <div className="ui-dialog-actions">
            <AlertDialog.Cancel>
              <RadixButton
                ref={cancelButtonRef}
                className="secondary"
                disabled={isConfirming}
                type="button"
                variant="soft"
              >
                {cancelLabel}
              </RadixButton>
            </AlertDialog.Cancel>
            <AlertDialog.Action>
              <RadixButton
                color="red"
                disabled={isConfirming}
                type="button"
                variant="solid"
                onClick={() => void confirm()}
              >
                {isConfirming ? 'Working…' : confirmLabel}
              </RadixButton>
            </AlertDialog.Action>
          </div>
        </div>
      </AlertDialog.Content>
    </AlertDialog.Root>
  );
}

type MenuSurfaceProps = {
  align?: ComponentProps<typeof DropdownMenu.Content>['align'];
  children: ReactNode;
  className?: string;
  side?: ComponentProps<typeof DropdownMenu.Content>['side'];
  trigger: ReactElement;
};

export function MenuSurface({
  align = 'end',
  children,
  className = '',
  side = 'bottom',
  trigger,
}: MenuSurfaceProps) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger>{trigger}</DropdownMenu.Trigger>
      <DropdownMenu.Content
        align={align}
        className={`ui-menu-popup ${className}`.trim()}
        side={side}
      >
        {children}
      </DropdownMenu.Content>
    </DropdownMenu.Root>
  );
}

type PopoverFrameProps = {
  align?: ComponentProps<typeof Popover.Content>['align'];
  children: ReactNode;
  className?: string;
  open: boolean;
  sideOffset?: number;
  title: string;
  trigger: ReactElement;
  onOpenChange: (open: boolean) => void;
};

export function PopoverFrame({
  align = 'end',
  children,
  className = '',
  onOpenChange,
  open,
  sideOffset = 8,
  title,
  trigger,
}: PopoverFrameProps) {
  return (
    <Popover.Root open={open} onOpenChange={onOpenChange}>
      <Popover.Trigger>{trigger}</Popover.Trigger>
      <Popover.Content
        align={align}
        aria-label={title}
        className={`ui-popover-popup ${className}`.trim()}
        sideOffset={sideOffset}
      >
        {children}
      </Popover.Content>
    </Popover.Root>
  );
}

type HintProps = {
  children: ReactElement;
  label: ReactNode;
};

export function Hint({ children, label }: HintProps) {
  return <Tooltip content={label}>{children}</Tooltip>;
}

function ChevronIcon() {
  return (
    <svg aria-hidden="true" className="ui-disclosure-icon" fill="none" viewBox="0 0 16 16">
      <path d="m4 6 4 4 4-4" />
    </svg>
  );
}
