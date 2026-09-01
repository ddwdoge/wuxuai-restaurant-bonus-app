import { Check, ChevronDown } from "lucide-react";
import { useEffect, useId, useMemo, useState } from "react";
import { countryNameForCode, filterCountryOptions } from "../countries.mjs";

type CountrySelectProps = {
  disabled?: boolean;
  id: string;
  locale?: string;
  onChange: (countryCode: string) => void;
  required?: boolean;
  value: string;
};

export function CountrySelect({ disabled = false, id, locale = "de", onChange, required = false, value }: CountrySelectProps) {
  const generatedId = useId();
  const listboxId = `${id}-options-${generatedId}`;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const selectedLabel = countryNameForCode(value, locale);
  const options = useMemo(() => filterCountryOptions(locale, query), [locale, query]);

  useEffect(() => {
    if (!open) setQuery(selectedLabel);
  }, [open, selectedLabel]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  function chooseCountry(countryCode: string) {
    onChange(countryCode);
    setOpen(false);
  }

  function closeAndRestore() {
    setOpen(false);
    setQuery(selectedLabel);
  }

  return (
    <div className={`country-select${open ? " is-open" : ""}`}>
      <div className="country-select-control">
        <input
          aria-autocomplete="list"
          aria-activedescendant={open && options[activeIndex] ? `${listboxId}-${options[activeIndex].code}` : undefined}
          aria-controls={listboxId}
          aria-expanded={open}
          aria-haspopup="listbox"
          aria-required={required}
          autoComplete="country-name"
          className="input country-select-input"
          disabled={disabled}
          id={id}
          onBlur={() => window.setTimeout(closeAndRestore, 120)}
          onChange={(event) => {
            onChange("");
            setQuery(event.target.value);
            setOpen(true);
          }}
          onFocus={(event) => {
            setOpen(true);
            event.currentTarget.select();
          }}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setOpen(true);
              setActiveIndex((current) => Math.min(current + 1, Math.max(options.length - 1, 0)));
            } else if (event.key === "ArrowUp") {
              event.preventDefault();
              setActiveIndex((current) => Math.max(current - 1, 0));
            } else if (event.key === "Enter" && open && options[activeIndex]) {
              event.preventDefault();
              chooseCountry(options[activeIndex].code);
            } else if (event.key === "Escape") {
              event.preventDefault();
              closeAndRestore();
            }
          }}
          placeholder="Land suchen"
          required={required}
          role="combobox"
          value={query}
        />
        <ChevronDown aria-hidden="true" className="country-select-chevron" size={18} />
      </div>
      {open ? (
        <div aria-label="Länder" className="country-select-options" id={listboxId} role="listbox">
          {options.length ? options.map((option, index) => (
            <button
              aria-selected={option.code === value}
              className={`country-select-option${index === activeIndex ? " is-active" : ""}`}
              id={`${listboxId}-${option.code}`}
              key={option.code}
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => chooseCountry(option.code)}
              role="option"
              type="button"
            >
              <span>{option.label}</span>
              {option.code === value ? <Check aria-hidden="true" size={18} /> : null}
            </button>
          )) : <p className="country-select-empty">Kein Land gefunden.</p>}
        </div>
      ) : null}
    </div>
  );
}
