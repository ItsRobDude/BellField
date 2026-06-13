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
  'common.and': 'and',
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
    'Use your field account to view assigned work and sync completed updates.',
  'fieldWorkspace.actions.cancel': 'Cancel',
  'fieldWorkspace.actions.collapse': 'Collapse',
  'fieldWorkspace.actions.discardLocalChange': 'Discard local change',
  'fieldWorkspace.actions.refreshJobs': 'Refresh jobs',
  'fieldWorkspace.actions.refreshing': 'Refreshing...',
  'fieldWorkspace.actions.retryOnNextSync': 'Retry on next sync',
  'fieldWorkspace.actions.signOut': 'Sign out',
  'fieldWorkspace.actions.syncNow': 'Sync Now',
  'fieldWorkspace.billTo': 'Bill to',
  'fieldWorkspace.detailTabs.appointments': 'Appointments',
  'fieldWorkspace.detailTabs.equipment': 'Equipment',
  'fieldWorkspace.detailTabs.overview': 'Overview',
  'fieldWorkspace.detailTabs.register': 'Register',
  'fieldWorkspace.detailTabs.sync': 'Sync',
  'fieldWorkspace.deviceAccessEnded':
    'Device access ended. BellField cleared local field data from this device. Sign in again if access has been restored.',
  'fieldWorkspace.loadingStorage': 'Preparing BellField field storage...',
  'fieldWorkspace.messagesUnavailableBody':
    'Team messaging is not available in this version yet. Job notes and office changes still appear inside the assigned work and sync areas.',
  'fieldWorkspace.messagesUnavailableTitle': 'Messages',
  'fieldWorkspace.noAssignedJobsBody':
    'Assigned work for today and tomorrow will appear here after the next refresh.',
  'fieldWorkspace.noAssignedJobsTitle': 'No assigned jobs',
  'fieldWorkspace.officeChangedTitle': 'Office changed this work',
  'fieldWorkspace.openDetails': 'Open details',
  'fieldWorkspace.pendingQueueEmpty': 'No local changes waiting for sync.',
  'fieldWorkspace.pendingQueueTitle': 'Pending queue',
  'fieldWorkspace.productIntro':
    'Review assigned work, save updates on this device, and sync them back to the office.',
  'fieldWorkspace.settingsUnavailableBody':
    'Field app settings are not available in this version yet. Use Sign out above if this device needs to leave the current technician session.',
  'fieldWorkspace.settingsUnavailableTitle': 'Settings',
  'fieldWorkspace.signOutUnsyncedBody':
    'This device still has BellField field changes stored locally that have not fully synced. Sign out anyway?',
  'fieldWorkspace.signOutUnsyncedTitle': 'Unsynced work',
  'fieldWorkspace.syncBackgroundHealthy':
    'Background sync is healthy. Saved field edits will sync back to the office.',
  'fieldWorkspace.syncChangeWaitingPlural': 'changes waiting to sync',
  'fieldWorkspace.syncChangeWaitingSingular': 'change waiting to sync',
  'fieldWorkspace.syncConflictPlural': 'conflicts',
  'fieldWorkspace.syncConflictSingular': 'conflict',
  'fieldWorkspace.syncFailedHeadline': 'Sync failed - work is queued locally',
  'fieldWorkspace.syncLastSync': 'Last sync',
  'fieldWorkspace.syncLastSuccessful': 'Last successful sync',
  'fieldWorkspace.syncNeedsServerProtection':
    'BellField needs at least one successful sync before field work is protected on the server.',
  'fieldWorkspace.syncNeedsReviewPlural': 'need office review',
  'fieldWorkspace.syncNeedsReviewSingular': 'needs office review',
  'fieldWorkspace.syncNotSyncedYet': 'Not synced yet',
  'fieldWorkspace.syncQueued': 'queued',
  'fieldWorkspace.syncQueuedJobEmpty': 'No local changes waiting for this job.',
  'fieldWorkspace.syncQueuedJobTitle': 'Queued work for this job',
  'fieldWorkspace.syncRejectedItemPlural': 'rejected items',
  'fieldWorkspace.syncRejectedItemSingular': 'rejected item',
  'fieldWorkspace.syncStatusAccessibility': 'Sync status',
  'fieldWorkspace.syncSynced': 'Synced',
  'fieldWorkspace.syncWorkWindow': 'Work window',
  'fieldWorkspace.tabJobs': 'Jobs',
  'fieldWorkspace.tabMessages': 'Messages',
  'fieldWorkspace.tabSettings': 'Settings',
  'fieldWorkspace.tabSync': 'Sync',
  'fieldWorkspace.todayAndTomorrow': 'Today and tomorrow',
  'fieldWorkspace.unableToLoadStorage': 'Unable to load BellField field storage.',
  'fieldWorkspace.unableToRefresh': 'Unable to refresh assigned work.'
} as const;

export type BellFieldMessageKey = keyof typeof englishMessages;

type BellFieldMessageCatalog = Record<BellFieldMessageKey, string>;

