import { Compass, Home, Store, UserRound } from "lucide-react";
import { NavLink } from "react-router-dom";
import "../central-customer.css";

const items = [
  { to: "/customer", end: true, label: "Start", icon: Home },
  { to: "/customer/locations", label: "Meine Lokale", icon: Store },
  { to: "/customer/restaurants", label: "Entdecken", icon: Compass },
  { to: "/customer/account", label: "Konto", icon: UserRound },
];

export function CentralCustomerNavigation() {
  return (
    <nav aria-label="Mein WUXUAI Navigation" className="central-customer-navigation">
      {items.map(({ end, icon: Icon, label, to }) => (
        <NavLink className={({ isActive }) => isActive ? "active" : undefined} end={end} key={to} to={to}>
          <Icon aria-hidden="true" size={20} />
          <span>{label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
