let authFailureHandled = false;

/** Reset after a successful login so the next expiry can be handled again. */
export function resetAuthFailureGuard() {
  authFailureHandled = false;
}

/**
 * Call when an API response is 401. Dispatches `iot-session-expired` once per page load
 * so the app can log out instead of retrying in a loop (stale token in localStorage).
 */
export function notifyAuthFailure(response) {
  if (!response || response.status !== 401) return false;
  if (authFailureHandled) return true;
  authFailureHandled = true;
  window.dispatchEvent(new CustomEvent('iot-session-expired'));
  return true;
}
