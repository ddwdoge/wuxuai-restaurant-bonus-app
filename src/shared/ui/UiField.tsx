import { useId, type ReactNode } from "react";

type UiFieldProps = {
  children: ReactNode;
  error?: string;
  helper?: string;
  htmlFor: string;
  label: string;
  optional?: boolean;
};

export function UiField({ children, error, helper, htmlFor, label, optional = false }: UiFieldProps) {
  const descriptionId = useId();
  return (
    <div className={`wux-field${error ? " wux-field-error" : ""}`}>
      <label className="wux-field-label" htmlFor={htmlFor}>
        {label}{optional ? <span>Optional</span> : <span aria-hidden="true">*</span>}
      </label>
      <div aria-describedby={helper || error ? descriptionId : undefined}>{children}</div>
      {error ? <p id={descriptionId} role="alert">{error}</p> : helper ? <p id={descriptionId}>{helper}</p> : null}
    </div>
  );
}
