alter table company_settings
  add column invoice_email_subject text not null default 'Invoice {jobNumber} from {companyName}',
  add column invoice_email_body text not null default 'Hello {customerName}, attached is your {invoiceLabelLower} for job {jobNumber}.';
