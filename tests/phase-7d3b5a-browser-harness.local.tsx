import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes, useNavigate, useParams } from "react-router-dom";
import { StaffRestaurantRouteGate } from "../src/modules/auth/StaffRestaurantRouteGate";
import { useStaffPortalAccess } from "../src/modules/auth/staffPortalAccessContext";
import { SecureRedemptionQueue } from "../src/modules/staff/SecureRedemptionQueue";

function Navigation() {
  const navigate = useNavigate();
  (window as any).__d3b5aNavigate = (slug: string) => navigate(`/staff/${slug}`);
  return null;
}

function StaffPage() {
  const { slug = "" } = useParams();
  const access = useStaffPortalAccess();
  return <main>
    <div data-testid="portal" data-slug={slug} data-role={access?.restaurant_role}>Staff-Portal</div>
    <SecureRedemptionQueue restaurantSlug={slug} owner={access?.restaurant_role === "owner"} />
  </main>;
}

createRoot(document.getElementById("root")!).render(<BrowserRouter><Navigation /><Routes>
  <Route path="/staff/:slug" element={<StaffRestaurantRouteGate><StaffPage /></StaffRestaurantRouteGate>} />
</Routes></BrowserRouter>);
