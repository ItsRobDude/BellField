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
}
