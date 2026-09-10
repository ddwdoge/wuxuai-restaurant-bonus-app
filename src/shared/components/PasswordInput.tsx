import { forwardRef, useRef, useState, type InputHTMLAttributes } from "react";
import { Eye, EyeOff } from "lucide-react";
import { useI18n } from "../i18n/I18nProvider";
import { translateStructural } from "../i18n/catalog.mjs";
import "./password-input.css";

type PasswordInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type">;

export const PasswordInput = forwardRef<HTMLInputElement, PasswordInputProps>(function PasswordInput(
  { disabled, id, ...inputProps },
  forwardedRef,
) {
  const { language } = useI18n();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [visible, setVisible] = useState(false);
  const label = translateStructural(visible ? "auth.password.hide" : "auth.password.show", language);

  return (
    <div className="password-input-control">
      <input
        {...inputProps}
        disabled={disabled}
        id={id}
        ref={(element) => {
          inputRef.current = element;
          if (typeof forwardedRef === "function") forwardedRef(element);
          else if (forwardedRef) forwardedRef.current = element;
        }}
        type={visible ? "text" : "password"}
      />
      <button
        aria-controls={id}
        aria-label={label}
        aria-pressed={visible}
        className="password-input-toggle"
        disabled={disabled}
        onClick={() => {
          setVisible((current) => !current);
          inputRef.current?.focus({ preventScroll: true });
        }}
        title={label}
        type="button"
      >
        {visible ? <EyeOff aria-hidden="true" size={20} /> : <Eye aria-hidden="true" size={20} />}
      </button>
    </div>
  );
});
