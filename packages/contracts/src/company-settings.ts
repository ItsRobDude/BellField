export interface CompanySettings {
  companyName: string;
  replyToEmail?: string;
  estimateEmailSubject: string;
  estimateEmailBody: string;
  /** Days a customer acceptance link stays usable; bounded by relayAcceptanceExpiryDays. */
  acceptanceLinkExpiryDays: number;
  chargesSalesTax: boolean;
  defaultSalesTaxBasisPoints: number;
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
  acceptanceLinkExpiryDays: number;
  chargesSalesTax: boolean;
  defaultSalesTaxBasisPoints: number;
}
