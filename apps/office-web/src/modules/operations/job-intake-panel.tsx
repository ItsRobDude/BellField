'use client';

import type { JobsWorkspaceResponse } from '@/lib/operations-api';
import { officeWorkspaceStyles as styles } from './office-workspace-styles';

type JobIntakePanelProps = {
  jobsWorkspace: JobsWorkspaceResponse;
  jobLocationId: string;
  jobBillToCustomerId: string;
  jobType: string;
  jobCategory: string;
  jobOrigin: string;
  jobSummary: string;
  jobTechnicianId: string;
  jobDate: string;
  jobStartTime: string;
  jobEndTime: string;
  jobWindow: string;
  onJobLocationChange: (locationId: string) => void;
  onJobBillToCustomerChange: (customerId: string) => void;
  onJobTypeChange: (value: string) => void;
  onJobCategoryChange: (value: string) => void;
  onJobOriginChange: (value: string) => void;
  onJobSummaryChange: (value: string) => void;
  onJobTechnicianChange: (value: string) => void;
  onJobDateChange: (value: string) => void;
  onJobStartTimeChange: (value: string) => void;
  onJobEndTimeChange: (value: string) => void;
  onJobWindowChange: (value: string) => void;
  onCreateJob: () => Promise<void>;
  onClose: () => void;
};

export function JobIntakePanel({
  jobsWorkspace,
  jobLocationId,
  jobBillToCustomerId,
  jobType,
  jobCategory,
  jobOrigin,
  jobSummary,
  jobTechnicianId,
  jobDate,
  jobStartTime,
  jobEndTime,
  jobWindow,
  onJobLocationChange,
  onJobBillToCustomerChange,
  onJobTypeChange,
  onJobCategoryChange,
  onJobOriginChange,
  onJobSummaryChange,
  onJobTechnicianChange,
  onJobDateChange,
  onJobStartTimeChange,
  onJobEndTimeChange,
  onJobWindowChange,
  onCreateJob,
  onClose
}: JobIntakePanelProps) {
  const selectedLocation = jobsWorkspace.locations.find((location) => location.id === jobLocationId) ?? null;
  const billToCustomerIds = selectedLocation
    ? [selectedLocation.customerId, ...selectedLocation.alternateBillToCustomerIds]
    : [];

  return (
    <section aria-label="New job" style={styles.workspacePanel}>
      <div style={styles.row}>
        <h1 style={styles.compactTitle}>New job</h1>
        <button type="button" style={styles.button} onClick={onClose}>
          Close
        </button>
      </div>
      <div style={styles.formGridCompact}>
        <label style={styles.fieldLabel}>
          <span>Location</span>
          <select value={jobLocationId} onChange={(event) => onJobLocationChange(event.target.value)} style={styles.input}>
            {jobsWorkspace.locations.map((location) => (
              <option key={location.id} value={location.id}>
                {location.name}
              </option>
            ))}
          </select>
        </label>
        <label style={styles.fieldLabel}>
          <span>Bill to</span>
          <select
            value={jobBillToCustomerId}
            onChange={(event) => onJobBillToCustomerChange(event.target.value)}
            style={styles.input}
          >
            {billToCustomerIds.map((customerId) => {
              const customer = jobsWorkspace.customers.find((candidate) => candidate.id === customerId);
              return customer ? (
                <option key={customer.id} value={customer.id}>
                  {customer.name}
                </option>
              ) : null;
            })}
          </select>
        </label>
        <TextField label="Type" value={jobType} onChange={onJobTypeChange} />
        <TextField label="Category" value={jobCategory} onChange={onJobCategoryChange} />
        <TextField label="Origin" value={jobOrigin} onChange={onJobOriginChange} />
        <TextField label="Summary" value={jobSummary} onChange={onJobSummaryChange} />
        <TextField label="Date" type="date" value={jobDate} onChange={onJobDateChange} />
        <TextField
          label="Start"
          type="time"
          value={jobStartTime}
          disabled={!jobDate}
          onChange={onJobStartTimeChange}
        />
        <TextField label="End" type="time" value={jobEndTime} disabled={!jobDate} onChange={onJobEndTimeChange} />
        <TextField label="Window" value={jobWindow} onChange={onJobWindowChange} />
        <label style={styles.fieldLabel}>
          <span>Tech</span>
          <select
            value={jobTechnicianId}
            onChange={(event) => onJobTechnicianChange(event.target.value)}
            style={styles.input}
          >
            <option value="">Unassigned</option>
            {jobsWorkspace.technicians.map((technician) => (
              <option key={technician.id} value={technician.id}>
                {technician.displayName}
              </option>
            ))}
          </select>
        </label>
      </div>
      <button type="button" style={styles.primaryButton} onClick={() => void onCreateJob()}>
        Create job
      </button>
    </section>
  );
}

function TextField({
  label,
  value,
  type = 'text',
  disabled = false,
  onChange
}: {
  label: string;
  value: string;
  type?: string;
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <label style={styles.fieldLabel}>
      <span>{label}</span>
      <input
        aria-label={`Job ${label.toLowerCase()}`}
        value={value}
        type={type}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        style={styles.input}
      />
    </label>
  );
}
