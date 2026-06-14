import type { CompanySettingsDto } from './company-settings.types';

export const defaultCompanySettings: CompanySettingsDto = {
  companyName: 'BellField',
  estimateEmailSubject: 'Estimate from {companyName}',
  estimateEmailBody:
    'Hello,\n\nAttached is your estimate from {companyName}.\n\nPlease reply to this email with any questions.\n\nThank you.',
  invoiceEmailSubject: 'Invoice {jobNumber} from {companyName}',
  invoiceEmailBody:
    'Hello {customerName}, attached is your {invoiceLabelLower} for job {jobNumber}.',
  acceptanceLinkExpiryDays: 30,
  chargesSalesTax: false,
  defaultSalesTaxBasisPoints: 0,
  includeInvoicePaymentLink: false
};
