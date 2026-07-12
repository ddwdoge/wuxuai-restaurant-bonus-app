import { useEffect, useMemo, useState } from "react";
import { QrCode, Search, Users } from "lucide-react";
import type { Customer } from "../../../shared/types/domain";
import { loadCustomers } from "../../loyalty/loyaltyService";
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

  useEffect(() => {
    if (!restaurantId) return;

    let cancelled = false;

    loadCustomers(restaurantId)
      .then((nextCustomers) => {
        if (!cancelled) setCustomers(nextCustomers);
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
              placeholder="Name, Telefon oder Gästecode"
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
            <p className="guest-code muted">
              <QrCode size={16} /> {customer.customer_code}
            </p>
            <p className="muted">Seit {formatDate(customer.created_at)} Mitglied.</p>
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
    </>
  );
}
