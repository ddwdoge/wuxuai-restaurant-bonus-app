import { FormEvent, useEffect, useMemo, useState } from "react";
import { Edit3, Plus, Power, Save } from "lucide-react";
import type { LoyaltyMode, LoyaltyRule, LoyaltySettings } from "../../../shared/types/domain";
import {
  defaultSettingsForMode,
  loadLoyaltyRules,
  loadLoyaltySettings,
  loyaltyModeLabels,
  menuPointPresets,
  rulesForMode,
  saveLoyaltyRule,
  saveLoyaltySettings,
  saveReferralBonusSettings,
  setLoyaltyRuleActive,
  validateReferralBonusDuration,
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
import {
  isAllowedRedemptionRatePercent,
  redemptionRateToPercent,
} from "../../loyalty/redemptionRate.mjs";
import { RedemptionRateSelect } from "../components/RedemptionRateSelect";
import { FormLabel, RequiredFieldsNote } from "../../../shared/components/FormLabel";

type RuleForm = {
  id?: string;
  title: string;
  points: number;
  stamps: number;
  min_amount: number;
  active: boolean;
};

const emptyRuleForm: RuleForm = {
  title: "",
  points: 0,
  stamps: 0,
  min_amount: 0,
  active: true,
};

function formForMode(mode: LoyaltyMode): RuleForm {
  if (mode === "stamp_based") {
    return { ...emptyRuleForm, title: "1 Besuch = 1 Stempel", stamps: 1 };
  }

  if (mode === "amount_based") {
    return { ...emptyRuleForm, title: "1 Euro = 1 Punkt", points: 1, min_amount: 1 };
  }

  return { ...emptyRuleForm, title: "Besuch", points: 10 };
}

export function LoyaltyPage() {
  const { activeRestaurant } = useTenant();
  const restaurantId = activeRestaurant?.id ?? "";
  const [settings, setSettings] = useState<LoyaltySettings>(() =>
    defaultSettingsForMode(restaurantId, "menu_points"),
  );
  const [rules, setRules] = useState<LoyaltyRule[]>([]);
  const [ruleForm, setRuleForm] = useState<RuleForm>(() => formForMode("menu_points"));
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [savingReferralBonus, setSavingReferralBonus] = useState(false);

  useEffect(() => {
    if (!restaurantId) return;

    let cancelled = false;

    async function loadLoyaltyCore() {
      setLoading(true);
      try {
        const [nextSettings, nextRules] = await Promise.all([
          loadLoyaltySettings(restaurantId),
          loadLoyaltyRules(restaurantId),
        ]);

        if (!cancelled) {
          setSettings(nextSettings);
          setRules(nextRules);
          setRuleForm(formForMode(nextSettings.loyalty_mode));
        }
      } catch (error) {
        if (!cancelled) {
          setStatus(error instanceof Error ? error.message : "Loyalty konnte nicht geladen werden.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadLoyaltyCore();

    return () => {
      cancelled = true;
    };
  }, [restaurantId]);

  const visibleRules = useMemo(
    () => rulesForMode(rules, settings.loyalty_mode),
    [rules, settings.loyalty_mode],
  );
  const redemptionRatePercent = redemptionRateToPercent(settings.redemption_return_rate);
  const validRedemptionRatePercent = redemptionRatePercent !== null
    && isAllowedRedemptionRatePercent(redemptionRatePercent)
    ? redemptionRatePercent
    : null;

  async function handleSaveSettings(event: FormEvent) {
    event.preventDefault();
    if (!restaurantId) return;
    if (validRedemptionRatePercent === null) {
      setStatus("Bitte wähle eine Einlösequote zwischen 1 und 10 Prozent.");
      return;
    }

    setStatus(null);
    const saved = await saveLoyaltySettings({ ...settings, restaurant_id: restaurantId });
    setSettings(saved);
    setStatus(`Aktiver Modus: ${loyaltyModeLabels[saved.loyalty_mode]}`);
  }

  async function handleSaveRule(event: FormEvent) {
    event.preventDefault();
    if (!restaurantId || !ruleForm.title.trim()) return;

    setStatus(null);
    const savedRule = await saveLoyaltyRule({
      ...ruleForm,
      restaurant_id: restaurantId,
      title: ruleForm.title.trim(),
      points: Math.max(0, Number(ruleForm.points) || 0),
      stamps: Math.max(0, Number(ruleForm.stamps) || 0),
      min_amount: Math.max(0, Number(ruleForm.min_amount) || 0),
    });

    setRules((currentRules) => {
      const exists = currentRules.some((rule) => rule.id === savedRule.id);
      return exists
        ? currentRules.map((rule) => (rule.id === savedRule.id ? savedRule : rule))
        : [...currentRules, savedRule];
    });
    setRuleForm(formForMode(settings.loyalty_mode));
    setStatus("Regel gespeichert.");
  }

  async function handleSaveReferralBonus(event: FormEvent) {
    event.preventDefault();
    if (!restaurantId) return;

    const durationDays = Number(settings.referral_boost_duration_days ?? referralBonusDefaultDurationDays);
    if (!validateReferralBonusDuration(durationDays)) {
      setStatus("Die Dauer muss zwischen 1 und 365 ganzen Tagen liegen.");
      return;
    }

    setStatus(null);
    setSavingReferralBonus(true);
    try {
      const saved = await saveReferralBonusSettings({
        restaurantId,
        enabled: settings.referral_boost_enabled ?? true,
        durationDays,
      });
      setSettings((current) => ({ ...current, ...saved }));
      setStatus("Freundschaftsbonus gespeichert.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Freundschaftsbonus konnte nicht gespeichert werden.");
    } finally {
      setSavingReferralBonus(false);
    }
  }

  async function handleToggleRule(rule: LoyaltyRule) {
    const updatedRule = await setLoyaltyRuleActive(rule, !rule.active);
    setRules((currentRules) => currentRules.map((item) => (item.id === updatedRule.id ? updatedRule : item)));
    setStatus(updatedRule.active ? "Regel aktiviert." : "Regel deaktiviert.");
  }

  async function handleAddPreset(preset: (typeof menuPointPresets)[number]) {
    if (!restaurantId) return;
    const savedRule = await saveLoyaltyRule({
      ...preset,
      restaurant_id: restaurantId,
      active: true,
    });
    setRules((currentRules) => [...currentRules, savedRule]);
    setStatus(`${savedRule.title} gespeichert.`);
  }

  return (
    <>
      <header className="page-header">
        <div>
          <h1>Bonusprogramm</h1>
          <p className="muted">Ein aktiver Modus pro Restaurant. Alle Regeln bleiben dem Restaurant zugeordnet.</p>
        </div>
        <span className="pill">Aktiv: {loyaltyModeLabels[settings.loyalty_mode]}</span>
      </header>

      <section className="grid two">
        <article className="card">
          <h2>Modus</h2>
          <form className="form" onSubmit={handleSaveSettings}>
            <RequiredFieldsNote />
            <div className="field">
              <FormLabel htmlFor="loyalty-mode" required>Bonusmodus</FormLabel>
              <select
                aria-required="true"
                className="select"
                id="loyalty-mode"
                required
                value={settings.loyalty_mode}
                onChange={(event) => {
                  const nextMode = event.target.value as LoyaltyMode;
                  setSettings((current) => ({
                    ...defaultSettingsForMode(current.restaurant_id, nextMode),
                    id: current.id,
                    restaurant_id: current.restaurant_id,
                    created_at: current.created_at,
                  }));
                  setRuleForm(formForMode(nextMode));
                }}
              >
                <option value="amount_based">Betragsbasiert</option>
                <option value="stamp_based">Stempelkarte</option>
                <option value="menu_points">Punkte nach Bonstufe</option>
              </select>
            </div>

            <div className="grid two">
              <div className="field">
                <FormLabel htmlFor="amount-per-point" required>Euro pro Punkt</FormLabel>
                <input
                  aria-required="true"
                  className="input"
                  id="amount-per-point"
                  min="0.01"
                  required
                  step="0.01"
                  type="number"
                  value={settings.amount_per_point}
                  onChange={(event) =>
                    setSettings((current) => ({
                      ...current,
                      amount_per_point: Number(event.target.value) || 1,
                    }))
                  }
                />
              </div>
              <RedemptionRateSelect
                id="loyalty-redemption-rate"
                legacyValue={redemptionRatePercent}
                onChange={(percent) => setSettings((current) => ({
                  ...current,
                  redemption_return_rate: percent / 100,
                }))}
                value={validRedemptionRatePercent}
              />
              <div className="field">
                <FormLabel htmlFor="stamps-required" required>Stempel bis Punkteeinlösung</FormLabel>
                <input
                  aria-required="true"
                  className="input"
                  id="stamps-required"
                  min="1"
                  required
                  type="number"
                  value={settings.stamps_required}
                  onChange={(event) =>
                    setSettings((current) => ({
                      ...current,
                      stamps_required: Math.max(1, Number(event.target.value) || 10),
                    }))
                  }
                />
              </div>
            </div>

            <button className="button" disabled={loading || validRedemptionRatePercent === null} type="submit">
              <Save size={18} />
              Einstellungen speichern
            </button>
          </form>
        </article>

        <article className="card">
          <h2>Regel speichern</h2>
          <form className="form" onSubmit={handleSaveRule}>
            <RequiredFieldsNote />
            <div className="field">
              <FormLabel htmlFor="rule-title" required>Titel</FormLabel>
              <input
                aria-required="true"
                className="input"
                id="rule-title"
                required
                value={ruleForm.title}
                onChange={(event) => setRuleForm((current) => ({ ...current, title: event.target.value }))}
              />
            </div>
            <div className="grid three">
              <div className="field">
                <FormLabel htmlFor="rule-points" required>Punkte</FormLabel>
                <input
                  aria-required="true"
                  className="input"
                  id="rule-points"
                  min="0"
                  required
                  type="number"
                  value={ruleForm.points}
                  onChange={(event) =>
                    setRuleForm((current) => ({ ...current, points: Number(event.target.value) || 0 }))
                  }
                />
              </div>
              <div className="field">
                <FormLabel htmlFor="rule-stamps" required>Stempel</FormLabel>
                <input
                  aria-required="true"
                  className="input"
                  id="rule-stamps"
                  min="0"
                  required
                  type="number"
                  value={ruleForm.stamps}
                  onChange={(event) =>
                    setRuleForm((current) => ({ ...current, stamps: Number(event.target.value) || 0 }))
                  }
                />
              </div>
              <div className="field">
                <FormLabel htmlFor="rule-min-amount" required>Mindestbetrag</FormLabel>
                <input
                  aria-required="true"
                  className="input"
                  id="rule-min-amount"
                  min="0"
                  required
                  step="0.01"
                  type="number"
                  value={ruleForm.min_amount}
                  onChange={(event) =>
                    setRuleForm((current) => ({ ...current, min_amount: Number(event.target.value) || 0 }))
                  }
                />
              </div>
            </div>
            <button className="button" type="submit">
              <Plus size={18} />
              {ruleForm.id ? "Regel aktualisieren" : "Regel hinzufügen"}
            </button>
          </form>
        </article>
      </section>

      <section className="card referral-bonus-settings" style={{ marginTop: 16 }}>
        <div>
          <p className="premium-owner-kicker">Bonusprogramm</p>
          <h2>Freundschaftsbonus</h2>
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

          <div className="referral-bonus-preview" aria-live="polite">
            Der einladende Gast erhält {normalizeReferralBonusDuration(settings.referral_boost_duration_days)} Tage.
            Der eingeladene Freund erhält exakt{" "}
            {formatInvitedReferralDuration(normalizeReferralBonusDuration(settings.referral_boost_duration_days))}.
            Weitere erfolgreiche Einladungen verlängern nur die Laufzeit; der Multiplikator bleibt 2×.
          </div>

          <button
            className="button"
            disabled={savingReferralBonus || !validateReferralBonusDuration(Number(settings.referral_boost_duration_days))}
            type="submit"
          >
            <Save size={18} />
            {savingReferralBonus ? "Wird gespeichert …" : "Freundschaftsbonus speichern"}
          </button>
        </form>
      </section>

      {settings.loyalty_mode === "menu_points" ? (
        <section className="card" style={{ marginTop: 16 }}>
          <h2>Vorlagen für Bonstufen</h2>
          <div className="tablet-actions" style={{ marginTop: 12 }}>
            {menuPointPresets.map((preset) => (
              <button className="large-action compact" key={preset.title} onClick={() => handleAddPreset(preset)} type="button">
                <Plus size={24} />
                {preset.title}
                <span className="muted">{preset.points} Punkte</span>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      <section className="card" style={{ marginTop: 16 }}>
        <h2>Aktive Regeln</h2>
        <div className="rule-list">
          {visibleRules.map((rule) => (
            <article className={`rule-row${rule.active ? "" : " inactive"}`} key={rule.id}>
              <div>
                <strong>{rule.title}</strong>
                <p className="muted">
                  {rule.points} Punkte · {rule.stamps} Stempel · Mindestbetrag {rule.min_amount} €
                </p>
              </div>
              <div className="row-actions">
                <button className="button secondary" onClick={() => setRuleForm(rule)} type="button">
                  <Edit3 size={16} />
                  Bearbeiten
                </button>
                <button className="button secondary" onClick={() => handleToggleRule(rule)} type="button">
                  <Power size={16} />
                  {rule.active ? "Deaktivieren" : "Aktivieren"}
                </button>
              </div>
            </article>
          ))}
          {visibleRules.length === 0 ? <p className="muted">Noch keine Regel für diesen Modus.</p> : null}
        </div>
      </section>

      {status ? <p className="status-message">{status}</p> : null}
    </>
  );
}
