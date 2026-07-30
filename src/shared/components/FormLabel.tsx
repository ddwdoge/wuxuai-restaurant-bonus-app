import type { LabelHTMLAttributes, ReactNode } from "react";

type FormLabelProps = LabelHTMLAttributes<HTMLLabelElement> & {
  children: ReactNode;
  optional?: boolean;
  required?: boolean;
};

export function FormLabel({ children, optional = false, required = false, ...props }: FormLabelProps) {
  return (
    <label {...props}>
      <span>{children}</span>
      {required ? (
        <>
          <span aria-hidden="true" className="required-field-marker"> *</span>
          <span className="sr-only"> Pflichtfeld</span>
        </>
      ) : null}
      {optional ? <span className="optional-field-marker"> Optional</span> : null}
    </label>
  );
}

export function RequiredFieldsNote() {
  return <p className="required-fields-note">Mit <span aria-hidden="true">*</span> gekennzeichnete Felder sind Pflichtfelder.</p>;
}
