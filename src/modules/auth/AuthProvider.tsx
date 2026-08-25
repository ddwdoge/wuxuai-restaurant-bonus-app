import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { AuthChangeEvent, Session, User } from "@supabase/supabase-js";
import { useLocation, useNavigate } from "react-router-dom";
import { liveDataUnavailableMessage, supabase, supabaseAuthStorageKey } from "../../shared/lib/supabase";
import type { PlatformRole, RestaurantUserRole, UserRole } from "../../shared/types/domain";
import { requiresAuthenticatedSession } from "./authRoutePolicy.mjs";
import {
  clearSupabaseAuthStorage,
  createAuthRefreshController,
  createInvalidRefreshSessionHandler,
} from "./authSessionGuard.mjs";
import { classifyOwnerAuthError, isOwnerEmailConfirmed, ownerAuthErrorMessage } from "./ownerAuthFlow.mjs";
import { isPlatformAdminRole } from "../platform/platformAdminAuthorization.mjs";
import { buildStaffLoginPath, staffSlugFromLegacyPath } from "./staffLoginFlow.mjs";

type AuthContextValue = {
  user: User | null;
  session: Session | null;
  role: UserRole | null;
  restaurantRole: RestaurantUserRole | null;
  platformRole: PlatformRole | null;
  restaurantAuthorizationError: boolean;
  loading: boolean;
  lastAuthEvent: AuthChangeEvent | null;
  retryAuthorization: () => void;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

const restaurantRolePriority: RestaurantUserRole[] = ["owner", "admin", "manager", "supervisor", "staff"];

type RestaurantRoleResolution = {
  role: RestaurantUserRole | null;
  unavailable: boolean;
};

async function readVerifiedRestaurantRole(user: User): Promise<RestaurantRoleResolution> {
  if (!supabase) {
    return { role: null, unavailable: true };
  }

  const { data, error } = await supabase
    .from("restaurant_members")
    .select("role")
    .eq("user_id", user.id);

  if (error) {
    console.warn("Restaurantrolle konnte nicht geprüft werden.", error);
    return { role: null, unavailable: true };
  }

  if (data?.length) {
    const roles = data.map((membership) => membership.role as RestaurantUserRole);
    return {
      role: restaurantRolePriority.find((role) => roles.includes(role)) ?? "customer",
      unavailable: false,
    };
  }

  return { role: "customer", unavailable: false };
}

async function readVerifiedPlatformRole(): Promise<PlatformRole | null> {
  if (!supabase) {
    return null;
  }

  const { data, error } = await supabase.rpc("get_current_platform_role");
  if (error) {
    console.warn("Plattformrolle konnte nicht geprüft werden.", error);
    return null;
  }

  return isPlatformAdminRole(data) ? data : null;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const authSessionRequired = requiresAuthenticatedSession(location.pathname);
  const invalidSessionRedirect = location.pathname.startsWith("/customer")
    ? `/customer/login?returnTo=${encodeURIComponent(`${location.pathname}${location.search}`)}`
    : location.pathname.startsWith("/staff")
      ? buildStaffLoginPath(staffSlugFromLegacyPath(location.pathname) ?? new URLSearchParams(location.search).get("restaurant"))
      : "/restaurant/login";
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(Boolean(supabase && authSessionRequired));
  const [roleLoading, setRoleLoading] = useState(Boolean(supabase && authSessionRequired));
  const [restaurantRole, setRestaurantRole] = useState<RestaurantUserRole | null>(null);
  const [platformRole, setPlatformRole] = useState<PlatformRole | null>(null);
  const [restaurantAuthorizationError, setRestaurantAuthorizationError] = useState(false);
  const [authorizationRevision, setAuthorizationRevision] = useState(0);
  const [lastAuthEvent, setLastAuthEvent] = useState<AuthChangeEvent | null>(null);

  function clearAuthState() {
    setSession(null);
    setUser(null);
    setRestaurantRole(null);
    setPlatformRole(null);
    setRestaurantAuthorizationError(false);
    setLastAuthEvent("SIGNED_OUT");
    setAuthLoading(false);
    setRoleLoading(false);
  }

  useEffect(() => {
    if (!supabase) {
      setAuthLoading(false);
      setRoleLoading(false);
      return;
    }

    const authClient = supabase.auth;
    let cancelled = false;
    const invalidSessionHandler = createInvalidRefreshSessionHandler({
      clearStorage: () => clearSupabaseAuthStorage(window.localStorage, supabaseAuthStorageKey),
      localSignOut: async () => {
        const { error } = await authClient.signOut({ scope: "local" });
        if (error && error.name !== "AuthSessionMissingError") throw error;
      },
      onInvalidSession: () => {
        if (cancelled) return;
        clearAuthState();
        navigate(invalidSessionRedirect, { replace: true });
      },
    });
    const refreshController = createAuthRefreshController({
      cancelInterval: (interval) => window.clearInterval(interval),
      handleRefreshError: async (error) => invalidSessionHandler.handle(error),
      onSession: (nextSession) => {
        if (cancelled) return;
        const nextUser = nextSession?.user ?? null;
        setRoleLoading(Boolean(nextUser));
        setSession(nextSession);
        setUser(nextUser);
        setAuthLoading(false);
      },
      refreshSession: async () => authClient.refreshSession(),
      scheduleInterval: (callback, delay) => window.setInterval(callback, delay),
    });

    function clearStateAfterSessionError() {
      setSession(null);
      setUser(null);
      setRestaurantRole(null);
      setPlatformRole(null);
      setRoleLoading(false);
    }

    if (!authSessionRequired) {
      refreshController.stop();
      setAuthLoading(false);
      setRoleLoading(false);
    } else {
      setAuthLoading(true);
      authClient.getSession()
        .then(async ({ data, error }) => {
          if (cancelled) return;
          if (error) {
            const invalid = await invalidSessionHandler.handle(error);
            if (!invalid && !cancelled) clearStateAfterSessionError();
            return;
          }
          const nextUser = data.session?.user ?? null;
          setRoleLoading(Boolean(nextUser));
          setSession(data.session);
          setUser(nextUser);
          refreshController.start(data.session);
        })
        .catch(async (error) => {
          if (cancelled) return;
          const invalid = await invalidSessionHandler.handle(error);
          if (!invalid && !cancelled) clearStateAfterSessionError();
        })
        .finally(() => {
          if (!cancelled) setAuthLoading(false);
        });
    }

    const {
      data: { subscription },
    } = authClient.onAuthStateChange((event, nextSession) => {
      if (!authSessionRequired && event !== "SIGNED_IN" && event !== "SIGNED_OUT") return;
      if (event === "SIGNED_IN") invalidSessionHandler.reset();
      if (nextSession) {
        refreshController.start(nextSession);
        refreshController.update(nextSession);
      } else {
        refreshController.stop();
      }
      const nextUser = nextSession?.user ?? null;
      setRoleLoading(Boolean(nextUser));
      setSession(nextSession);
      setUser(nextUser);
      setLastAuthEvent(event);
      setAuthLoading(false);
    });

    function handleVisibilityChange() {
      if (authSessionRequired && document.visibilityState === "visible") {
        void refreshController.refreshIfNeeded();
      }
    }
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      subscription.unsubscribe();
      refreshController.stop();
    };
  }, [authSessionRequired, invalidSessionRedirect, navigate]);

  useEffect(() => {
    let cancelled = false;

    async function resolveRole() {
      if (!user) {
        setRestaurantRole(null);
        setPlatformRole(null);
        setRestaurantAuthorizationError(false);
        setRoleLoading(false);
        return;
      }

      setRoleLoading(true);
      try {
        const [restaurantResolution, nextPlatformRole] = await Promise.all([
          readVerifiedRestaurantRole(user),
          readVerifiedPlatformRole(),
        ]);
        if (!cancelled) {
          setRestaurantRole(restaurantResolution.role);
          setRestaurantAuthorizationError(restaurantResolution.unavailable);
          setPlatformRole(nextPlatformRole);
        }
      } catch {
        if (!cancelled) {
          setRestaurantRole(null);
          setRestaurantAuthorizationError(true);
          setPlatformRole(null);
        }
      } finally {
        if (!cancelled) {
          setRoleLoading(false);
        }
      }
    }

    resolveRole();

    return () => {
      cancelled = true;
    };
  }, [authorizationRevision, user]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      session,
      lastAuthEvent,
      role: restaurantRole,
      restaurantRole,
      platformRole,
      restaurantAuthorizationError,
      retryAuthorization: () => setAuthorizationRevision((current) => current + 1),
      loading: authLoading || roleLoading,
      async signIn(email: string, password: string) {
        if (!supabase) {
          throw new Error(liveDataUnavailableMessage);
        }
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) {
          const mappedError = new Error(ownerAuthErrorMessage(error));
          mappedError.name = classifyOwnerAuthError(error) === "email_unconfirmed"
            ? "EmailConfirmationRequiredError"
            : "OwnerSignInError";
          throw mappedError;
        }
        if (!isOwnerEmailConfirmed(data.user)) {
          await supabase.auth.signOut({ scope: "local" });
          const confirmationError = new Error("Bitte bestätige zuerst deine E-Mail-Adresse.");
          confirmationError.name = "EmailConfirmationRequiredError";
          throw confirmationError;
        }
        setSession(data.session);
        setUser(data.user);
        setRestaurantRole(null);
        setPlatformRole(null);
        setRestaurantAuthorizationError(false);
        setAuthLoading(false);
        setRoleLoading(true);
      },
      async signOut() {
        let logoutFailed = false;

        try {
          if (supabase) {
            const { error } = await supabase.auth.signOut();
            const sessionAlreadyMissing = error?.name === "AuthSessionMissingError";
            logoutFailed = Boolean(error && !sessionAlreadyMissing);
            if (error) {
              await supabase.auth.signOut({ scope: "local" });
            }
          }
        } catch {
          logoutFailed = true;
        } finally {
          clearSupabaseAuthStorage(window.localStorage, supabaseAuthStorageKey);
          clearAuthState();
        }

        if (logoutFailed) {
          throw new Error("Die Online-Abmeldung konnte gerade nicht vollständig bestätigt werden.");
        }
      },
    }),
    [authLoading, lastAuthEvent, platformRole, restaurantAuthorizationError, restaurantRole, roleLoading, session, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider");
  }
  return context;
}
