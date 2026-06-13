export const supportedBellFieldLocales = ['en', 'es'] as const;

export type BellFieldLocale = (typeof supportedBellFieldLocales)[number];

export const defaultBellFieldLocale: BellFieldLocale = 'en';

export type BellFieldLocaleInput =
  | string
  | readonly (string | null | undefined)[]
  | null
  | undefined;

const englishMessages = {
  'common.email': 'Email',
  'common.languageLabel': 'Language',
  'common.locale.english': 'English',
  'common.locale.spanish': 'Spanish',
  'common.password': 'Password',
  'common.serverUrl': 'Server URL',
  'common.signIn': 'Sign in',
  'common.signingIn': 'Signing in...',
  'common.unableToSignIn': 'Unable to sign in.',
  'common.demoAccounts': 'Demo accounts',
  'officeAuth.createOwner': 'Create owner',
  'officeAuth.createOwnerAccount': 'Create owner account',
  'officeAuth.creatingOwner': 'Creating owner...',
  'officeAuth.displayName': 'Display name',
  'officeAuth.productName': 'BellField Office',
  'officeAuth.serverSetupStatus': 'Checking server setup status...',
  'officeAuth.serverUrlHelp': 'Enter the BellField API address for this office server.',
  'officeAuth.setupToken': 'Setup token',
  'officeAuth.signInIntro': 'Use your office account to manage dispatch, jobs, and customers.',
  'officeAuth.startOwnerIntro': 'Start BellField with the first active owner account.',
  'officeAuth.unableToCreateOwner': 'Unable to create the owner account.',
  'fieldAuth.productName': 'BellField Field',
  'fieldAuth.serverUrlHelp': 'Enter the BellField API address for this office server.',
  'fieldAuth.showPassword': 'Show password',
  'fieldAuth.signInIntro':
    'Use your field account to view assigned work and sync completed updates.'
} as const;

export type BellFieldMessageKey = keyof typeof englishMessages;

type BellFieldMessageCatalog = Record<BellFieldMessageKey, string>;

const spanishMessages = {
  'common.email': 'Correo electrónico',
  'common.languageLabel': 'Idioma',
  'common.locale.english': 'Inglés',
  'common.locale.spanish': 'Español',
  'common.password': 'Contraseña',
  'common.serverUrl': 'URL del servidor',
  'common.signIn': 'Iniciar sesión',
  'common.signingIn': 'Iniciando sesión...',
  'common.unableToSignIn': 'No se pudo iniciar sesión.',
  'common.demoAccounts': 'Cuentas de demostración',
  'officeAuth.createOwner': 'Crear propietario',
  'officeAuth.createOwnerAccount': 'Crear cuenta de propietario',
  'officeAuth.creatingOwner': 'Creando propietario...',
  'officeAuth.displayName': 'Nombre visible',
  'officeAuth.productName': 'BellField Office',
  'officeAuth.serverSetupStatus': 'Revisando el estado de configuración del servidor...',
  'officeAuth.serverUrlHelp':
    'Ingresa la dirección de la API de BellField para este servidor de oficina.',
  'officeAuth.setupToken': 'Token de configuración',
  'officeAuth.signInIntro':
    'Usa tu cuenta de oficina para administrar despacho, trabajos y clientes.',
  'officeAuth.startOwnerIntro': 'Inicia BellField con la primera cuenta activa de propietario.',
  'officeAuth.unableToCreateOwner': 'No se pudo crear la cuenta de propietario.',
  'fieldAuth.productName': 'BellField Field',
  'fieldAuth.serverUrlHelp':
    'Ingresa la dirección de la API de BellField para este servidor de oficina.',
  'fieldAuth.showPassword': 'Mostrar contraseña',
  'fieldAuth.signInIntro':
    'Usa tu cuenta de campo para ver el trabajo asignado y sincronizar actualizaciones completadas.'
} satisfies BellFieldMessageCatalog;

export const bellFieldMessageCatalogs = {
  en: englishMessages,
  es: spanishMessages
} satisfies Record<BellFieldLocale, BellFieldMessageCatalog>;

const localeLabelKeys = {
  en: 'common.locale.english',
  es: 'common.locale.spanish'
} satisfies Record<BellFieldLocale, BellFieldMessageKey>;

export type BellFieldTranslator = (key: BellFieldMessageKey) => string;

export function isBellFieldLocale(value: string): value is BellFieldLocale {
  return supportedBellFieldLocales.includes(value as BellFieldLocale);
}

export function resolveBellFieldLocale(input: BellFieldLocaleInput): BellFieldLocale {
  const candidates = Array.isArray(input) ? input : [input];

  for (const candidate of candidates) {
    if (!candidate) {
      continue;
    }

    const normalized = candidate.trim().toLowerCase();
    if (isBellFieldLocale(normalized)) {
      return normalized;
    }

    const [language] = normalized.split('-');
    if (language && isBellFieldLocale(language)) {
      return language;
    }
  }

  return defaultBellFieldLocale;
}

export function translateBellField(
  localeInput: BellFieldLocaleInput,
  key: BellFieldMessageKey
): string {
  const locale = resolveBellFieldLocale(localeInput);
  return bellFieldMessageCatalogs[locale][key];
}

export function createBellFieldTranslator(localeInput: BellFieldLocaleInput): BellFieldTranslator {
  const locale = resolveBellFieldLocale(localeInput);

  return (key) => bellFieldMessageCatalogs[locale][key];
}

export function getBellFieldLocaleLabel(
  locale: BellFieldLocale,
  displayLocaleInput: BellFieldLocaleInput = defaultBellFieldLocale
): string {
  return translateBellField(displayLocaleInput, localeLabelKeys[locale]);
}
