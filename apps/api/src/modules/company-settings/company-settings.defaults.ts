import type { CompanySettingsDto } from './company-settings.types';

export const defaultCompanySettings: Omit<CompanySettingsDto, 'emailProvider'> = {
  companyName: 'BellField',
  customerFacingSenderName: 'BellField Estimates',
  customerFacingFromEmail: 'estimates@bellfield.app',
  estimateEmailSubject: 'Estimate from {companyName}',
  estimateEmailBody:
    'Hello,\n\nAttached is your estimate from {companyName}.\n\nPlease reply to this email with any questions.\n\nThank you.'
};
