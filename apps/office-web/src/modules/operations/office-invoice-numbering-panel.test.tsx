import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { maxInvoiceNumber } from '@bellfield/contracts';
import * as settingsApi from '@/lib/operations-company-settings-api';
import { OfficeInvoiceNumberingPanel } from './office-invoice-numbering-panel';

vi.mock('@/lib/operations-company-settings-api', () => ({
  getOfficeInvoiceNumbering: vi.fn(),
  updateOfficeInvoiceNumbering: vi.fn()
}));

const mockedApi = vi.mocked(settingsApi);

function renderPanel(canConfigure = true) {
  render(
    <OfficeInvoiceNumberingPanel
      apiBaseUrl="http://api.test"
      sessionToken="session-token"
      canConfigure={canConfigure}
    />
  );
}

beforeEach(() => {
  mockedApi.getOfficeInvoiceNumbering.mockResolvedValue({ numbering: { nextNumber: 1 } });
  mockedApi.updateOfficeInvoiceNumbering.mockResolvedValue({ numbering: { nextNumber: 5000 } });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('OfficeInvoiceNumberingPanel', () => {
  it('loads the next number and saves a new starting number', async () => {
    renderPanel();
    const input = await screen.findByLabelText<HTMLInputElement>('Next invoice number');
    await waitFor(() => expect(input.value).toBe('1'));

    fireEvent.change(input, { target: { value: '5000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save numbering' }));

    await waitFor(() =>
      expect(mockedApi.updateOfficeInvoiceNumbering).toHaveBeenCalledWith({
        nextNumber: 5000,
        apiBaseUrl: 'http://api.test',
        sessionToken: 'session-token'
      })
    );
    expect(await screen.findByText('Invoice numbering saved.')).toBeInTheDocument();
  });

  it('surfaces the server issued-number guard error without crashing', async () => {
    mockedApi.updateOfficeInvoiceNumbering.mockRejectedValue(
      new Error('The next invoice number must be greater than the highest number already issued.')
    );
    renderPanel();
    const input = await screen.findByLabelText<HTMLInputElement>('Next invoice number');
    await waitFor(() => expect(input.value).toBe('1'));

    fireEvent.change(input, { target: { value: '1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save numbering' }));

    expect(await screen.findByText(/must be greater than the highest number/)).toBeInTheDocument();
  });

  it('rejects out-of-range numbers client-side before calling the API', async () => {
    renderPanel();
    const input = await screen.findByLabelText<HTMLInputElement>('Next invoice number');
    await waitFor(() => expect(input.value).toBe('1'));

    fireEvent.change(input, { target: { value: '0' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save numbering' }));

    expect(await screen.findByText(/whole number from 1 to/)).toBeInTheDocument();
    expect(mockedApi.updateOfficeInvoiceNumbering).not.toHaveBeenCalled();

    fireEvent.change(input, { target: { value: String(maxInvoiceNumber + 1) } });
    fireEvent.click(screen.getByRole('button', { name: 'Save numbering' }));

    expect(await screen.findByText(/whole number from 1 to/)).toBeInTheDocument();
    expect(mockedApi.updateOfficeInvoiceNumbering).not.toHaveBeenCalled();
  });
});
