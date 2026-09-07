// When any office API call comes back 401, the session is over: it expired, an admin revoked
// it, or the account is gone. Left alone, each surface just shows an error and the user is
// stuck on a dead screen. The auth shell registers one listener here for the life of a
// session and takes the user back to sign-in with the server's message; the API wrappers
// call it and still throw, so every caller's own error handling keeps working.

type OfficeUnauthorizedListener = (message: string) => void;

let unauthorizedListener: OfficeUnauthorizedListener | null = null;

export function setOfficeUnauthorizedListener(listener: OfficeUnauthorizedListener | null): void {
  unauthorizedListener = listener;
}

export function notifyOfficeUnauthorized(message: string): void {
  unauthorizedListener?.(message);
}

export const officeSessionEndedMessage = 'Your session has ended. Please sign in again.';
