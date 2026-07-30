import { Minus, Plus } from "lucide-react";
import type { OpeningDay } from "../openingHours.mjs";
import { validateOpeningDay } from "../openingHours.mjs";
import { FormLabel } from "./FormLabel";

type OpeningHoursEditorProps = {
  dayLabel: string;
  idPrefix: string;
  onChange: (patch: Partial<OpeningDay>) => void;
  value: OpeningDay;
};

function TimeField({ id, label, onChange, value }: {
  id: string;
  label: string;
  onChange: (value: string) => void;
  value: string;
}) {
  return (
    <div className="opening-hours-time-field">
      <FormLabel htmlFor={id} required>{label}</FormLabel>
      <input aria-required="true" className="input" id={id} onChange={(event) => onChange(event.target.value)} required type="time" value={value} />
    </div>
  );
}

export function OpeningHoursEditor({ dayLabel, idPrefix, onChange, value }: OpeningHoursEditorProps) {
  const error = validateOpeningDay(value);

  return (
    <article className={`opening-hours-day${value.enabled ? " is-open" : ""}`}>
      <div className="opening-hours-day-header">
        <label className="inline-check" htmlFor={`${idPrefix}-enabled`}>
          <input checked={value.enabled} id={`${idPrefix}-enabled`} onChange={(event) => onChange({ enabled: event.target.checked })} type="checkbox" />
          {dayLabel}
        </label>
        <span>{value.enabled ? "Geöffnet" : "Geschlossen"}</span>
      </div>

      {value.enabled ? (
        <>
          <section aria-label={value.lunchBreakEnabled ? "Öffnungszeit 1" : "Öffnungszeit"} className="opening-hours-block">
            <strong>{value.lunchBreakEnabled ? "Öffnungszeit 1" : "Öffnungszeit"}</strong>
            <div className="opening-hours-time-grid">
              <TimeField id={`${idPrefix}-open`} label="von" onChange={(open) => onChange({ open })} value={value.open} />
              <TimeField id={`${idPrefix}-close`} label="bis" onChange={(close) => onChange({ close })} value={value.close} />
            </div>
          </section>

          {value.lunchBreakEnabled ? (
            <>
              <section aria-label="Mittagspause" className="opening-hours-block opening-hours-break-block">
                <strong>Mittagspause</strong>
                <div className="opening-hours-time-grid">
                  <TimeField id={`${idPrefix}-break-start`} label="von" onChange={(lunchBreakStart) => onChange({ lunchBreakStart })} value={value.lunchBreakStart} />
                  <TimeField id={`${idPrefix}-break-end`} label="bis" onChange={(lunchBreakEnd) => onChange({ lunchBreakEnd })} value={value.lunchBreakEnd} />
                </div>
              </section>
              <section aria-label="Öffnungszeit 2" className="opening-hours-block">
                <strong>Öffnungszeit 2</strong>
                <div className="opening-hours-time-grid">
                  <TimeField id={`${idPrefix}-second-open`} label="von" onChange={(secondOpen) => onChange({ secondOpen })} value={value.secondOpen} />
                  <TimeField id={`${idPrefix}-second-close`} label="bis" onChange={(secondClose) => onChange({ secondClose })} value={value.secondClose} />
                </div>
              </section>
            </>
          ) : null}

          <button className="opening-hours-break-button" onClick={() => onChange({ lunchBreakEnabled: !value.lunchBreakEnabled })} type="button">
            {value.lunchBreakEnabled ? <Minus aria-hidden="true" size={17} /> : <Plus aria-hidden="true" size={17} />}
            {value.lunchBreakEnabled ? "Mittagspause entfernen" : "Mittagspause hinzufügen"}
          </button>
          {error ? <p className="opening-hours-error" id={`${idPrefix}-error`} role="alert">{error}</p> : null}
        </>
      ) : null}
    </article>
  );
}
