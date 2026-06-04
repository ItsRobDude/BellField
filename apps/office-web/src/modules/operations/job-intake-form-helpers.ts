import type { CustomerFormState, LocationFormState } from './crm-panel-types';

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

export function splitCommaValues(value: string): string[] {
  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

export function optionalString(value: string): string | undefined {
  return value.trim() ? value.trim() : undefined;
}
