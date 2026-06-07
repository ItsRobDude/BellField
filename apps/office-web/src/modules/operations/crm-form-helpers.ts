import type { ContactLink, DuplicateCandidate } from '@/lib/operations-api';
import { searchOfficeCrm } from '@/lib/operations-api';
import type {
  ContactFormState,
  ContactLinkDraft,
  CustomerFormState,
  LocationFormState
} from './crm-panel-types';

export function createEmptyCustomerForm(): CustomerFormState {
  return {
    name: '',
    accountType: 'residential',
    billingAddressLine1: '',
    billingCity: '',
    billingState: '',
    billingPostalCode: '',
    phone: '',
    email: '',
    fax: '',
    flags: ''
  };
}

export function createEmptyLocationForm(customerId = ''): LocationFormState {
  return {
    customerId,
    name: '',
    addressLine1: '',
    city: '',
    state: '',
    postalCode: '',
    phone: '',
    email: '',
    fax: '',
    alternateBillToCustomerIds: []
  };
}

export function createEmptyContactForm(): ContactFormState {
  return {
    displayName: '',
    phone: '',
    email: '',
    fax: '',
    tags: ''
  };
}

export function locationNeedsPhoneEmailConfirmation(
  phone: string | undefined,
  email: string | undefined
): boolean {
  return !phone?.trim() && !email?.trim();
}

export function splitCommaValues(value: string): string[] {
  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

export function createContactLinkDrafts(links: ContactLink[]): Record<string, ContactLinkDraft> {
  return Object.fromEntries(
    links.map((link) => [
      link.id,
      {
        phone: link.phone ?? '',
        email: link.email ?? '',
        fax: link.fax ?? '',
        tags: link.tags.join(', '),
        scope: 'link' as const
      }
    ])
  );
}

export async function collectCrmDuplicateWarnings(input: {
  apiBaseUrl: string;
  kind: 'customer' | 'location';
  query: string;
  sessionToken: string;
}): Promise<DuplicateCandidate[]> {
  if (!input.query.trim()) {
    return [];
  }

  const response = await searchOfficeCrm({
    sessionToken: input.sessionToken,
    apiBaseUrl: input.apiBaseUrl,
    query: input.query
  });

  return response.results
    .filter((result) => result.kind === input.kind)
    .map((result) => ({
      id: result.id,
      kind: input.kind,
      title: result.title,
      subtitle: result.subtitle,
      matchReasons: ['Likely duplicate based on search'],
      isActive: result.isActive,
      hasDoNotServiceFlag: result.badges.includes('DNU')
    }));
}
