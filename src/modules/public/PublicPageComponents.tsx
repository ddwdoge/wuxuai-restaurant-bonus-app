import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
} from "react";
import { useId } from "react";
import type { LucideIcon } from "lucide-react";
import { ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import "./public-entry-premium.css";

type PublicPageShellProps = {
  children: ReactNode;
  description: string;
  eyebrow: string;
  title: string;
  width?: "entry" | "form";
};

export function PublicPageShell({
  children,
  description,
  eyebrow,
  title,
  width = "form",
}: PublicPageShellProps) {
  const titleId = useId();

  return (
    <main className="public-premium-shell">
      <section
        aria-labelledby={titleId}
        className={`public-premium-page public-premium-page-${width}`}
      >
        <header className="public-premium-hero">
          <span className="public-premium-eyebrow">{eyebrow}</span>
          <h1 id={titleId}>{title}</h1>
          <p>{description}</p>
        </header>
        {children}
      </section>
    </main>
  );
}

export function PublicContentCard({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={`public-premium-card ${className}`.trim()}>{children}</div>;
}

type PublicFormFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, "className"> & {
  error?: string | null;
  hint?: string;
  label: string;
  optional?: boolean;
};

export function PublicFormField({
  error,
  hint,
  id,
  label,
  optional = false,
  ...inputProps
}: PublicFormFieldProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const errorId = `${inputId}-error`;
  const hintId = `${inputId}-hint`;
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(" ") || undefined;

  return (
    <div className="public-premium-field">
      <label htmlFor={inputId}>
        <span>{label}</span>
        {optional ? <small>Optional</small> : null}
      </label>
      <input
        {...inputProps}
        aria-describedby={describedBy}
        aria-invalid={error ? true : undefined}
        id={inputId}
      />
      {hint ? <small className="public-premium-field-hint" id={hintId}>{hint}</small> : null}
      {error ? <small className="public-premium-field-error" id={errorId}>{error}</small> : null}
    </div>
  );
}

type PublicPrimaryButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  icon?: ReactNode;
  loading?: boolean;
  loadingLabel?: string;
};

export function PublicPrimaryButton({
  children,
  disabled,
  icon,
  loading = false,
  loadingLabel = "Wird geladen …",
  ...buttonProps
}: PublicPrimaryButtonProps) {
  return (
    <button
      {...buttonProps}
      aria-busy={loading}
      className="public-premium-primary-button"
      disabled={disabled || loading}
    >
      <span className="public-premium-button-icon" aria-hidden="true">{icon}</span>
      <span>{loading ? loadingLabel : children}</span>
    </button>
  );
}

export function PublicPrimaryLink({ children, to }: { children: ReactNode; to: string }) {
  return (
    <Link className="public-premium-primary-button" to={to}>
      <span>{children}</span>
      <ArrowRight aria-hidden="true" size={18} />
    </Link>
  );
}

type PublicEntryCardProps = {
  action: string;
  description: string;
  icon: LucideIcon;
  title: string;
  to: string;
};

export function PublicEntryCard({ action, description, icon: Icon, title, to }: PublicEntryCardProps) {
  return (
    <Link
      aria-label={`${title}: ${action}`}
      className="public-premium-entry-card"
      onKeyDown={(event) => {
        if (event.key === " ") {
          event.preventDefault();
          event.currentTarget.click();
        }
      }}
      to={to}
    >
      <span className="public-premium-entry-icon" aria-hidden="true"><Icon size={26} /></span>
      <span className="public-premium-entry-copy">
        <strong>{title}</strong>
        <span>{description}</span>
        <span className="public-premium-entry-action">{action}<ArrowRight aria-hidden="true" size={16} /></span>
      </span>
    </Link>
  );
}
