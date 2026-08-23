import { useEffect, useMemo, useReducer, useState } from "react";
import { Copy, LoaderCircle, RotateCw, Search, ShieldCheck, Users } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { AppDrawer } from "../../../shared/components/AppDrawer";
import { CustomerPhoneField } from "../../../shared/components/CustomerPhoneField";
import { FormLabel, RequiredFieldsNote } from "../../../shared/components/FormLabel";
import type { Customer } from "../../../shared/types/domain";
import {
  canManageCustomerIdentity,
  loadCustomerIdentitySupportDetail,
  loadCustomers,
  updateCustomerIdentityBySupport,
  type CustomerIdentitySupportDetail,
} from "../../loyalty/loyaltyService";
import { useTenant } from "../../tenant/TenantProvider";
import { customerPhoneValidation, splitCustomerPhone } from "../../customer/customerIdentity.mjs";
import { createGuestListState, filterGuestList, guestListStateReducer } from "../guestListState.mjs";

function customerStatus(customer: Customer) {
  if (customer.points_balance > 0 || customer.stamp_balance > 0) return "Aktiv";
  return "Neu";
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("de-AT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(value));
}

export function CustomersPage() {
  const { activeRestaurant } = useTenant();
  const restaurantId = activeRestaurant?.id ?? "";
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [filterState, dispatchFilter] = useReducer(guestListStateReducer, restaurantId, createGuestListState);
  const query = filterState.restaurantId === restaurantId ? filterState.query : "";
  const [loading, setLoading] = useState(Boolean(restaurantId));
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [identitySupportAllowed, setIdentitySupportAllowed] = useState(false);
  const [supportCustomer, setSupportCustomer] = useState<Customer | null>(null);
  const [supportDetail, setSupportDetail] = useState<CustomerIdentitySupportDetail | null>(null);
  const [supportLoading, setSupportLoading] = useState(false);
  const [supportSaving, setSupportSaving] = useState(false);
  const [supportMessage, setSupportMessage] = useState<string | null>(null);
  const [changeType, setChangeType] = useState<"phone" | "birthday">("phone");
  const [newPhone, setNewPhone] = useState("");
  const [newPhoneCountryCode, setNewPhoneCountryCode] = useState("+43");
  const [birthdayDay, setBirthdayDay] = useState("");
  const [birthdayMonth, setBirthdayMonth] = useState("");
  const [verificationMethod, setVerificationMethod] = useState("");
  const [reason, setReason] = useState("");
  const [identityVerified, setIdentityVerified] = useState(false);
  const [newAccessLink, setNewAccessLink] = useState<string | null>(null);

  useEffect(() => {
    dispatchFilter({ type: "restaurant_changed", restaurantId });
    setSupportCustomer(null);
    setSupportDetail(null);
    setSupportMessage(null);
    setNewAccessLink(null);
  }, [restaurantId]);

  useEffect(() => {
    if (!restaurantId) {
      setCustomers([]);
      setLoading(false);
      setLoadError(null);
      return;
    }

    let cancelled = false;
    setCustomers([]);
    setLoading(true);
    setLoadError(null);

    loadCustomers(restaurantId)
      .then((nextCustomers) => {
        if (!cancelled) {
          setCustomers(nextCustomers);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setCustomers([]);
          setLoadError("Gäste konnten nicht geladen werden.");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [loadAttempt, restaurantId]);

  useEffect(() => {
    if (!restaurantId) {
      setIdentitySupportAllowed(false);
      return;
    }

    let cancelled = false;
    canManageCustomerIdentity(restaurantId)
      .then((supportAllowed) => {
        if (!cancelled) setIdentitySupportAllowed(supportAllowed);
      })
      .catch(() => {
        if (!cancelled) setIdentitySupportAllowed(false);
      });

    return () => {
      cancelled = true;
    };
  }, [restaurantId]);

  const filteredCustomers = useMemo(() => {
    return filterGuestList(customers, query);
  }, [customers, query]);

  async function openIdentitySupport(customer: Customer) {
    setSupportCustomer(customer);
    setSupportDetail(null);
    setSupportMessage(null);
    setNewAccessLink(null);
    setSupportLoading(true);
    try {
      const detail = await loadCustomerIdentitySupportDetail(restaurantId, customer.id);
      setSupportDetail(detail);
      const phoneParts = splitCustomerPhone(detail.phone);
      setNewPhoneCountryCode(phoneParts.countryCode);
      setNewPhone(phoneParts.localNumber);
      setBirthdayDay(detail.birthday_day ? String(detail.birthday_day) : "");
      setBirthdayMonth(detail.birthday_month ? String(detail.birthday_month) : "");
    } catch {
      setSupportMessage("Identitätsdaten konnten nicht geöffnet werden. Prüfe deine Berechtigung.");
    } finally {
      setSupportLoading(false);
    }
  }

  function closeIdentitySupport() {
    if (supportSaving) return;
    setSupportCustomer(null);
    setSupportDetail(null);
    setSupportMessage(null);
    setNewAccessLink(null);
    setVerificationMethod("");
    setReason("");
    setIdentityVerified(false);
  }

  async function saveIdentityChange() {
    if (!supportCustomer || !supportDetail || !activeRestaurant) return;
    const phoneValidation = customerPhoneValidation(newPhoneCountryCode, newPhone);
    if (changeType === "phone" && !phoneValidation.e164) {
      setSupportMessage(phoneValidation.error ?? "Bitte gib eine gültige Telefonnummer ein.");
      return;
    }
    setSupportSaving(true);
    setSupportMessage(null);
    try {
      const result = await updateCustomerIdentityBySupport({
        restaurantId,
        customerId: supportCustomer.id,
        changeType,
        newPhone: changeType === "phone" ? phoneValidation.e164 : null,
        birthdayDay: changeType === "birthday" ? Number(birthdayDay) : null,
        birthdayMonth: changeType === "birthday" ? Number(birthdayMonth) : null,
        identityVerified,
        verificationMethod,
        reason,
      });
      if (result.new_customer_token) {
        const link = new URL(`/customer/${activeRestaurant.slug}`, window.location.origin);
        link.searchParams.set("token", result.new_customer_token);
        setNewAccessLink(link.toString());
      }
      setSupportMessage(changeType === "phone"
        ? "Telefonnummer geändert. Alte Zugänge wurden widerrufen."
        : "Geburtsdatum wurde korrigiert.");
      const nextCustomers = await loadCustomers(restaurantId);
      setCustomers(nextCustomers);
      const detail = await loadCustomerIdentitySupportDetail(restaurantId, supportCustomer.id);
      setSupportDetail(detail);
      const phoneParts = splitCustomerPhone(detail.phone);
      setNewPhoneCountryCode(phoneParts.countryCode);
      setNewPhone(phoneParts.localNumber);
      setBirthdayDay(detail.birthday_day ? String(detail.birthday_day) : "");
      setBirthdayMonth(detail.birthday_month ? String(detail.birthday_month) : "");
      setIdentityVerified(false);
      setVerificationMethod("");
      setReason("");
    } catch (error) {
      setSupportMessage(error instanceof Error ? error.message : "Identitätsdaten konnten nicht geändert werden.");
    } finally {
      setSupportSaving(false);
    }
  }

  return (
    <>
      <header className="page-header">
        <div>
          <h1>Gäste</h1>
          <p className="muted">Suche Gäste und sieh ihren aktuellen Bonusstand.</p>
        </div>
      </header>

      <section className="card guest-search-card">
        <label className="field" htmlFor="guest-search">
          <span>Gast suchen</span>
          <div className="search-input-wrap">
            <Search size={18} />
            <input
              className="input"
              id="guest-search"
              onChange={(event) => dispatchFilter({
                type: "query_changed",
                restaurantId,
                query: event.target.value,
              })}
              placeholder="Name oder maskierte Telefonnummer"
              type="search"
              value={query}
            />
          </div>
        </label>
      </section>

      <section className="guest-card-grid" aria-label="Gästeliste">
        {loading ? (
          <article className="card empty-state-card" role="status">
            <LoaderCircle aria-hidden="true" size={34} />
            <h2>Gäste werden geladen</h2>
          </article>
        ) : null}
        {!loading && loadError ? (
          <article className="card empty-state-card" role="alert">
            <Users aria-hidden="true" size={34} />
            <h2>Gäste konnten nicht geladen werden</h2>
            <p className="muted">Bitte versuche es erneut.</p>
            <button className="button secondary" onClick={() => setLoadAttempt((value) => value + 1)} type="button">
              <RotateCw aria-hidden="true" size={18} /> Erneut versuchen
            </button>
          </article>
        ) : null}
        {!loading && !loadError ? filteredCustomers.map((customer) => (
          <article className="card guest-card" key={customer.id}>
            <div className="guest-card-head">
              <div>
                <h2>{customer.name}</h2>
                <p className="muted">{customer.phone ?? "Kein Telefon hinterlegt"}</p>
              </div>
              <span className="pill">{customerStatus(customer)}</span>
            </div>
            <div className="guest-kpi-row">
              <span className="pill">{customer.points_balance} Punkte</span>
              <span className="pill">{customer.stamp_balance} Stempel</span>
              <span className="pill">{customer.membership_level}</span>
            </div>
            <p className="muted">Seit {formatDate(customer.created_at)} Mitglied.</p>
            {identitySupportAllowed ? (
              <button className="button secondary" onClick={() => openIdentitySupport(customer)} type="button">
                <ShieldCheck aria-hidden="true" size={17} /> Identitätsdaten korrigieren
              </button>
            ) : null}
          </article>
        )) : null}
        {!loading && !loadError && filteredCustomers.length === 0 ? (
          <article className="card empty-state-card">
            <Users size={34} />
            <h2>{query ? "Für diese Suche wurden keine Gäste gefunden" : "Noch keine Gäste"}</h2>
            <p className="muted">{query
              ? "Prüfe den Suchbegriff oder lösche die Suche."
              : "Neue Gäste erscheinen hier nach ihrer Registrierung."}</p>
          </article>
        ) : null}
      </section>

      <AppDrawer
        description="Nur Owner und ausdrücklich berechtigte Restaurant-Administratoren dürfen Identitätsdaten korrigieren."
        dismissOnOverlay={!supportSaving}
        footer={supportDetail ? (
          <>
            <button className="button secondary" disabled={supportSaving} onClick={closeIdentitySupport} type="button">Schließen</button>
            <button
              className="button"
              disabled={supportSaving || !identityVerified || !verificationMethod.trim() || !reason.trim()}
              onClick={saveIdentityChange}
              type="button"
            >
              {supportSaving ? "Änderung wird geprüft …" : "Identitätsdaten ändern"}
            </button>
          </>
        ) : <button className="button" onClick={closeIdentitySupport} type="button">Schließen</button>}
        onClose={closeIdentitySupport}
        open={Boolean(supportCustomer && supportCustomer.restaurant_id === restaurantId)}
        size="large"
        title="Identitätsdaten korrigieren"
      >
        {supportLoading ? <p>Identitätsdaten werden sicher geladen …</p> : null}
        {supportDetail ? (
          <div className="customer-identity-support">
            <RequiredFieldsNote />
            <div className="premium-account-detail-list">
              <div><span>Gast</span><strong>{supportDetail.name}</strong></div>
              <div><span>Telefon</span><strong>{supportDetail.phone}</strong></div>
              <div><span>Geburtstag</span><strong>{supportDetail.birthday_day && supportDetail.birthday_month ? `${String(supportDetail.birthday_day).padStart(2, "0")}.${String(supportDetail.birthday_month).padStart(2, "0")}.****` : "Nicht hinterlegt"}</strong></div>
            </div>

            <div className="field">
              <span>Änderung</span>
              <div className="segmented-control">
                <button aria-pressed={changeType === "phone"} onClick={() => setChangeType("phone")} type="button">Telefonnummer</button>
                <button aria-pressed={changeType === "birthday"} onClick={() => setChangeType("birthday")} type="button">Geburtsdatum</button>
              </div>
            </div>

            {changeType === "phone" ? (
              <CustomerPhoneField
                countryCode={newPhoneCountryCode}
                idPrefix="support-phone"
                label="Neue Telefonnummer"
                localNumber={newPhone}
                onCountryCodeChange={setNewPhoneCountryCode}
                onLocalNumberChange={setNewPhone}
                showError={Boolean(newPhone)}
                required
              />
            ) : (
              <div className="premium-birthday-fields">
                <div><FormLabel htmlFor="support-birthday-day" required>Tag</FormLabel><input aria-required="true" className="input" id="support-birthday-day" inputMode="numeric" max="31" min="1" onChange={(event) => setBirthdayDay(event.target.value.replace(/\D/g, "").slice(0, 2))} required value={birthdayDay} /></div>
                <div><FormLabel htmlFor="support-birthday-month" required>Monat</FormLabel><input aria-required="true" className="input" id="support-birthday-month" inputMode="numeric" max="12" min="1" onChange={(event) => setBirthdayMonth(event.target.value.replace(/\D/g, "").slice(0, 2))} required value={birthdayMonth} /></div>
              </div>
            )}

            <div className="field"><FormLabel htmlFor="support-verification-method" required>Prüfart</FormLabel><input aria-required="true" className="input" id="support-verification-method" onChange={(event) => setVerificationMethod(event.target.value)} placeholder="Zum Beispiel persönlich im Restaurant" required value={verificationMethod} /></div>
            <div className="field"><FormLabel htmlFor="support-change-reason" required>Änderungsgrund</FormLabel><textarea aria-required="true" className="input" id="support-change-reason" onChange={(event) => setReason(event.target.value)} placeholder="Kurze sachliche Begründung" required value={reason} /></div>
            <label className="checkbox-row">
              <input aria-required="true" checked={identityVerified} onChange={(event) => setIdentityVerified(event.target.checked)} required type="checkbox" />
              <span>Die Identität des Kunden wurde geprüft.<span aria-hidden="true" className="required-field-marker"> *</span><span className="sr-only"> Pflichtfeld</span></span>
            </label>
            <p className="muted">Diese Änderung betrifft die Identität des Kunden. Bitte bestätige, dass die Identität geprüft wurde.</p>

            {newAccessLink ? (
              <section className="customer-new-access">
                <h3>Neuer persönlicher Zugang</h3>
                <p>Zeige diesen QR-Code jetzt dem Gast. Nach dem Schließen wird der Zugang hier nicht erneut angezeigt.</p>
                <QRCodeSVG level="M" size={196} value={newAccessLink} />
                <button className="button secondary" onClick={() => navigator.clipboard.writeText(newAccessLink)} type="button"><Copy aria-hidden="true" size={17} /> Link kopieren</button>
              </section>
            ) : null}
          </div>
        ) : null}
        {supportMessage ? <p className="status-message" role="status">{supportMessage}</p> : null}
      </AppDrawer>
    </>
  );
}
