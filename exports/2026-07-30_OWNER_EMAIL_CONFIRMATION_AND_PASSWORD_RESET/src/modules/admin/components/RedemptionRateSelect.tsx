import {
  REDEMPTION_RATE_PERCENT_OPTIONS,
  isAllowedRedemptionRatePercent,
} from "../../loyalty/redemptionRate.mjs";
import { FormLabel } from "../../../shared/components/FormLabel";

type RedemptionRateSelectProps = {
  id: string;
  value: number | null;
  legacyValue?: number | null;
  disabled?: boolean;
  onChange: (value: number) => void;
};

export function RedemptionRateSelect({
  id,
  value,
  legacyValue = null,
  disabled = false,
  onChange,
}: RedemptionRateSelectProps) {
  const hasValidValue = value !== null && isAllowedRedemptionRatePercent(value);
  const legacyLabel = legacyValue === null ? "Ungültigen Altwert ersetzen" : `Legacy-Wert: ${legacyValue} %`;

  return (
    <div className="field redemption-rate-field">
      <FormLabel htmlFor={id} required>Einlösequote</FormLabel>
      <select
        aria-required="true"
        className="select redemption-rate-select"
        disabled={disabled}
        id={id}
        onChange={(event) => onChange(Number(event.target.value))}
        required
        value={hasValidValue ? String(value) : "legacy"}
      >
        {!hasValidValue ? <option disabled value="legacy">{legacyLabel}</option> : null}
        {REDEMPTION_RATE_PERCENT_OPTIONS.map((percent) => (
          <option key={percent} value={percent}>{percent} %</option>
        ))}
      </select>
      {!hasValidValue ? (
        <small className="redemption-rate-legacy" role="status">
          Der bisherige Wert bleibt erhalten, bis du aktiv 1 bis 10 % auswählst.
        </small>
      ) : null}
    </div>
  );
}
