import { FolderOpen } from 'lucide-react';
import { useId } from 'react';
import type React from 'react';

export function Label({ htmlFor, children }: { htmlFor?: string; children: React.ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="text-xs font-medium text-[#8e98a4]">
      {children}
    </label>
  );
}

export function TextInput({
  value,
  placeholder,
  onChange,
  type = 'text',
  ariaLabel,
}: {
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
  type?: string;
  ariaLabel: string;
}) {
  return (
    <input
      value={value}
      type={type}
      onChange={(event) => onChange(event.target.value)}
      className="h-10 rounded-lg border border-white/[0.12] bg-black/30 px-3 text-sm text-white outline-none transition placeholder:text-[#68717b] focus:border-[#d8e071]/45"
      placeholder={placeholder}
      aria-label={ariaLabel}
    />
  );
}

export function LabeledInput({
  label,
  value,
  placeholder,
  onChange,
  onBlur,
}: {
  label: string;
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
}) {
  const inputId = useId();
  return (
    <div>
      <Label htmlFor={inputId}>{label}</Label>
      <input
        id={inputId}
        value={value}
        onBlur={onBlur}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 h-10 w-full rounded-lg border border-white/[0.12] bg-black/30 px-3 text-sm text-white outline-none transition placeholder:text-[#68717b] focus:border-[#d8e071]/45"
        placeholder={placeholder}
      />
    </div>
  );
}

interface PathInputProps {
  label: string;
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
  onBrowse: () => void;
}

export function PathInput({ label, value, placeholder, onChange, onBrowse }: PathInputProps) {
  const inputId = useId();
  return (
    <div>
      <Label htmlFor={inputId}>{label}</Label>
      <div className="mt-1 flex gap-2">
        <input
          id={inputId}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="h-10 min-w-0 flex-1 rounded-lg border border-white/[0.12] bg-black/30 px-3 text-sm text-white outline-none transition placeholder:text-[#68717b] focus:border-[#d8e071]/45"
          placeholder={placeholder}
        />
        <button
          type="button"
          onClick={onBrowse}
          aria-label={`${label} を参照`}
          className="flex h-10 cursor-pointer items-center gap-2 rounded-lg border border-white/[0.12] px-3 text-sm text-white transition hover:border-[#d8e071]/35"
        >
          <FolderOpen className="h-4 w-4" aria-hidden="true" />
          参照
        </button>
      </div>
    </div>
  );
}

export function IconButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="flex h-10 cursor-pointer items-center justify-center rounded-lg border border-white/[0.12] px-3 text-sm text-white transition hover:border-[#479ffa]/35 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {children}
    </button>
  );
}

export function PrimaryIconButton(props: Parameters<typeof IconButton>[0]) {
  return (
    <button
      type="button"
      aria-label={props.label}
      disabled={props.disabled}
      onClick={props.onClick}
      className="flex h-10 cursor-pointer items-center justify-center rounded-lg bg-[#d8e071] px-3 text-sm font-semibold text-black transition hover:bg-[#eef49a] disabled:cursor-not-allowed disabled:opacity-50"
    >
      {props.children}
    </button>
  );
}

export function SecondaryButton({
  disabled,
  onClick,
  children,
}: {
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="flex cursor-pointer items-center gap-2 rounded-lg border border-white/[0.12] px-3 py-2 text-sm text-white transition hover:border-[#479ffa]/35 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {children}
    </button>
  );
}

export function PrimaryButton({
  disabled,
  onClick,
  children,
}: {
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="cursor-pointer rounded-lg bg-[#d8e071] px-3 py-2 text-sm font-semibold text-black transition hover:bg-[#eef49a] disabled:cursor-not-allowed disabled:opacity-50"
    >
      {children}
    </button>
  );
}

export function RowMessage({ error, message }: { error: string | null; message: string | null }) {
  return (
    <div role="status" aria-live={error ? 'assertive' : 'polite'} aria-atomic="true">
      {error || message ? (
        <p className={`mt-3 text-sm ${error ? 'text-[#ffb4b4]' : 'text-[#cfd78a]'}`}>
          {error ?? message}
        </p>
      ) : null}
    </div>
  );
}

export function Message({ children, tone }: { children: React.ReactNode; tone: 'error' | 'info' }) {
  const className =
    tone === 'error'
      ? 'border-[#ff5c5c]/25 bg-[#ff5c5c]/10 text-[#ffd1d1]'
      : 'border-[#d8e071]/25 bg-[#d8e071]/10 text-[#f3f6c2]';
  return <div className={`rounded-lg border px-4 py-3 text-sm ${className}`}>{children}</div>;
}

export function SectionTitle({ title }: { title: string }) {
  return (
    <div>
      <h3 className="text-base font-semibold text-white">{title}</h3>
    </div>
  );
}
