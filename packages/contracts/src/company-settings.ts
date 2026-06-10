export interface CompanySettings {
  companyName: string;
  replyToEmail?: string;
  estimateEmailSubject: string;
  estimateEmailBody: string;
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
  chargesSalesTax: boolean;
  defaultSalesTaxBasisPoints: number;
}
