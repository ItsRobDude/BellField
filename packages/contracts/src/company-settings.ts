export interface CompanySettings {
  companyName: string;
  replyToEmail?: string;
  estimateEmailSubject: string;
  estimateEmailBody: string;
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
}
