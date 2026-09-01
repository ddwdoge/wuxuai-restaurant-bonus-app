import { useId } from "react";
import {
  CUSTOMER_PHONE_COUNTRIES,
  customerPhoneValidation,
  normalizeCustomerLocalPhoneInput,
} from "../../modules/customer/customerIdentity.mjs";
import { FormLabel } from "./FormLabel";

type CustomerPhoneFieldProps = {
  countryCode: string;
  localNumber: string;
  onCountryCodeChange: (value: string) => void;
  onLocalNumberChange: (value: string) => void;
  idPrefix: string;
  label?: string;
  disabled?: boolean;
  showError?: boolean;
  required?: boolean;
};

export function CustomerPhoneField({
  countryCode,
  localNumber,
  onCountryCodeChange,
  onLocalNumberChange,
  idPrefix,
  label = "Telefonnummer",
  disabled = false,
  showError = false,
  required = false,
}: CustomerPhoneFieldProps) {
  const generatedId = useId();
  const countryId = `${idPrefix}-country-${generatedId}`;
  const localId = `${idPrefix}-local-${generatedId}`;
  const hintId = `${idPrefix}-hint-${generatedId}`;
  const errorId = `${idPrefix}-error-${generatedId}`;
  const validation = customerPhoneValidation(countryCode, localNumber);
  const visibleError = showError && localNumber.trim() ? validation.error : null;

  return (
    <fieldset className="customer-phone-field">
      <legend>{label}{required ? <><span aria-hidden="true" className="required-field-marker"> *</span><span className="sr-only"> Pflichtfeld</span></> : null}</legend>
      <div className="customer-phone-field-grid">
        <div className="customer-phone-field-part">
          <FormLabel htmlFor={countryId} required={required}>Landesvorwahl</FormLabel>
          <select
            aria-required={required || undefined}
            aria-describedby={hintId}
            autoComplete="tel-country-code"
            className="input customer-phone-country"
            disabled={disabled}
            id={countryId}
            onChange={(event) => onCountryCodeChange(event.target.value)}
            required={required}
            value={countryCode}
          >
            {CUSTOMER_PHONE_COUNTRIES.map((country) => (
              <option key={country.code} value={country.code}>{country.label} {country.code}</option>
            ))}
          </select>
        </div>
        <div className="customer-phone-field-part">
          <FormLabel htmlFor={localId} required={required}>Lokale Nummer</FormLabel>
          <input
            aria-describedby={`${hintId}${visibleError ? ` ${errorId}` : ""}`}
            aria-invalid={Boolean(visibleError)}
            aria-required={required || undefined}
            autoComplete="tel-national"
            className="input"
            disabled={disabled}
            id={localId}
            inputMode="tel"
            onChange={(event) => onLocalNumberChange(normalizeCustomerLocalPhoneInput(event.target.value))}
            placeholder="664 1234567"
            required={required}
            type="tel"
            value={localNumber}
          />
        </div>
      </div>
      <small id={hintId}>Bitte ohne führende 0 eingeben.</small>
      {visibleError ? <p className="customer-phone-error" id={errorId} role="alert">{visibleError}</p> : null}
    </fieldset>
  );
}
