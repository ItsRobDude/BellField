// A 401 on any signed-in office API call means the session is over. The auth shell registers
// one listener here to return to sign-in; the API wrappers notify it and still throw.

type OfficeUnauthorizedListener = (message: string) => void;

let unauthorizedListener: OfficeUnauthorizedListener | null = null;

export function setOfficeUnauthorizedListener(listener: OfficeUnauthorizedListener | null): void {
  unauthorizedListener = listener;
}

export function notifyOfficeUnauthorized(message: string): void {
  unauthorizedListener?.(message);
}

export const officeSessionEndedMessage = 'Your session has ended. Please sign in again.';
