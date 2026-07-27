import { useEffect, useMemo, useState } from "react";
import { Copy, Search, ShieldCheck, Users } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { AppDrawer } from "../../../shared/components/AppDrawer";
import type { Customer } from "../../../shared/types/domain";
import {
  canManageCustomerIdentity,
  loadCustomerIdentitySupportDetail,
  loadCustomers,
  updateCustomerIdentityBySupport,
  type CustomerIdentitySupportDetail,
} from "../../loyalty/loyaltyService";
import { useTenant } from "../../tenant/TenantProvider";

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
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [identitySupportAllowed, setIdentitySupportAllowed] = useState(false);
  const [supportCustomer, setSupportCustomer] = useState<Customer | null>(null);
  const [supportDetail, setSupportDetail] = useState<CustomerIdentitySupportDetail | null>(null);
  const [supportLoading, setSupportLoading] = useState(false);
  const [supportSaving, setSupportSaving] = useState(false);
  const [supportMessage, setSupportMessage] = useState<string | null>(null);
  const [changeType, setChangeType] = useState<"phone" | "birthday">("phone");
  const [newPhone, setNewPhone] = useState("");
  const [birthdayDay, setBirthdayDay] = useState("");
  const [birthdayMonth, setBirthdayMonth] = useState("");
  const [verificationMethod, setVerificationMethod] = useState("");
  const [reason, setReason] = useState("");
  const [identityVerified, setIdentityVerified] = useState(false);
  const [newAccessLink, setNewAccessLink] = useState<string | null>(null);

  useEffect(() => {
    if (!restaurantId) return;

    let cancelled = false;

    Promise.all([loadCustomers(restaurantId), canManageCustomerIdentity(restaurantId)])
      .then(([nextCustomers, supportAllowed]) => {
        if (!cancelled) {
          setCustomers(nextCustomers);
          setIdentitySupportAllowed(supportAllowed);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setStatus(error instanceof Error ? error.message : "Gäste konnten nicht geladen werden.");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [restaurantId]);

  const filteredCustomers = useMemo(() => {
    const cleanQuery = query.trim().toLowerCase();
    if (!cleanQuery) return customers;
    return customers.filter((customer) =>
      `${customer.name} ${customer.phone ?? ""} ${customer.customer_code}`.toLowerCase().includes(cleanQuery),
    );
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
      setNewPhone(detail.phone);
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
    setSupportSaving(true);
    setSupportMessage(null);
    try {
      const result = await updateCustomerIdentityBySupport({
        restaurantId,
        customerId: supportCustomer.id,
        changeType,
        newPhone: changeType === "phone" ? newPhone : null,
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
      setNewPhone(detail.phone);
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
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Name oder maskierte Telefonnummer"
              value={query}
            />
          </div>
        </label>
      </section>

      <section className="guest-card-grid" aria-label="Gästeliste">
        {filteredCustomers.map((customer) => (
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
        ))}
        {filteredCustomers.length === 0 ? (
          <article className="card empty-state-card">
            <Users size={34} />
            <h2>Keine Gäste gefunden</h2>
            <p className="muted">Prüfe die Suche oder registriere neue Gäste über deinen Restaurant-QR.</p>
          </article>
        ) : null}
      </section>

      {status ? <p className="status-message">{status}</p> : null}

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
        open={Boolean(supportCustomer)}
        size="large"
        title="Identitätsdaten korrigieren"
      >
        {supportLoading ? <p>Identitätsdaten werden sicher geladen …</p> : null}
        {supportDetail ? (
          <div className="customer-identity-support">
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
              <label className="field"><span>Neue Telefonnummer</span><input className="input" inputMode="tel" onChange={(event) => setNewPhone(event.target.value)} value={newPhone} /></label>
            ) : (
              <div className="premium-birthday-fields">
                <label><span>Tag</span><input className="input" inputMode="numeric" max="31" min="1" onChange={(event) => setBirthdayDay(event.target.value.replace(/\D/g, "").slice(0, 2))} value={birthdayDay} /></label>
                <label><span>Monat</span><input className="input" inputMode="numeric" max="12" min="1" onChange={(event) => setBirthdayMonth(event.target.value.replace(/\D/g, "").slice(0, 2))} value={birthdayMonth} /></label>
              </div>
            )}

            <label className="field"><span>Prüfart</span><input className="input" onChange={(event) => setVerificationMethod(event.target.value)} placeholder="Zum Beispiel persönlich im Restaurant" value={verificationMethod} /></label>
            <label className="field"><span>Änderungsgrund</span><textarea className="input" onChange={(event) => setReason(event.target.value)} placeholder="Kurze sachliche Begründung" value={reason} /></label>
            <label className="checkbox-row">
              <input checked={identityVerified} onChange={(event) => setIdentityVerified(event.target.checked)} type="checkbox" />
              <span>Die Identität des Kunden wurde geprüft.</span>
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
