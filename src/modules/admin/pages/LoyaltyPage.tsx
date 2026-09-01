import { FormEvent, useEffect, useState } from "react";
import { Save } from "lucide-react";
import { useLocation } from "react-router-dom";
import type { LoyaltySettings } from "../../../shared/types/domain";
import {
  defaultSettingsForMode,
  loadLoyaltySettings,
  saveReferralBonusSettings,
  validateReferralBonusDuration,
  validateReferralMonthlyInviteLimit,
} from "../../loyalty/loyaltyService";
import { useTenant } from "../../tenant/TenantProvider";
import {
  formatInvitedReferralDuration,
  isReferralBonusDurationPreset,
  normalizeReferralBonusDuration,
  referralBonusDefaultDurationDays,
  referralBonusDurationPresets,
  referralBonusMaxDurationDays,
  referralBonusMinDurationDays,
} from "../../loyalty/referralBonusSettings.mjs";
import { FormLabel, RequiredFieldsNote } from "../../../shared/components/FormLabel";

export function LoyaltyPage() {
  const location = useLocation();
  const { activeRestaurant } = useTenant();
  const restaurantId = activeRestaurant?.id ?? "";
  const [settings, setSettings] = useState<LoyaltySettings>(() =>
    defaultSettingsForMode(restaurantId, "menu_points"),
  );
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [savingReferralBonus, setSavingReferralBonus] = useState(false);

  useEffect(() => {
    if (!restaurantId) return;

    let cancelled = false;

    async function loadReferralSettings() {
      setLoading(true);
      try {
        const nextSettings = await loadLoyaltySettings(restaurantId);
        if (!cancelled) setSettings(nextSettings);
      } catch (error) {
        if (!cancelled) {
          setStatus(error instanceof Error ? error.message : "Bonusprogramm konnte nicht geladen werden.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadReferralSettings();

    return () => {
      cancelled = true;
    };
  }, [restaurantId]);

  useEffect(() => {
    if (location.hash !== "#freundschaftsbonus") return;
    const section = document.getElementById("freundschaftsbonus");
    section?.scrollIntoView({ block: "start" });
    section?.focus({ preventScroll: true });
  }, [location.hash]);

  async function handleSaveReferralBonus(event: FormEvent) {
    event.preventDefault();
    if (!restaurantId) return;

    const durationDays = Number(settings.referral_boost_duration_days ?? referralBonusDefaultDurationDays);
    const monthlyInviteLimit = Number(settings.referral_monthly_invite_limit ?? 5);
    if (!validateReferralBonusDuration(durationDays)) {
      setStatus("Die Dauer muss zwischen 1 und 365 ganzen Tagen liegen.");
      return;
    }
    if (!validateReferralMonthlyInviteLimit(monthlyInviteLimit)) {
      setStatus("Das Monatslimit muss zwischen 1 und 100 liegen.");
      return;
    }

    setStatus(null);
    setSavingReferralBonus(true);
    try {
      const saved = await saveReferralBonusSettings({
        restaurantId,
        enabled: settings.referral_boost_enabled ?? true,
        durationDays,
        monthlyInviteLimit,
      });
      setSettings((current) => ({ ...current, ...saved }));
      setStatus("Freundschaftsbonus gespeichert.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Freundschaftsbonus konnte nicht gespeichert werden.");
    } finally {
      setSavingReferralBonus(false);
    }
  }

  return (
    <>
      <header className="page-header">
        <div>
          <h1>Bonusprogramm</h1>
          <p className="muted">Lege fest, wie dein Freunde-einladen-Bonus funktioniert.</p>
        </div>
      </header>

      <section
        className="card referral-bonus-settings"
        id="freundschaftsbonus"
        tabIndex={-1}
      >
        <div>
          <h2>Freunde einladen & 2× Bonus</h2>
          <p className="muted">
            Nach einer erfolgreichen Einladung erhalten beide Gäste für die gewählte Dauer den 2× Bonus.
          </p>
        </div>
        <form className="form" onSubmit={handleSaveReferralBonus}>
          <RequiredFieldsNote />
          <label className="toggle-row" htmlFor="referral-boost-enabled">
            <input
              checked={settings.referral_boost_enabled ?? true}
              id="referral-boost-enabled"
              type="checkbox"
              onChange={(event) =>
                setSettings((current) => ({ ...current, referral_boost_enabled: event.target.checked }))
              }
            />
            Freundschaftsbonus aktiv
          </label>

          <div className="grid two referral-bonus-fields">
            <div className="field">
              <label htmlFor="referral-boost-multiplier">Multiplikator</label>
              <input className="input" disabled id="referral-boost-multiplier" value="2,0× Punkte" />
            </div>
            <div className="field">
              <FormLabel htmlFor="referral-boost-duration" required>Dauer pro erfolgreicher Einladung</FormLabel>
              <select
                aria-required="true"
                className="select"
                id="referral-boost-duration"
                required
                value={isReferralBonusDurationPreset(settings.referral_boost_duration_days ?? referralBonusDefaultDurationDays)
                  ? String(settings.referral_boost_duration_days ?? referralBonusDefaultDurationDays)
                  : "custom"}
                onChange={(event) => {
                  if (event.target.value === "custom") {
                    setSettings((current) => ({ ...current, referral_boost_duration_days: 1 }));
                    return;
                  }
                  setSettings((current) => ({
                    ...current,
                    referral_boost_duration_days: Number(event.target.value),
                  }));
                }}
              >
                {referralBonusDurationPresets.map((durationDays) => (
                  <option key={durationDays} value={durationDays}>{durationDays} Tage</option>
                ))}
                <option value="custom">Eigener Wert</option>
              </select>
            </div>
          </div>

          {!isReferralBonusDurationPreset(settings.referral_boost_duration_days ?? referralBonusDefaultDurationDays) ? (
            <div className="field referral-bonus-custom-duration">
              <FormLabel htmlFor="referral-boost-custom-duration" required>Eigener Wert in Tagen</FormLabel>
              <input
                aria-required="true"
                className="input"
                id="referral-boost-custom-duration"
                inputMode="numeric"
                max={referralBonusMaxDurationDays}
                min={referralBonusMinDurationDays}
                required
                step="1"
                type="number"
                value={settings.referral_boost_duration_days ?? referralBonusDefaultDurationDays}
                onChange={(event) =>
                  setSettings((current) => ({
                    ...current,
                    referral_boost_duration_days: Number(event.target.value),
                  }))
                }
              />
              <small>Erlaubt sind 1 bis 365 ganze Tage.</small>
            </div>
          ) : null}

          <div className="field referral-bonus-monthly-limit">
            <FormLabel htmlFor="referral-monthly-invite-limit" required>Einladungen pro Kunde / Monat</FormLabel>
            <input
              aria-required="true"
              className="input"
              id="referral-monthly-invite-limit"
              inputMode="numeric"
              max={100}
              min={1}
              required
              step="1"
              type="number"
              value={settings.referral_monthly_invite_limit ?? 5}
              onChange={(event) => setSettings((current) => ({
                ...current,
                referral_monthly_invite_limit: Number(event.target.value),
              }))}
            />
            <small>
              Legt fest, wie viele neue Einladungen ein Kunde pro Monat erstellen kann. Standard ist 5;
              erlaubt sind 1 bis 100.
            </small>
          </div>

          <div className="referral-bonus-preview" aria-live="polite">
            Der einladende Gast erhält die volle Bonusdauer: {normalizeReferralBonusDuration(settings.referral_boost_duration_days)} Tage 2×.
            Der eingeladene Freund erhält 50 % der Bonusdauer:{" "}
            {formatInvitedReferralDuration(normalizeReferralBonusDuration(settings.referral_boost_duration_days))} 2×.
            Weitere erfolgreiche Einladungen verlängern nur die Laufzeit; der Multiplikator bleibt 2×.
          </div>

          <button
            className="button"
            disabled={loading
              || savingReferralBonus
              || !validateReferralBonusDuration(Number(settings.referral_boost_duration_days))
              || !validateReferralMonthlyInviteLimit(Number(settings.referral_monthly_invite_limit ?? 5))}
            type="submit"
          >
            <Save size={18} />
            {savingReferralBonus ? "Wird gespeichert …" : "Freundschaftsbonus speichern"}
          </button>
        </form>
      </section>

      {status ? <p className="status-message">{status}</p> : null}
    </>
  );
}
