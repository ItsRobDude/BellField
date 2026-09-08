import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { FormField } from './form-field';

describe('FormField', () => {
  it('labels the control it wraps so it can be found by its visible name', () => {
    render(
      <FormField label="Customer name" hint="As it should appear on invoices">
        <input value="" onChange={() => {}} />
      </FormField>
    );

    expect(screen.getByLabelText('Customer name')).toBeInstanceOf(HTMLInputElement);
    expect(screen.getByText('As it should appear on invoices')).toBeInTheDocument();
  });

  it('announces an inline error under the control', () => {
    render(
      <FormField label="Email" error="Enter an email address.">
        <input value="" onChange={() => {}} />
      </FormField>
    );

    expect(screen.getByRole('alert')).toHaveTextContent('Enter an email address.');
    expect(screen.getByLabelText('Email')).toBeInTheDocument();
  });

  it('works with selects and textareas too', () => {
    render(
      <>
        <FormField label="Status">
          <select value="active" onChange={() => {}}>
            <option value="active">Active</option>
          </select>
        </FormField>
        <FormField label="Notes">
          <textarea value="" onChange={() => {}} />
        </FormField>
      </>
    );

    expect(screen.getByLabelText('Status')).toBeInstanceOf(HTMLSelectElement);
    expect(screen.getByLabelText('Notes')).toBeInstanceOf(HTMLTextAreaElement);
  });
});
