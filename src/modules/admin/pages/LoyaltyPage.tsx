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
  setLoyaltyRuleActive,
} from "../../loyalty/loyaltyService";
import { useTenant } from "../../tenant/TenantProvider";

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

  async function handleSaveSettings(event: FormEvent) {
    event.preventDefault();
    if (!restaurantId) return;

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
          <h1>Loyalty Settings</h1>
          <p className="muted">Ein aktiver Modus pro Restaurant. Regeln bleiben tenant-gebunden.</p>
        </div>
        <span className="pill">Aktiv: {loyaltyModeLabels[settings.loyalty_mode]}</span>
      </header>

      <section className="grid two">
        <article className="card">
          <h2>Modus</h2>
          <form className="form" onSubmit={handleSaveSettings}>
            <div className="field">
              <label htmlFor="loyalty-mode">Loyalty-Modus</label>
              <select
                className="select"
                id="loyalty-mode"
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
                <option value="amount_based">amount_based</option>
                <option value="stamp_based">stamp_based</option>
                <option value="menu_points">menu_points</option>
              </select>
            </div>

            <div className="grid two">
              <div className="field">
                <label htmlFor="amount-per-point">Euro pro Punkt</label>
                <input
                  className="input"
                  id="amount-per-point"
                  min="0.01"
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
              <div className="field">
                <label htmlFor="stamps-required">Stempel bis Punkteeinlösung</label>
                <input
                  className="input"
                  id="stamps-required"
                  min="1"
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

            <div className="card subtle-card">
              <h2>Bonus Boost</h2>
              <p className="muted">Aktiviert sich erst nach einem echten Besuch des eingeladenen Gasts.</p>
              <label className="toggle-row" htmlFor="referral-boost-enabled">
                <input
                  checked={settings.referral_boost_enabled ?? true}
                  id="referral-boost-enabled"
                  type="checkbox"
                  onChange={(event) =>
                    setSettings((current) => ({
                      ...current,
                      referral_boost_enabled: event.target.checked,
                    }))
                  }
                />
                Aktiv
              </label>
              <div className="grid two">
                <div className="field">
                  <label htmlFor="referral-boost-multiplier">Multiplikator</label>
                  <select
                    className="select"
                    id="referral-boost-multiplier"
                    value={settings.referral_boost_multiplier ?? 2}
                    onChange={(event) =>
                      setSettings((current) => ({
                        ...current,
                        referral_boost_multiplier: Number(event.target.value),
                      }))
                    }
                  >
                    <option value={1.25}>1.25×</option>
                    <option value={1.5}>1.5×</option>
                    <option value={2}>2×</option>
                    <option value={3}>3×</option>
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="referral-boost-duration">Dauer</label>
                  <select
                    className="select"
                    id="referral-boost-duration"
                    value={settings.referral_boost_duration_days ?? 30}
                    onChange={(event) =>
                      setSettings((current) => ({
                        ...current,
                        referral_boost_duration_days: Number(event.target.value),
                      }))
                    }
                  >
                    <option value={14}>14 Tage</option>
                    <option value={30}>30 Tage</option>
                    <option value={60}>60 Tage</option>
                  </select>
                </div>
              </div>
              <p className="muted">
                Gäste erhalten {settings.referral_boost_multiplier ?? 2}× Punkte für {settings.referral_boost_duration_days ?? 30} Tage, sobald der eingeladene Gast erstmals Punkte sammelt.
              </p>
            </div>

            <button className="button" disabled={loading} type="submit">
              <Save size={18} />
              Einstellungen speichern
            </button>
          </form>
        </article>

        <article className="card">
          <h2>Regel speichern</h2>
          <form className="form" onSubmit={handleSaveRule}>
            <div className="field">
              <label htmlFor="rule-title">Titel</label>
              <input
                className="input"
                id="rule-title"
                value={ruleForm.title}
                onChange={(event) => setRuleForm((current) => ({ ...current, title: event.target.value }))}
              />
            </div>
            <div className="grid three">
              <div className="field">
                <label htmlFor="rule-points">Punkte</label>
                <input
                  className="input"
                  id="rule-points"
                  min="0"
                  type="number"
                  value={ruleForm.points}
                  onChange={(event) =>
                    setRuleForm((current) => ({ ...current, points: Number(event.target.value) || 0 }))
                  }
                />
              </div>
              <div className="field">
                <label htmlFor="rule-stamps">Stempel</label>
                <input
                  className="input"
                  id="rule-stamps"
                  min="0"
                  type="number"
                  value={ruleForm.stamps}
                  onChange={(event) =>
                    setRuleForm((current) => ({ ...current, stamps: Number(event.target.value) || 0 }))
                  }
                />
              </div>
              <div className="field">
                <label htmlFor="rule-min-amount">Mindestbetrag</label>
                <input
                  className="input"
                  id="rule-min-amount"
                  min="0"
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

      {settings.loyalty_mode === "menu_points" ? (
        <section className="card" style={{ marginTop: 16 }}>
          <h2>Menu Points Presets</h2>
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
