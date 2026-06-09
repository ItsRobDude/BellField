import type { CompanySettingsDto } from './company-settings.types';

export const defaultCompanySettings: CompanySettingsDto = {
  companyName: 'BellField',
  estimateEmailSubject: 'Estimate from {companyName}',
  estimateEmailBody:
    'Hello,\n\nAttached is your estimate from {companyName}.\n\nPlease reply to this email with any questions.\n\nThank you.'
};