const spanishMessages = {
  'common.email': 'Correo electrónico',
  'common.and': 'y',
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
    'Usa tu cuenta de campo para ver el trabajo asignado y sincronizar actualizaciones completadas.',
  'fieldWorkspace.actions.cancel': 'Cancelar',
  'fieldWorkspace.actions.collapse': 'Contraer',
  'fieldWorkspace.actions.discardLocalChange': 'Descartar cambio local',
  'fieldWorkspace.actions.refreshJobs': 'Actualizar trabajos',
  'fieldWorkspace.actions.refreshing': 'Actualizando...',
  'fieldWorkspace.actions.retryOnNextSync': 'Reintentar en la próxima sincronización',
  'fieldWorkspace.actions.signOut': 'Cerrar sesión',
  'fieldWorkspace.actions.syncNow': 'Sincronizar ahora',
  'fieldWorkspace.billTo': 'Facturar a',
  'fieldWorkspace.detailTabs.appointments': 'Citas',
  'fieldWorkspace.detailTabs.equipment': 'Equipo',
  'fieldWorkspace.detailTabs.overview': 'Resumen',
  'fieldWorkspace.detailTabs.register': 'Registro',
  'fieldWorkspace.detailTabs.sync': 'Sincronización',
  'fieldWorkspace.deviceAccessEnded':
    'El acceso del dispositivo terminó. BellField borró los datos locales de campo de este dispositivo. Inicia sesión otra vez si el acceso fue restaurado.',
  'fieldWorkspace.loadingStorage': 'Preparando el almacenamiento de campo de BellField...',
  'fieldWorkspace.messagesUnavailableBody':
    'La mensajería del equipo todavía no está disponible en esta versión. Las notas del trabajo y los cambios de oficina siguen apareciendo dentro del trabajo asignado y las áreas de sincronización.',
  'fieldWorkspace.messagesUnavailableTitle': 'Mensajes',
  'fieldWorkspace.noAssignedJobsBody':
    'El trabajo asignado para hoy y mañana aparecerá aquí después de la próxima actualización.',
  'fieldWorkspace.noAssignedJobsTitle': 'No hay trabajos asignados',
  'fieldWorkspace.officeChangedTitle': 'La oficina cambió este trabajo',
  'fieldWorkspace.openDetails': 'Abrir detalles',
  'fieldWorkspace.pendingQueueEmpty': 'No hay cambios locales esperando sincronización.',
  'fieldWorkspace.pendingQueueTitle': 'Cola pendiente',
  'fieldWorkspace.productIntro':
    'Revisa el trabajo asignado, guarda actualizaciones en este dispositivo y sincronízalas con la oficina.',
  'fieldWorkspace.settingsUnavailableBody':
    'La configuración de la app de campo todavía no está disponible en esta versión. Usa Cerrar sesión arriba si este dispositivo debe salir de la sesión actual del técnico.',
  'fieldWorkspace.settingsUnavailableTitle': 'Configuración',
  'fieldWorkspace.signOutUnsyncedBody':
    'Este dispositivo todavía tiene cambios de campo guardados localmente que no se han sincronizado por completo. ¿Cerrar sesión de todos modos?',
  'fieldWorkspace.signOutUnsyncedTitle': 'Trabajo sin sincronizar',
  'fieldWorkspace.syncBackgroundHealthy':
    'La sincronización en segundo plano está saludable. Las ediciones de campo guardadas se sincronizarán con la oficina.',
  'fieldWorkspace.syncChangeWaitingPlural': 'cambios esperando sincronización',
  'fieldWorkspace.syncChangeWaitingSingular': 'cambio esperando sincronización',
  'fieldWorkspace.syncConflictPlural': 'conflictos',
  'fieldWorkspace.syncConflictSingular': 'conflicto',
  'fieldWorkspace.syncFailedHeadline':
    'La sincronización falló - el trabajo está en cola localmente',
  'fieldWorkspace.syncLastSync': 'Última sincronización',
  'fieldWorkspace.syncLastSuccessful': 'Última sincronización correcta',
  'fieldWorkspace.syncNeedsServerProtection':
    'BellField necesita al menos una sincronización correcta antes de que el trabajo de campo esté protegido en el servidor.',
  'fieldWorkspace.syncNeedsReviewPlural': 'requieren revisión de oficina',
  'fieldWorkspace.syncNeedsReviewSingular': 'requiere revisión de oficina',
  'fieldWorkspace.syncNotSyncedYet': 'Aún no sincronizado',
  'fieldWorkspace.syncQueued': 'en cola',
  'fieldWorkspace.syncQueuedJobEmpty': 'No hay cambios locales esperando para este trabajo.',
  'fieldWorkspace.syncQueuedJobTitle': 'Trabajo en cola para este trabajo',
  'fieldWorkspace.syncRejectedItemPlural': 'elementos rechazados',
  'fieldWorkspace.syncRejectedItemSingular': 'elemento rechazado',
  'fieldWorkspace.syncStatusAccessibility': 'Estado de sincronización',
  'fieldWorkspace.syncSynced': 'Sincronizado',
  'fieldWorkspace.syncWorkWindow': 'Ventana de trabajo',
  'fieldWorkspace.tabJobs': 'Trabajos',
  'fieldWorkspace.tabMessages': 'Mensajes',
  'fieldWorkspace.tabSettings': 'Configuración',
  'fieldWorkspace.tabSync': 'Sincronización',
  'fieldWorkspace.todayAndTomorrow': 'Hoy y mañana',
  'fieldWorkspace.unableToLoadStorage':
    'No se pudo cargar el almacenamiento de campo de BellField.',
  'fieldWorkspace.unableToRefresh': 'No se pudo actualizar el trabajo asignado.'
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
