import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  CakeSlice,
  CheckCircle2,
  CircleAlert,
  Gift,
  MapPinned,
  Newspaper,
  QrCode,
  RefreshCw,
  Smartphone,
} from "lucide-react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../auth/AuthProvider";
import { loadRestaurantLegalSetup, type RestaurantLegalSetup } from "../../legal/legalService";
import { useTenant } from "../../tenant/TenantProvider";
import { loadDashboardSetupStatus, type DashboardSetupStatus } from "../dashboardNoticeService";
import { resolveOwnerSetupAreas, type OwnerSetupArea } from "../ownerDashboardRecommendation.mjs";
import { isAuthoritativePublicationReady, isQrSetupReady } from "../ownerDashboardSetupStatus.mjs";
import {
  ownerSetupOverviewLaunchState,
  readOwnerSetupOverviewSuccessState,
} from "../ownerSmartSetupContinuation.mjs";

const setupAreaPresentation: Record<OwnerSetupArea["id"], {
  title: string;
  description: string;
  href: string;
  recommendationId: string;
  icon: typeof MapPinned;
}> = {
  restaurant_location: {
    title: "Restaurant & Standort",
    description: "Veröffentlichung, Rechtliches und Auffindbarkeit prüfen.",
    href: "/admin/settings/standort",
    recommendationId: "publication_location_incomplete",
    icon: MapPinned,
  },
  points_redemption: {
    title: "Punkteeinlösungen",
    description: "Einlösbare Vorteile für deine Gäste verwalten.",
    href: "/admin/rewards",
    recommendationId: "setup_points_redemption",
    icon: Gift,
  },
  offer: {
    title: "Aktuelles & Angebote",
    description: "Veröffentlichte und geplante Angebote verwalten.",
    href: "/admin/offers",
    recommendationId: "setup_first_offer",
    icon: Newspaper,
  },
  birthday: {
    title: "Geburtstagsgeschenke",
    description: "Geschenke für den Geburtstagspool auswählen.",
    href: "/admin/welcome-gifts",
    recommendationId: "setup_birthday_gift_pool",
    icon: CakeSlice,
  },
  qr: {
    title: "QR Center",
    description: "QR-Codes und Starter Kit öffnen.",
    href: "/admin/qr",
    recommendationId: "setup_qr_center",
    icon: QrCode,
  },
  staff: {
    title: "Mitarbeiterzugang",
    description: "Als Inhaber kannst du den Mitarbeiterbereich selbst nutzen.",
    href: "/admin/staff",
    recommendationId: "setup_staff_access",
    icon: Smartphone,
  },
};

