// Office sign-in persistence.
//
// The office bearer token is kept in browser localStorage so a page refresh, a new tab, or a
// bookmarked deep link does not throw the user back to the sign-in screen. Storage only
// remembers the token; whether it is still valid is always the server's call (absolute
// session expiry, admin revocation, and login throttling all live in the API).

const officeSessionStorageKey = 'bellfield.office.session';
const officeServerUrlStorageKey = 'bellfield.office.serverUrl';

export type StoredOfficeSession = {
  sessionToken: string;
  apiBaseUrl: string;
};

function getLocalStorage(): Storage | null {
  try {
    if (typeof window === 'undefined') {
      return null;
    }

    return window.localStorage;
  } catch {
    // Browsers can refuse storage access (privacy modes, disabled site data). Treat that as
    // "nothing remembered" rather than breaking sign-in.
    return null;
  }
}

export function readStoredOfficeSession(): StoredOfficeSession | null {
  const storage = getLocalStorage();

  if (!storage) {
    return null;
  }

  try {
    const rawSession = storage.getItem(officeSessionStorageKey);

    if (!rawSession) {
      return null;
    }

    const parsedSession = JSON.parse(rawSession) as Partial<StoredOfficeSession> | null;

    if (
      !parsedSession ||
      typeof parsedSession.sessionToken !== 'string' ||
      parsedSession.sessionToken.length === 0 ||
      typeof parsedSession.apiBaseUrl !== 'string'
    ) {
      return null;
    }

    return {
      sessionToken: parsedSession.sessionToken,
      apiBaseUrl: parsedSession.apiBaseUrl
    };
  } catch {
    return null;
  }
}

export function writeStoredOfficeSession(session: StoredOfficeSession): void {
  const storage = getLocalStorage();

  if (!storage) {
    return;
  }

  try {
    storage.setItem(officeSessionStorageKey, JSON.stringify(session));
    storage.setItem(officeServerUrlStorageKey, session.apiBaseUrl);
  } catch {
    // A quota or access error only means this sign-in will not survive a refresh.
  }
}

/** Forgets the session token but keeps the remembered server address for the next sign-in. */
export function clearStoredOfficeSession(): void {
  const storage = getLocalStorage();

  if (!storage) {
    return;
  }

  try {
    storage.removeItem(officeSessionStorageKey);
  } catch {
    // Nothing to clean up if storage is unavailable.
  }
}

export function readStoredOfficeServerUrl(): string | null {
  const storage = getLocalStorage();

  if (!storage) {
    return null;
  }

  try {
    return storage.getItem(officeServerUrlStorageKey);
  } catch {
    return null;
  }
}
