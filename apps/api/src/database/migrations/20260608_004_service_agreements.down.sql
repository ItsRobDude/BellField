drop index if exists service_agreement_visit_templates_agreement_idx;
drop table if exists service_agreement_visit_templates;

drop index if exists service_agreement_covered_equipment_equipment_idx;
drop table if exists service_agreement_covered_equipment;

drop index if exists service_agreement_covered_locations_location_idx;
drop table if exists service_agreement_covered_locations;

drop index if exists service_agreements_next_billing_idx;
drop index if exists service_agreements_renewal_idx;
drop index if exists service_agreements_status_idx;
drop index if exists service_agreements_customer_idx;
drop table if exists service_agreements;

drop sequence if exists service_agreement_number_sequence;