export function OwnerSetupOverviewPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { activeRestaurant, loading: tenantLoading } = useTenant();
  const [legalSetup, setLegalSetup] = useState<RestaurantLegalSetup | null>(null);
  const [setupStatus, setSetupStatus] = useState<DashboardSetupStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [successMessage, setSuccessMessage] = useState(
    () => readOwnerSetupOverviewSuccessState(location.state)?.message ?? null,
  );

  useEffect(() => {
    const success = readOwnerSetupOverviewSuccessState(location.state);
    if (!success) return;
    setSuccessMessage(success.message);
    navigate(location.pathname, { replace: true, state: null });
  }, [location.pathname, location.state, navigate]);

  useEffect(() => {
    if (tenantLoading) return;
    if (!activeRestaurant?.id) {
      setLoading(false);
      setLoadFailed(true);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setLoadFailed(false);
    Promise.allSettled([
      loadRestaurantLegalSetup(activeRestaurant.id),
      loadDashboardSetupStatus(activeRestaurant.id, activeRestaurant.slug),
    ]).then(([legalResult, setupResult]) => {
      if (cancelled) return;
      if (legalResult.status === "fulfilled" && setupResult.status === "fulfilled") {
        setLegalSetup(legalResult.value);
        setSetupStatus(setupResult.value);
      } else {
        setLegalSetup(null);
        setSetupStatus(null);
        setLoadFailed(true);
      }
      setLoading(false);
    });

    return () => { cancelled = true; };
  }, [activeRestaurant?.id, activeRestaurant?.slug, reloadKey, tenantLoading]);

  const areas = useMemo(() => {
    if (!activeRestaurant || !setupStatus || !legalSetup) return [];
    const registration = legalSetup.readiness.registration;
    if (!registration) return [];
    return resolveOwnerSetupAreas({
      restaurantStatus: { active: activeRestaurant.status === "active" },
      onboardingStatus: activeRestaurant.onboarding_status,
      legalStatus: registration,
      publicationStatus: { ready: isAuthoritativePublicationReady({
        restaurantActive: activeRestaurant.status === "active",
        registrationAllowed: registration.registration_allowed === true,
        publicDiscoveryReady: setupStatus.publicationReady === true,
      }) },
      rewardStatus: {
        pointsRedemptionReady: setupStatus.pointsRedemptionReady,
        birthdayPoolReady: setupStatus.birthdayPoolReady,
      },
      offerStatus: { ready: setupStatus.offerReady },
      qrStatus: { ready: isQrSetupReady(activeRestaurant) },
      staffStatus: { ready: setupStatus.staffReady },
      emailStatus: { confirmed: Boolean(user?.email_confirmed_at) },
      statusLoadFailed: false,
    });
  }, [activeRestaurant, legalSetup, setupStatus, user?.email_confirmed_at]);

  const readyCount = areas.filter((area) => area.ready).length;
  const progress = areas.length ? Math.round((readyCount / areas.length) * 100) : 0;

  return (
    <div className="owner-setup-overview">
      <header className="page-header owner-setup-overview-header">
        <div>
          <h1>Setup & Einrichtung</h1>
          <p className="muted">Prüfe und verwalte die wichtigsten Einstellungen deines Bonusprogramms.</p>
        </div>
        <Link className="button secondary" to="/admin/settings">
          <ArrowLeft aria-hidden="true" size={18} />
          Zurück
        </Link>
      </header>

      {successMessage ? <p className="status-message" role="status">{successMessage}</p> : null}

      {loading ? (
        <section aria-busy="true" className="card owner-setup-progress">
          <p className="muted">Einrichtungsstatus wird geladen...</p>
        </section>
      ) : loadFailed ? (
        <section className="card owner-setup-load-error" role="alert">
          <CircleAlert aria-hidden="true" size={24} />
          <div>
            <h2>Einrichtungsstatus nicht verfügbar</h2>
            <p className="muted">Der aktuelle Status konnte nicht vollständig geladen werden.</p>
          </div>
          <button className="button secondary" onClick={() => setReloadKey((current) => current + 1)} type="button">
            <RefreshCw aria-hidden="true" size={18} />
            Erneut prüfen
          </button>
        </section>
      ) : (
        <>
          <section className="card owner-setup-progress" aria-label={`${readyCount} von ${areas.length} eingerichtet`}>
            <div>
              <span>Einrichtungsfortschritt</span>
              <strong>{readyCount} von {areas.length} eingerichtet</strong>
            </div>
            <div aria-hidden="true" className="owner-setup-progress-track">
              <span style={{ width: `${progress}%` }} />
            </div>
          </section>

          <section aria-label="Einrichtungsbereiche" className="owner-setup-list">
            {areas.map((area) => {
              const presentation = setupAreaPresentation[area.id];
              const Icon = presentation.icon;
              return (
                <Link
                  className="card owner-setup-row"
                  key={area.id}
                  state={ownerSetupOverviewLaunchState(presentation.recommendationId)}
                  to={presentation.href}
                >
                  <span aria-hidden="true" className="owner-setup-row-icon"><Icon size={22} /></span>
                  <span className="owner-setup-row-copy">
                    <strong>{presentation.title}</strong>
                    <small>{presentation.description}</small>
                  </span>
                  <span className={`owner-setup-row-status ${area.ready ? "ready" : "open"}`}>
                    {area.ready ? <CheckCircle2 aria-hidden="true" size={18} /> : <CircleAlert aria-hidden="true" size={18} />}
                    {area.ready ? "Eingerichtet" : "Noch einrichten"}
                  </span>
                  <ArrowRight aria-hidden="true" className="owner-setup-row-arrow" size={20} />
                </Link>
              );
            })}
          </section>
        </>
      )}
    </div>
  );
}
