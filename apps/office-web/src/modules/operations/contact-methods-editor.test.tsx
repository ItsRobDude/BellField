import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ContactMethodSummary } from '@/lib/operations-api';
import * as operationsApi from '@/lib/operations-api';
import { ContactMethodsEditor } from './contact-methods-editor';

vi.mock('@/lib/operations-api', () => ({
  createOfficeContactContactMethod: vi.fn(),
  createOfficeCustomerContactMethod: vi.fn(),
  createOfficeLocationContactMethod: vi.fn(),
  updateOfficeContactMethod: vi.fn()
}));

const mockedOperations = vi.mocked(operationsApi);

function renderEditor(contactMethods: ContactMethodSummary[] = []) {
  const onSaved = vi.fn();

  render(
    <ContactMethodsEditor
      apiBaseUrl="http://api.test"
      sessionToken="session-token"
      ownerKind="customer"
      ownerId="customer-1"
      contactMethods={contactMethods}
      onSaved={onSaved}
    />
  );

  return { onSaved };
}

describe('ContactMethodsEditor', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockedOperations.createOfficeCustomerContactMethod.mockResolvedValue({
      contactMethod: {
        id: 'method-1',
        ownerKind: 'customer',
        ownerId: 'customer-1',
        kind: 'email',
        label: 'Primary',
        value: 'office@example.com',
        isPrimary: false,
        isActive: true
      }
    });
  });

  it('uses the selected method type for the new value field and submitted payload', async () => {
    const { onSaved } = renderEditor();

    expect(screen.getByLabelText('Phone number')).toHaveAttribute('type', 'tel');
    expect(screen.getByRole('button', { name: 'Add phone' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Email' }));
    const emailInput = screen.getByLabelText('Email address');

    expect(emailInput).toHaveAttribute('type', 'email');
    expect(emailInput).toHaveAttribute('placeholder', 'name@example.com');

    fireEvent.change(emailInput, { target: { value: 'office@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add email' }));

    await waitFor(() => {
      expect(mockedOperations.createOfficeCustomerContactMethod).toHaveBeenCalledWith({
        sessionToken: 'session-token',
        apiBaseUrl: 'http://api.test',
        customerId: 'customer-1',
        kind: 'email',
        label: 'Primary',
        value: 'office@example.com',
        isPrimary: false
      });
    });
    expect(onSaved).toHaveBeenCalled();
  });

  it('blocks invalid email, phone, and fax values before calling the API', () => {
    renderEditor();

    const phoneInput = screen.getByLabelText('Phone number');
    fireEvent.change(phoneInput, { target: { value: '123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add phone' }));
    expect(screen.getByText('Enter a valid phone number.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Email' }));
    fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'not-email' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add email' }));
    expect(screen.getByText('Enter a valid email address.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Fax' }));
    fireEvent.change(screen.getByLabelText('Fax number'), { target: { value: '555' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add fax' }));
    expect(screen.getByText('Enter a valid fax number.')).toBeInTheDocument();

    expect(mockedOperations.createOfficeCustomerContactMethod).not.toHaveBeenCalled();
  });

  it('labels existing method value fields from the saved kind', () => {
    renderEditor([
      {
        id: 'phone-1',
        ownerKind: 'customer',
        ownerId: 'customer-1',
        kind: 'phone',
        label: 'Office',
        value: '360-555-0100',
        isPrimary: true,
        isActive: true
      },
      {
        id: 'email-1',
        ownerKind: 'customer',
        ownerId: 'customer-1',
        kind: 'email',
        label: 'Billing',
        value: 'billing@example.com',
        isPrimary: false,
        isActive: true
      },
      {
        id: 'fax-1',
        ownerKind: 'customer',
        ownerId: 'customer-1',
        kind: 'fax',
        label: 'Fax',
        value: '360-555-0199',
        isPrimary: false,
        isActive: true
      }
    ]);

    expect(screen.getByDisplayValue('360-555-0100')).toHaveAttribute('type', 'tel');
    expect(screen.getByDisplayValue('billing@example.com')).toHaveAttribute('type', 'email');
    expect(screen.getByDisplayValue('360-555-0199')).toHaveAttribute('type', 'tel');
    expect(screen.getByLabelText('Email address')).toHaveDisplayValue('billing@example.com');
    expect(screen.getByLabelText('Fax number')).toHaveDisplayValue('360-555-0199');
  });
});
