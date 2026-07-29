import {
  REDEMPTION_RATE_PERCENT_OPTIONS,
  isAllowedRedemptionRatePercent,
} from "../../loyalty/redemptionRate.mjs";

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
      <label htmlFor={id}>Einlösequote</label>
      <select
        className="select redemption-rate-select"
        disabled={disabled}
        id={id}
        onChange={(event) => onChange(Number(event.target.value))}
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
