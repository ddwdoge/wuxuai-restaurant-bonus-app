import { useCallback, useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  ownerSmartSetupSuccessState,
  ownerSetupOverviewSuccessState,
  readOwnerSmartSetupLaunchState,
  readOwnerSetupOverviewLaunchState,
  type OwnerSmartSetupSuccessCode,
} from "./ownerSmartSetupContinuation.mjs";

export function useOwnerSmartSetupContinuation() {
  const location = useLocation();
  const navigate = useNavigate();
  const context = useMemo(() => readOwnerSmartSetupLaunchState(location.state), [location.state]);
  const setupOverviewContext = useMemo(() => readOwnerSetupOverviewLaunchState(location.state), [location.state]);

  const complete = useCallback((code: OwnerSmartSetupSuccessCode) => {
    if (setupOverviewContext) {
      const state = ownerSetupOverviewSuccessState(code);
      if (!state) return false;
      navigate("/admin/settings/setup", { replace: true, state });
      return true;
    }
    if (!context) return false;
    const state = ownerSmartSetupSuccessState(code);
    if (!state) return false;
    navigate("/admin", { replace: true, state });
    return true;
  }, [context, navigate, setupOverviewContext]);

  return {
    active: Boolean(context || setupOverviewContext),
    complete,
    recommendationId: context?.recommendationId ?? setupOverviewContext?.recommendationId ?? null,
    source: context ? "dashboard" : setupOverviewContext ? "setup-overview" : null,
  };
}
