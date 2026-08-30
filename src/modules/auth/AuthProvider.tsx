import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { AuthChangeEvent, Session, User } from "@supabase/supabase-js";
import { useLocation, useNavigate } from "react-router-dom";
import { liveDataUnavailableMessage, supabase, supabaseAuthStorageKey } from "../../shared/lib/supabase";
import type { PlatformRole, RestaurantUserRole, UserRole } from "../../shared/types/domain";
import { isPublicReferralPath, shouldHydrateAuthSession } from "./authRoutePolicy.mjs";
import {
  clearSupabaseAuthStorage,
  createAuthRefreshController,
  createInvalidRefreshSessionHandler,
} from "./authSessionGuard.mjs";
import { classifyOwnerAuthError, isOwnerEmailConfirmed, ownerAuthErrorMessage } from "./ownerAuthFlow.mjs";
import { isPlatformAdminRole } from "../platform/platformAdminAuthorization.mjs";
import { buildStaffLoginPath, staffSlugFromLegacyPath } from "./staffLoginFlow.mjs";
import { emptyPortalAccess, type PortalAccess } from "./portalAccessUx.mjs";

type AuthContextValue = {
  user: User | null;
  session: Session | null;
  role: UserRole | null;
  restaurantRole: RestaurantUserRole | null;
  platformRole: PlatformRole | null;
  portalAccess: PortalAccess;
  portalAccessError: boolean;
  restaurantAuthorizationError: boolean;
  contextRevision: number;
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

type VerifiedAuthorization = {
  restaurantResolution: RestaurantRoleResolution;
  platformRole: PlatformRole | null;
  portalAccess: PortalAccess;
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

async function readVerifiedPortalAccess(): Promise<PortalAccess> {
  if (!supabase) throw new Error(liveDataUnavailableMessage);
  const { data, error } = await supabase.rpc("get_current_portal_access");
  if (error) throw error;
  return { ...emptyPortalAccess, ...(data as Partial<PortalAccess> | null) };
}

async function readVerifiedAuthorization(user: User): Promise<VerifiedAuthorization> {
  const [restaurantResolution, platformRole, portalAccess] = await Promise.all([
    readVerifiedRestaurantRole(user),
    readVerifiedPlatformRole(),
    readVerifiedPortalAccess(),
  ]);
  return { restaurantResolution, platformRole, portalAccess };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const sessionHydrationEnabled = shouldHydrateAuthSession(location.pathname);
  const referralContinuationPath = isPublicReferralPath(location.pathname);
  const invalidSessionRedirect = referralContinuationPath
    ? `${location.pathname}${location.search}`
    : location.pathname.startsWith("/customer")
    ? `/customer/login?returnTo=${encodeURIComponent(`${location.pathname}${location.search}`)}`
    : location.pathname.startsWith("/staff")
      ? buildStaffLoginPath(staffSlugFromLegacyPath(location.pathname) ?? new URLSearchParams(location.search).get("restaurant"))
      : "/restaurant/login";
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(Boolean(supabase && sessionHydrationEnabled));
  const [roleLoading, setRoleLoading] = useState(Boolean(supabase && sessionHydrationEnabled));
  const [restaurantRole, setRestaurantRole] = useState<RestaurantUserRole | null>(null);
  const [platformRole, setPlatformRole] = useState<PlatformRole | null>(null);
  const [portalAccess, setPortalAccess] = useState<PortalAccess>({ ...emptyPortalAccess });
  const [portalAccessError, setPortalAccessError] = useState(false);
  const [restaurantAuthorizationError, setRestaurantAuthorizationError] = useState(false);
  const [authorizationRevision, setAuthorizationRevision] = useState(0);
  const [contextRevision, setContextRevision] = useState(0);
  const [lastAuthEvent, setLastAuthEvent] = useState<AuthChangeEvent | null>(null);
  const currentUserIdRef = useRef<string | null>(null);
  const authorizationRequestRef = useRef<{ userId: string; promise: Promise<VerifiedAuthorization> } | null>(null);
  const sessionRevalidationRef = useRef<Promise<void> | null>(null);

  const resolveAndCommitAuthorization = useCallback(async (targetUser: User, force = false) => {
    setRoleLoading(true);
    let request = authorizationRequestRef.current;
    if (force || !request || request.userId !== targetUser.id) {
      request = {
        userId: targetUser.id,
        promise: readVerifiedAuthorization(targetUser),
      };
      authorizationRequestRef.current = request;
    }

    try {
      const result = await request.promise;
      if (currentUserIdRef.current !== targetUser.id || authorizationRequestRef.current !== request) return false;
      setRestaurantRole(result.restaurantResolution.role);
      setRestaurantAuthorizationError(result.restaurantResolution.unavailable);
      setPlatformRole(result.platformRole);
      setPortalAccess(result.portalAccess);
      setPortalAccessError(false);
      setContextRevision((current) => current + 1);
      return true;
    } catch {
      if (currentUserIdRef.current !== targetUser.id || authorizationRequestRef.current !== request) return false;
      setRestaurantRole(null);
      setRestaurantAuthorizationError(true);
      setPlatformRole(null);
      setPortalAccess({ ...emptyPortalAccess });
      setPortalAccessError(true);
      return false;
    } finally {
      if (authorizationRequestRef.current === request) {
        authorizationRequestRef.current = null;
        if (currentUserIdRef.current === targetUser.id) {
          setRoleLoading(false);
        }
      }
    }
  }, []);

  function clearAuthState() {
    currentUserIdRef.current = null;
    authorizationRequestRef.current = null;
    sessionRevalidationRef.current = null;
    setSession(null);
    setUser(null);
    setRestaurantRole(null);
    setPlatformRole(null);
    setPortalAccess({ ...emptyPortalAccess });
    setPortalAccessError(false);
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
        currentUserIdRef.current = nextUser?.id ?? null;
        setRoleLoading(Boolean(nextUser));
        setSession(nextSession);
        setUser(nextUser);
        setAuthLoading(false);
      },
      refreshSession: async () => authClient.refreshSession(),
      scheduleInterval: (callback, delay) => window.setInterval(callback, delay),
    });

    function clearStateAfterSessionError() {
      currentUserIdRef.current = null;
      authorizationRequestRef.current = null;
      setSession(null);
      setUser(null);
      setRestaurantRole(null);
      setPlatformRole(null);
      setPortalAccess({ ...emptyPortalAccess });
      setPortalAccessError(false);
      setRoleLoading(false);
    }

    if (!sessionHydrationEnabled) {
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
          currentUserIdRef.current = nextUser?.id ?? null;
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
      if (!sessionHydrationEnabled && event !== "SIGNED_IN" && event !== "SIGNED_OUT") return;
      if (event === "SIGNED_IN") invalidSessionHandler.reset();
      if (nextSession) {
        refreshController.start(nextSession);
        refreshController.update(nextSession);
      } else {
        refreshController.stop();
      }
      const nextUser = nextSession?.user ?? null;
      currentUserIdRef.current = nextUser?.id ?? null;
      setRoleLoading(Boolean(nextUser));
      setSession(nextSession);
      setUser(nextUser);
      setLastAuthEvent(event);
      setAuthLoading(false);
      setAuthorizationRevision((current) => current + 1);
    });

    async function revalidateStoredSession() {
      if (!sessionHydrationEnabled || sessionRevalidationRef.current) return sessionRevalidationRef.current;
      sessionRevalidationRef.current = (async () => {
        await refreshController.refreshIfNeeded();
        const { data, error } = await authClient.getSession();
        if (error) {
          const invalid = await invalidSessionHandler.handle(error);
          if (!invalid && !cancelled) setPortalAccessError(true);
          return;
        }
        if (cancelled) return;
        const nextSession = data.session;
        const nextUser = nextSession?.user ?? null;
        currentUserIdRef.current = nextUser?.id ?? null;
        setSession(nextSession);
        setUser(nextUser);
        setAuthLoading(false);
        if (nextUser) {
          await resolveAndCommitAuthorization(nextUser, true);
        } else {
          setRoleLoading(false);
        }
      })().finally(() => {
        sessionRevalidationRef.current = null;
      });
      return sessionRevalidationRef.current;
    }

    function handleVisibilityChange() {
      if (document.visibilityState === "visible") void revalidateStoredSession();
    }

    function handlePageShow(event: PageTransitionEvent) {
      if (event.persisted) void revalidateStoredSession();
    }
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("pageshow", handlePageShow);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("pageshow", handlePageShow);
      subscription.unsubscribe();
      refreshController.stop();
    };
  }, [invalidSessionRedirect, navigate, resolveAndCommitAuthorization, sessionHydrationEnabled]);

  useEffect(() => {
    async function resolveRole() {
      if (!user) {
        setRestaurantRole(null);
        setPlatformRole(null);
        setPortalAccess({ ...emptyPortalAccess });
        setPortalAccessError(false);
        setRestaurantAuthorizationError(false);
        setRoleLoading(false);
        return;
      }

      await resolveAndCommitAuthorization(user);
    }

    void resolveRole();
  }, [authorizationRevision, resolveAndCommitAuthorization, user]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      session,
      lastAuthEvent,
      role: restaurantRole,
      restaurantRole,
      platformRole,
      portalAccess,
      portalAccessError,
      restaurantAuthorizationError,
      contextRevision,
      retryAuthorization: () => {
        authorizationRequestRef.current = null;
        setAuthorizationRevision((current) => current + 1);
      },
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
        setPortalAccess({ ...emptyPortalAccess });
        setPortalAccessError(false);
        setRestaurantAuthorizationError(false);
        setAuthLoading(false);
        setRoleLoading(true);
        currentUserIdRef.current = data.user.id;
        await resolveAndCommitAuthorization(data.user, true);
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
    [authLoading, contextRevision, lastAuthEvent, platformRole, portalAccess, portalAccessError, resolveAndCommitAuthorization, restaurantAuthorizationError, restaurantRole, roleLoading, session, user],
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
