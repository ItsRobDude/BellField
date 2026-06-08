'use client';

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  activateOfficeServiceAgreement,
  createOfficeServiceAgreement,
  endOfficeServiceAgreement,
  getOfficeEquipmentWorkspace,
  getOfficeJobsWorkspace,
  listOfficeServiceAgreements,
  pauseOfficeServiceAgreement,
  updateOfficeServiceAgreement,
  type ServiceAgreementStatus,
  type ServiceAgreementSummary
} from '@/lib/operations-api';
import { formatCurrency } from './job-invoice-shared';
import {
  AgreementForm,
  billingCadenceLabels,
  draftFromAgreement,
  emptyAgreementDraft,
  toCreateRequest,
  toUpdateRequest,
  type ActiveAgreementForm,
  type AgreementWorkbenchSources,
  visitFrequencyLabels
} from './office-workspace-agreements-forms';
import { officeWorkspaceStyles as styles } from './office-workspace-styles';

export type OfficeAgreementsSurfaceProps = {
  apiBaseUrl: string;
  sessionToken: string;
  canCreate: boolean;
  canEdit: boolean;
};

const statusLabels: Record<ServiceAgreementStatus, string> = {
  draft: 'Draft',
  active: 'Active',
  paused: 'Paused',
  ended: 'Ended'
};

