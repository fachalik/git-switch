import type { ReactNode } from "react";
import { useEffect } from "react";

type ButtonVariant = "primary" | "default" | "ghost" | "danger";

const BUTTON_STYLES: Record<ButtonVariant, string> = {
  primary:
    "bg-accent text-white border-transparent hover:opacity-90 disabled:opacity-40",
  default:
    "bg-surface text-ink border-line-strong hover:bg-sunken disabled:opacity-40",
  ghost:
    "bg-transparent text-ink-soft border-transparent hover:bg-sunken hover:text-ink disabled:opacity-40",
  danger:
    "bg-transparent text-bad border-line-strong hover:bg-bad-soft disabled:opacity-40",
};

export function Button({
  children,
  onClick,
  variant = "default",
  disabled,
  type = "button",
  title,
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  type?: "button" | "submit";
  title?: string;
}) {
  return (
    <button
      type={type}
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[12px] font-medium transition-colors disabled:cursor-not-allowed ${BUTTON_STYLES[variant]}`}
    >
      {children}
    </button>
  );
}

type Tone = "neutral" | "good" | "warn" | "bad" | "accent";

const TONE_STYLES: Record<Tone, string> = {
  neutral: "bg-sunken text-ink-soft",
  good: "bg-good-soft text-good",
  warn: "bg-warn-soft text-warn",
  bad: "bg-bad-soft text-bad",
  accent: "bg-accent-soft text-accent",
};

export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: Tone;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium ${TONE_STYLES[tone]}`}
    >
      {children}
    </span>
  );
}

export function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: ReactNode;
  error?: string;
  children: ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[12px] font-medium text-ink">{label}</span>
      {children}
      {error ? (
        <span className="text-[11px] text-bad">{error}</span>
      ) : hint ? (
        <span className="text-[11px] leading-snug text-ink-faint">{hint}</span>
      ) : null}
    </label>
  );
}

export function Input({
  value,
  onChange,
  placeholder,
  mono,
  invalid,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  mono?: boolean;
  invalid?: boolean;
}) {
  return (
    <input
      value={value}
      placeholder={placeholder}
      spellCheck={false}
      autoCapitalize="off"
      autoCorrect="off"
      onChange={(event) => onChange(event.target.value)}
      className={`w-full rounded-md border bg-surface px-2.5 py-1.5 text-[12px] text-ink outline-none transition-colors placeholder:text-ink-faint focus:border-accent ${
        invalid ? "border-bad" : "border-line-strong"
      } ${mono ? "font-mono" : ""}`}
    />
  );
}

export function Modal({
  title,
  subtitle,
  onClose,
  children,
  footer,
  wide,
}: {
  title: string;
  subtitle?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6"
      onClick={onClose}
    >
      <div
        onClick={(event) => event.stopPropagation()}
        className={`flex max-h-full w-full flex-col overflow-hidden rounded-xl border border-line bg-surface shadow-2xl ${
          wide ? "max-w-3xl" : "max-w-lg"
        }`}
      >
        <header className="border-b border-line px-4 py-3">
          <h2 className="text-[13px] font-semibold text-ink">{title}</h2>
          {subtitle ? (
            <p className="mt-0.5 text-[11px] text-ink-soft">{subtitle}</p>
          ) : null}
        </header>
        <div className="min-h-0 flex-1 overflow-auto px-4 py-3">{children}</div>
        {footer ? (
          <footer className="flex items-center justify-end gap-2 border-t border-line bg-sunken px-4 py-3">
            {footer}
          </footer>
        ) : null}
      </div>
    </div>
  );
}

export interface ToastMessage {
  id: number;
  tone: "good" | "bad" | "neutral";
  text: string;
}

export function Toasts({
  toasts,
  onDismiss,
}: {
  toasts: ToastMessage[];
  onDismiss: (id: number) => void;
}) {
  return (
    <div className="pointer-events-none fixed bottom-4 left-1/2 z-60 flex w-full max-w-md -translate-x-1/2 flex-col gap-2 px-4">
      {toasts.map((toast) => (
        <button
          key={toast.id}
          onClick={() => onDismiss(toast.id)}
          className={`pointer-events-auto rounded-lg border px-3 py-2 text-left text-[12px] shadow-lg ${
            toast.tone === "bad"
              ? "border-bad/40 bg-bad-soft text-bad"
              : toast.tone === "good"
                ? "border-good/40 bg-good-soft text-good"
                : "border-line bg-surface text-ink"
          }`}
        >
          {toast.text}
        </button>
      ))}
    </div>
  );
}

export function EmptyState({
  title,
  children,
}: {
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 p-10 text-center">
      <p className="text-[13px] font-medium text-ink">{title}</p>
      {children ? (
        <div className="max-w-sm text-[12px] leading-relaxed text-ink-soft">
          {children}
        </div>
      ) : null}
    </div>
  );
}
