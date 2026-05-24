import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OfficeAuthShell } from './office-auth-shell';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('OfficeAuthShell', () => {
  it('does not expose demo credentials in production', () => {
    vi.stubEnv('NODE_ENV', 'production');

    render(<OfficeAuthShell />);

    expect(screen.getByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toHaveValue('');
    expect(screen.getByLabelText('Password')).toHaveValue('');
    expect(screen.queryByRole('button', { name: 'Owner: owner@bellfield.local' })).toBeNull();
    expect(screen.queryByDisplayValue('owner@bellfield.local')).toBeNull();
    expect(screen.queryByDisplayValue('bellfield-owner')).toBeNull();
  });

  it('keeps demo shortcuts available outside production', () => {
    vi.stubEnv('NODE_ENV', 'development');

    render(<OfficeAuthShell />);

    expect(screen.getByLabelText('Email')).toHaveValue('owner@bellfield.local');
    expect(screen.getByLabelText('Password')).toHaveValue('bellfield-owner');
    expect(
      screen.getByRole('button', { name: 'Owner: owner@bellfield.local' })
    ).toBeInTheDocument();
  });
});
