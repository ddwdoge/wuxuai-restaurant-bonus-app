import { useCallback, useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  ownerSmartSetupSuccessState,
  readOwnerSmartSetupLaunchState,
  type OwnerSmartSetupSuccessCode,
} from "./ownerSmartSetupContinuation.mjs";

export function useOwnerSmartSetupContinuation() {
  const location = useLocation();
  const navigate = useNavigate();
  const context = useMemo(() => readOwnerSmartSetupLaunchState(location.state), [location.state]);

  const complete = useCallback((code: OwnerSmartSetupSuccessCode) => {
    if (!context) return false;
    const state = ownerSmartSetupSuccessState(code);
    if (!state) return false;
    navigate("/admin", { replace: true, state });
    return true;
  }, [context, navigate]);

  return { active: Boolean(context), complete, recommendationId: context?.recommendationId ?? null };
}
