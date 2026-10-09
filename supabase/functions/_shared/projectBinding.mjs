// Server-only gate. The registry is read from the actual credential-bound DB;
// it validates its physical database anchor before returning a binding.
// Runtime identity comes from provider-injected SUPABASE_URL/deployment ID,
// never request JSON, Origin or a client-supplied project claim.
export async function requireProjectBinding(service, runtime) {
  const deployment = /^([a-z]{20})_([0-9a-f-]{36})_([0-9]+)$/.exec(runtime.deploymentId ?? "");
  // Reject inconsistent destinations before sending a service credential.
  if (!deployment || deployment[1] !== runtime.projectRef
    || runtime.backendUrl !== `https://${runtime.projectRef}.supabase.co`
    || runtime.issuer !== `${runtime.backendUrl}/auth/v1`) {
    throw new Error("PROJECT_BINDING_REQUIRED");
  }
  const { data: binding, error } = await service.rpc("get_server_project_binding");
  if (error || !binding || !deployment || deployment[1] !== binding.project_ref
    || runtime.projectRef !== binding.project_ref
    || runtime.backendUrl !== binding.backend_url
    || runtime.issuer !== binding.auth_issuer
    || runtime.appOrigin !== binding.app_origin
    || binding.backend_url !== `https://${binding.project_ref}.supabase.co`
    || binding.auth_issuer !== `${binding.backend_url}/auth/v1`) {
    throw new Error("PROJECT_BINDING_REQUIRED");
  }
  return Object.freeze(binding);
}

// The user-scoped client forwards the genuine bearer session to PostgREST.
// No decoded-but-unverified JWT is treated as an identity proof.
export async function requireProjectSession(userClient) {
  const { data, error } = await userClient.rpc("project_binding_session_matches");
  if (error || data !== true) throw new Error("PROJECT_SESSION_REQUIRED");
}
