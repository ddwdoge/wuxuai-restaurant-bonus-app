export function shouldPreserveAuthorizedSurface({ event, currentUserId, nextUserId }) {
  return event === "MFA_CHALLENGE_VERIFIED"
    && Boolean(currentUserId)
    && currentUserId === nextUserId;
}
