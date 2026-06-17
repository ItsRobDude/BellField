import type { CompanySettingsDto } from './company-settings.types';

export const defaultCompanySettings: CompanySettingsDto = {
  companyName: 'BellField',
  estimateEmailSubject: 'Estimate from {companyName}',
  estimateEmailBody:
    'Hello,\n\nAttached is your estimate from {companyName}.\n\nPlease reply to this email with any questions.\n\nThank you.',
  invoiceEmailSubject: 'Invoice {invoiceReference} from {companyName}',
  invoiceEmailBody:
    'Hello {customerName}, attached is your {invoiceLabelLower} {invoiceReference}.',
  acceptanceLinkExpiryDays: 30,
  chargesSalesTax: false,
  defaultSalesTaxBasisPoints: 0,
  includeInvoicePaymentLink: false,
  sendPaymentReceipts: true,
  paymentReceiptEmailSubject: 'Receipt from {companyName}',
  paymentReceiptEmailBody:
    'Hello {customerName},\n\nWe received your {receiptKind} of {amount} by {method} on {date} for job {jobNumber}.\n\nThank you,\n{companyName}',
  sendRefundReceipts: true,
  refundReceiptEmailSubject: 'Refund from {companyName}',
  refundReceiptEmailBody:
    'Hello {customerName},\n\nWe issued a refund of {amount} on {date} for job {jobNumber}.\n\nThank you,\n{companyName}'
};
