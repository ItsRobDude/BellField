import type {
  RelayPaymentSetupLinkResponse,
  RelayPaymentSetupStatus,
  RelayPaymentSetupStatusResponse
} from './relay-delivery.js';

export interface CompanySettings {
  companyName: string;
  replyToEmail?: string;
  estimateEmailSubject: string;
  estimateEmailBody: string;
  invoiceEmailSubject: string;
  invoiceEmailBody: string;
  /** Days a customer acceptance link stays usable; bounded by relayAcceptanceExpiryDays. */
  acceptanceLinkExpiryDays: number;
  chargesSalesTax: boolean;
  defaultSalesTaxBasisPoints: number;
  /** When true, invoice emails embed an online pay-now link for posted main invoices with a balance. */
  includeInvoicePaymentLink: boolean;
  /** When true, a customer receipt email is sent whenever a payment or deposit is recorded. */
  sendPaymentReceipts: boolean;
  /** Receipt email subject template ({companyName} etc.). */
  paymentReceiptEmailSubject: string;
  /** Receipt email body template ({customerName}, {amount}, {method}, {date}, {jobNumber}, {receiptKind}). */
  paymentReceiptEmailBody: string;
  /** When true, a customer receipt email is sent whenever a refund is recorded. */
  sendRefundReceipts: boolean;
  /** Refund receipt subject template ({companyName} etc.). */
  refundReceiptEmailSubject: string;
  /** Refund receipt body template ({customerName}, {amount}, {date}, {jobNumber}). No method token — a manual refund has no refund-method field. */
  refundReceiptEmailBody: string;
  updatedAt?: string;
  updatedByName?: string;
}

export interface CompanySettingsResponse {
  settings: CompanySettings;
}

export interface UpdateCompanySettingsRequest {
  companyName: string;
  replyToEmail?: string;
  estimateEmailSubject: string;
  estimateEmailBody: string;
  invoiceEmailSubject: string;
  invoiceEmailBody: string;
  acceptanceLinkExpiryDays: number;
  chargesSalesTax: boolean;
  defaultSalesTaxBasisPoints: number;
  includeInvoicePaymentLink: boolean;
  sendPaymentReceipts: boolean;
  paymentReceiptEmailSubject: string;
  paymentReceiptEmailBody: string;
  sendRefundReceipts: boolean;
  refundReceiptEmailSubject: string;
  refundReceiptEmailBody: string;
}

export type OnlinePaymentsSetupStatus = RelayPaymentSetupStatus;

export type OnlinePaymentsSetupStatusResponse = RelayPaymentSetupStatusResponse;

export type OnlinePaymentsSetupLinkResponse = RelayPaymentSetupLinkResponse;
