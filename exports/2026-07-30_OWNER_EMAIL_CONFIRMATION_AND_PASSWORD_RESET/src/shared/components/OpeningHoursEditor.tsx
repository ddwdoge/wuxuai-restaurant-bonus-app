import { useState } from "react";
import { Minus, Plus } from "lucide-react";
import type { OpeningDay } from "../openingHours.mjs";
import { suggestLunchBreak, validateOpeningDay } from "../openingHours.mjs";
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
  const [suggestionMessage, setSuggestionMessage] = useState<string | null>(null);
  const [suggestedBoundaries, setSuggestedBoundaries] = useState<{ open: string; close: string } | null>(null);
  const mainHoursChanged = suggestedBoundaries
    ? value.open !== suggestedBoundaries.open || value.secondClose !== suggestedBoundaries.close
    : false;

  function toggleLunchBreak() {
    if (value.lunchBreakEnabled) {
      onChange({ close: value.secondClose || value.close, lunchBreakEnabled: false });
      setSuggestionMessage(null);
      setSuggestedBoundaries(null);
      return;
    }

    const suggestion = suggestLunchBreak(value.open, value.close);
    if (!suggestion) {
      setSuggestionMessage("Für diese Öffnungszeit ist keine sinnvolle Mittagspause verfügbar.");
      return;
    }

    onChange({
      close: suggestion.firstBlockEnd,
      lunchBreakEnabled: true,
      lunchBreakStart: suggestion.breakStart,
      lunchBreakEnd: suggestion.breakEnd,
      secondOpen: suggestion.secondBlockStart,
      secondClose: value.close,
    });
    setSuggestedBoundaries({ open: value.open, close: value.close });
    setSuggestionMessage("Wir haben eine passende Mittagspause vorgeschlagen. Du kannst die Zeiten jederzeit anpassen.");
  }

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

          <button className="opening-hours-break-button" onClick={toggleLunchBreak} type="button">
            {value.lunchBreakEnabled ? <Minus aria-hidden="true" size={17} /> : <Plus aria-hidden="true" size={17} />}
            {value.lunchBreakEnabled ? "Mittagspause entfernen" : "Mittagspause hinzufügen"}
          </button>
          {suggestionMessage ? <p className="opening-hours-suggestion" role="status">{suggestionMessage}</p> : null}
          {mainHoursChanged && error ? <p className="opening-hours-warning" role="alert">Die Öffnungszeit wurde geändert. Bitte prüfe die Mittagspause.</p> : null}
          {error ? <p className="opening-hours-error" id={`${idPrefix}-error`} role="alert">{error}</p> : null}
        </>
      ) : null}
    </article>
  );
}