export function OfficeAgreementsSurface({
  apiBaseUrl,
  sessionToken,
  canCreate,
  canEdit
}: OfficeAgreementsSurfaceProps) {
  const [agreements, setAgreements] = useState<ServiceAgreementSummary[]>([]);
  const [sources, setSources] = useState<AgreementWorkbenchSources | null>(null);
  const [selectedAgreementId, setSelectedAgreementId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<ServiceAgreementStatus | 'all'>('all');
  const [searchText, setSearchText] = useState('');
  const [hasLoaded, setHasLoaded] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [noticeMessage, setNoticeMessage] = useState<string | null>(null);
  const [activeForm, setActiveForm] = useState<ActiveAgreementForm | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const [agreementResult, jobsWorkspace, equipmentWorkspace] = await Promise.all([
        listOfficeServiceAgreements({
          apiBaseUrl,
          sessionToken,
          status: statusFilter === 'all' ? undefined : statusFilter
        }),
        getOfficeJobsWorkspace({ apiBaseUrl, sessionToken }),
        getOfficeEquipmentWorkspace({ apiBaseUrl, sessionToken, includeInactive: true })
      ]);
      setAgreements(agreementResult.agreements);
      setSources({
        customers: jobsWorkspace.customers,
        locations: jobsWorkspace.locations,
        equipment: equipmentWorkspace.equipment
      });
      setHasLoaded(true);
      setSelectedAgreementId((current) => {
        if (current && agreementResult.agreements.some((agreement) => agreement.id === current)) {
          return current;
        }
        return agreementResult.agreements[0]?.id ?? null;
      });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to load agreements.');
    } finally {
      setIsLoading(false);
    }
  }, [apiBaseUrl, sessionToken, statusFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  const visibleAgreements = useMemo(() => {
    const search = searchText.trim().toLocaleLowerCase();
    return agreements.filter((agreement) => {
      if (!search) {
        return true;
      }
      return [
        agreement.agreementNumber,
        agreement.name,
        agreement.customerName,
        agreement.description,
        ...agreement.coveredLocations.map((location) => location.locationName),
        ...agreement.coveredEquipment.map((equipment) => equipment.equipmentLabel)
      ]
        .filter(Boolean)
        .some((value) => value!.toLocaleLowerCase().includes(search));
    });
  }, [agreements, searchText]);

  const selectedAgreement = useMemo(
    () => agreements.find((agreement) => agreement.id === selectedAgreementId) ?? null,
    [agreements, selectedAgreementId]
  );

  function startCreate() {
    if (!sources) {
      return;
    }
    setErrorMessage(null);
    setNoticeMessage(null);
    setSelectedAgreementId(null);
    setActiveForm({ kind: 'create', draft: emptyAgreementDraft(sources.customers[0]?.id ?? '') });
  }

  function startEdit(agreement: ServiceAgreementSummary) {
    setErrorMessage(null);
    setNoticeMessage(null);
    setSelectedAgreementId(agreement.id);
    setActiveForm({
      kind: 'edit',
      agreementId: agreement.id,
      draft: draftFromAgreement(agreement)
    });
  }

  async function submitForm() {
    if (!activeForm) {
      return;
    }
    setIsSaving(true);
    setErrorMessage(null);
    setNoticeMessage(null);
    try {
      if (activeForm.kind === 'create') {
        const result = await createOfficeServiceAgreement({
          apiBaseUrl,
          sessionToken,
          body: toCreateRequest(activeForm.draft)
        });
        setSelectedAgreementId(result.agreement.id);
        setNoticeMessage('Service agreement created.');
      } else {
        const result = await updateOfficeServiceAgreement({
          apiBaseUrl,
          sessionToken,
          agreementId: activeForm.agreementId,
          body: toUpdateRequest(activeForm.draft)
        });
        setSelectedAgreementId(result.agreement.id);
        setNoticeMessage('Service agreement updated.');
      }
      setActiveForm(null);
      await load();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to save agreement.');
    } finally {
      setIsSaving(false);
    }
  }

  async function changeStatus(
    agreement: ServiceAgreementSummary,
    action: 'activate' | 'pause' | 'end'
  ) {
    if (action === 'end' && !window.confirm(`End ${agreement.agreementNumber}?`)) {
      return;
    }
    setIsSaving(true);
    setErrorMessage(null);
    setNoticeMessage(null);
    try {
      if (action === 'activate') {
        await activateOfficeServiceAgreement({
          apiBaseUrl,
          sessionToken,
          agreementId: agreement.id
        });
        setNoticeMessage('Service agreement activated.');
      } else if (action === 'pause') {
        await pauseOfficeServiceAgreement({ apiBaseUrl, sessionToken, agreementId: agreement.id });
        setNoticeMessage('Service agreement paused.');
      } else {
        await endOfficeServiceAgreement({
          apiBaseUrl,
          sessionToken,
          agreementId: agreement.id,
          body: { reason: 'Ended from office agreement workbench.' }
        });
        setNoticeMessage('Service agreement ended.');
      }
      setActiveForm(null);
      setSelectedAgreementId(agreement.id);
      await load();
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'Unable to update agreement status.'
      );
    } finally {
      setIsSaving(false);
    }
  }

  const formOpen = activeForm !== null;

  return (
    <section style={styles.workspacePanel} aria-label="Agreements">
      <div style={styles.row}>
        <div>
          <h1 style={styles.heading}>Agreements</h1>
          <p style={styles.tinyMuted}>
            Service agreements, maintenance plans, and recurring service coverage.
          </p>
        </div>
        <div style={styles.inlineActionBar}>
          {canCreate ? (
            <button
              type="button"
              style={styles.primaryButton}
              disabled={isLoading || isSaving || formOpen || !sources?.customers.length}
              onClick={startCreate}
            >
              New agreement
            </button>
          ) : null}
          <button
            type="button"
            style={styles.button}
            disabled={isLoading}
            onClick={() => void load()}
          >
            {isLoading ? 'Loading...' : 'Refresh'}
          </button>
        </div>
      </div>

      {errorMessage ? <p style={styles.error}>{errorMessage}</p> : null}
      {noticeMessage ? <p style={styles.notice}>{noticeMessage}</p> : null}

      <div style={styles.panel}>
        <div style={styles.formGridCompact}>
          <label style={styles.fieldLabel}>
            Search
            <input
              style={styles.input}
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
            />
          </label>
          <label style={styles.fieldLabel}>
            Status
            <select
              style={styles.input}
              value={statusFilter}
              onChange={(event) =>
                setStatusFilter(event.target.value as ServiceAgreementStatus | 'all')
              }
            >
              <option value="all">All</option>
              {Object.entries(statusLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {activeForm && sources ? (
        <AgreementForm
          form={activeForm}
          sources={sources}
          isSaving={isSaving}
          onChange={setActiveForm}
          onCancel={() => setActiveForm(null)}
          onSubmit={() => void submitForm()}
        />
      ) : null}

      {hasLoaded ? (
        <div style={styles.wideSplitGrid}>
          <AgreementList
            agreements={visibleAgreements}
            selectedAgreementId={selectedAgreementId}
            onSelect={setSelectedAgreementId}
          />
          <AgreementDetail
            agreement={selectedAgreement}
            canEdit={canEdit}
            isSaving={isSaving}
            formOpen={formOpen}
            onEdit={startEdit}
            onStatusChange={(agreement, action) => void changeStatus(agreement, action)}
          />
        </div>
      ) : isLoading ? (
        <p style={styles.muted}>Loading agreements...</p>
      ) : null}
    </section>
  );
}

function AgreementList({
  agreements,
  selectedAgreementId,
  onSelect
}: {
  agreements: ServiceAgreementSummary[];
  selectedAgreementId: string | null;
  onSelect: (agreementId: string) => void;
}) {
  return (
    <div style={styles.panel}>
      <div style={styles.row}>
        <h2 style={styles.heading}>Service agreements</h2>
        <span style={styles.badge}>{agreements.length}</span>
      </div>
      {agreements.length === 0 ? (
        <p style={styles.muted}>No agreements match the current filters.</p>
      ) : (
        <div style={styles.tableWrap}>
          <table style={styles.table}>
            <thead>
              <tr>
                {['Agreement', 'Customer', 'Status', 'Renewal', 'Billing'].map((label) => (
                  <th key={label} style={styles.tableHeadCell}>
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {agreements.map((agreement) => (
                <tr key={agreement.id}>
                  <td style={styles.tableCell}>
                    <button
                      type="button"
                      style={styles.tableLinkButton}
                      onClick={() => onSelect(agreement.id)}
                    >
                      {agreement.agreementNumber}
                    </button>
                    <p style={styles.tinyMuted}>
                      {agreement.name}
                      {agreement.id === selectedAgreementId ? ' · Selected' : ''}
                    </p>
                  </td>
                  <td style={styles.tableCell}>{agreement.customerName}</td>
                  <td style={styles.tableCell}>
                    <StatusBadge status={agreement.status} />
                  </td>
                  <td style={styles.tableCell}>{formatDate(agreement.renewalDate) ?? '-'}</td>
                  <td style={styles.tableCell}>
                    {billingCadenceLabels[agreement.billingCadence]}
                    {agreement.billingAmount !== undefined ? (
                      <p style={styles.tinyMuted}>{formatCurrency(agreement.billingAmount)}</p>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function AgreementDetail({
  agreement,
  canEdit,
  isSaving,
  formOpen,
  onEdit,
  onStatusChange
}: {
  agreement: ServiceAgreementSummary | null;
  canEdit: boolean;
  isSaving: boolean;
  formOpen: boolean;
  onEdit: (agreement: ServiceAgreementSummary) => void;
  onStatusChange: (
    agreement: ServiceAgreementSummary,
    action: 'activate' | 'pause' | 'end'
  ) => void;
}) {
  if (!agreement) {
    return (
      <div style={styles.panel}>
        <p style={styles.muted}>Select an agreement to review details.</p>
      </div>
    );
  }

  const canActivate = canEdit && (agreement.status === 'draft' || agreement.status === 'paused');
  const canPause = canEdit && agreement.status === 'active';
  const canEnd = canEdit && agreement.status !== 'ended';
  const canEditTerms = canEdit && agreement.status !== 'ended';

  return (
    <div style={styles.panel}>
      <div style={styles.row}>
        <div>
          <h2 style={styles.heading}>{agreement.name}</h2>
          <p style={styles.tinyMuted}>
            {agreement.agreementNumber} · {agreement.customerName}
          </p>
        </div>
        <div style={styles.badgeRow}>
          <StatusBadge status={agreement.status} />
        </div>
      </div>

      <div style={styles.inlineActionBar}>
        {canEditTerms ? (
          <button
            type="button"
            style={styles.button}
            disabled={isSaving || formOpen}
            onClick={() => onEdit(agreement)}
          >
            Edit
          </button>
        ) : null}
        {canActivate ? (
          <button
            type="button"
            style={styles.primaryButton}
            disabled={isSaving || formOpen}
            onClick={() => onStatusChange(agreement, 'activate')}
          >
            Activate
          </button>
        ) : null}
        {canPause ? (
          <button
            type="button"
            style={styles.button}
            disabled={isSaving || formOpen}
            onClick={() => onStatusChange(agreement, 'pause')}
          >
            Pause
          </button>
        ) : null}
        {canEnd ? (
          <button
            type="button"
            style={styles.dangerButton}
            disabled={isSaving || formOpen}
            onClick={() => onStatusChange(agreement, 'end')}
          >
            End
          </button>
        ) : null}
      </div>

      <div style={styles.detailGrid}>
        <SummaryField label="Start" value={formatDate(agreement.startDate) ?? '-'} />
        <SummaryField label="End" value={formatDate(agreement.endDate) ?? '-'} />
        <SummaryField label="Renewal" value={formatDate(agreement.renewalDate) ?? '-'} />
        <SummaryField
          label="Billing"
          value={`${billingCadenceLabels[agreement.billingCadence]}${
            agreement.billingAmount !== undefined
              ? ` · ${formatCurrency(agreement.billingAmount)}`
              : ''
          }`}
        />
      </div>

      {agreement.description ? <p style={styles.muted}>{agreement.description}</p> : null}

      <DetailSection title="Covered locations" count={agreement.coveredLocations.length}>
        {agreement.coveredLocations.length === 0 ? (
          <p style={styles.muted}>No covered locations.</p>
        ) : (
          <ul style={styles.timeline}>
            {agreement.coveredLocations.map((location) => (
              <li key={location.id}>{location.locationName}</li>
            ))}
          </ul>
        )}
      </DetailSection>

      <DetailSection title="Covered equipment" count={agreement.coveredEquipment.length}>
        {agreement.coveredEquipment.length === 0 ? (
          <p style={styles.muted}>No equipment-specific coverage.</p>
        ) : (
          <ul style={styles.timeline}>
            {agreement.coveredEquipment.map((equipment) => (
              <li key={equipment.id}>
                {equipment.equipmentLabel} · {equipment.locationName}
              </li>
            ))}
          </ul>
        )}
      </DetailSection>

      <DetailSection title="Visit templates" count={agreement.visitTemplates.length}>
        {agreement.visitTemplates.length === 0 ? (
          <p style={styles.muted}>No recurring visit templates.</p>
        ) : (
          <div style={styles.listCompact}>
            {agreement.visitTemplates.map((template) => (
              <div key={template.id} style={styles.subpanel}>
                <div style={styles.row}>
                  <strong>{template.title}</strong>
                  <span style={template.isActive ? styles.badge : styles.dangerBadge}>
                    {template.isActive ? 'Active' : 'Inactive'}
                  </span>
                </div>
                <p style={styles.tinyMuted}>
                  {visitFrequencyLabels[template.frequency]}
                  {template.intervalMonths ? ` · every ${template.intervalMonths} months` : ''}
                  {template.estimatedDurationMinutes
                    ? ` · ${template.estimatedDurationMinutes} min`
                    : ''}
                </p>
                {template.summary ? <p style={styles.muted}>{template.summary}</p> : null}
              </div>
            ))}
          </div>
        )}
      </DetailSection>
    </div>
  );
}

function DetailSection({
  title,
  count,
  children
}: {
  title: string;
  count: number;
  children: ReactNode;
}) {
  return (
    <section style={styles.formSection}>
      <div style={styles.row}>
        <h3 style={styles.sectionHeading}>{title}</h3>
        <span style={styles.badge}>{count}</span>
      </div>
      {children}
    </section>
  );
}

function SummaryField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p style={styles.tinyMuted}>{label}</p>
      <strong>{value}</strong>
    </div>
  );
}

function StatusBadge({ status }: { status: ServiceAgreementStatus }) {
  return (
    <span style={status === 'ended' ? styles.dangerBadge : styles.badge}>
      {statusLabels[status]}
    </span>
  );
}

function formatDate(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }
  return new Date(value).toLocaleDateString();
}
