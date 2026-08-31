import { useState } from "react";
import { Copy, X } from "lucide-react";
import {
  copyOpeningDayToDays,
  openingDaysDiffer,
  type OpeningDay,
} from "../openingHours.mjs";

type OpeningHoursCopyActionProps<DayKey extends string> = {
  destinationKeys: readonly DayKey[];
  onChange: (openingHours: Record<DayKey, OpeningDay>) => void;
  openingHours: Record<DayKey, OpeningDay>;
  sourceKey: DayKey;
  sourceLabel: string;
};

export function OpeningHoursCopyAction<DayKey extends string>({
  destinationKeys,
  onChange,
  openingHours,
  sourceKey,
  sourceLabel,
}: OpeningHoursCopyActionProps<DayKey>) {
  const [confirmationOpen, setConfirmationOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  function applyCopy() {
    onChange(copyOpeningDayToDays(openingHours, sourceKey, destinationKeys));
    setConfirmationOpen(false);
    setCopied(true);
  }

  function requestCopy() {
    setCopied(false);
    if (openingDaysDiffer(openingHours, sourceKey, destinationKeys)) {
      setConfirmationOpen(true);
      return;
    }
    applyCopy();
  }

  return (
    <div className="opening-hours-copy-action">
      <button
        aria-label={`${sourceLabel} mit allen anderen Tagen gleichsetzen`}
        className="button secondary opening-hours-copy-button"
        onClick={requestCopy}
        type="button"
      >
        <Copy aria-hidden="true" size={18} />
        Auf alle Tage übertragen
      </button>

      {confirmationOpen ? (
        <div className="opening-hours-copy-confirmation" role="group" aria-label="Vorhandene Öffnungszeiten überschreiben">
          <p>Bestehende Zeiten für die anderen Tage überschreiben?</p>
          <div className="opening-hours-copy-confirmation-actions">
            <button className="button primary" onClick={applyCopy} type="button">Überschreiben</button>
            <button className="button ghost" onClick={() => setConfirmationOpen(false)} type="button">
              <X aria-hidden="true" size={18} />
              Abbrechen
            </button>
          </div>
        </div>
      ) : null}

      {copied ? <p className="opening-hours-copy-feedback" role="status">Zeiten wurden auf alle Tage übertragen.</p> : null}
    </div>
  );
}
