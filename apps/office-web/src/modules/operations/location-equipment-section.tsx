'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  createOfficeEquipment,
  deleteOfficeEquipment,
  getOfficeEquipmentDetail,
  getOfficeEquipmentWorkspace,
  linkOfficeEquipmentReplacement,
  updateOfficeEquipment,
  type EquipmentDetail,
  type EquipmentSummary,
  type EquipmentWorkspaceResponse
} from '@/lib/operations-api';
import {
  EquipmentPanel,
  type EquipmentCreateDraft,
  type EquipmentEditDraft
} from './equipment-panel';
import { officeWorkspaceStyles as styles } from './office-workspace-styles';

type LocationEquipmentSectionProps = {
  apiBaseUrl: string;
  sessionToken: string;
  location: {
    id: string;
    name: string;
  };
  canReplaceRemove: boolean;
  canDelete: boolean;
  onErrorMessage: (message: string | null) => void;
};

export function LocationEquipmentSection({
  apiBaseUrl,
  sessionToken,
  location,
  canReplaceRemove,
  canDelete,
  onErrorMessage
}: LocationEquipmentSectionProps) {
  const [equipmentLocations, setEquipmentLocations] = useState<
    EquipmentWorkspaceResponse['locations']
  >([]);
  const [equipment, setEquipment] = useState<EquipmentSummary[]>([]);
  const [suggestedEquipmentTypes, setSuggestedEquipmentTypes] = useState<string[]>([]);
  const [selectedEquipmentId, setSelectedEquipmentId] = useState<string | undefined>();
  const [selectedEquipmentDetail, setSelectedEquipmentDetail] = useState<EquipmentDetail | null>(
    null
  );
  const [hasLoadedEquipmentWorkspace, setHasLoadedEquipmentWorkspace] = useState(false);
  const [isEquipmentRefreshing, setIsEquipmentRefreshing] = useState(false);
  const [showInactiveEquipment, setShowInactiveEquipment] = useState(false);
  const selectedEquipmentIdRef = useRef(selectedEquipmentId);
  const equipmentRefreshInFlightRef = useRef(false);

  useEffect(() => {
    selectedEquipmentIdRef.current = selectedEquipmentId;
  }, [selectedEquipmentId]);

  const locationOptions = useMemo(() => {
    const workspaceLocation = equipmentLocations.find((record) => record.id === location.id);

    return [
      {
        id: location.id,
        name: workspaceLocation?.name ?? location.name
      }
    ];
  }, [equipmentLocations, location.id, location.name]);

  const locationEquipment = useMemo(
    () => equipment.filter((record) => record.locationId === location.id),
    [equipment, location.id]
  );

  const refreshLocationEquipmentWorkspace = useCallback(
    async (preferredEquipmentId?: string | null): Promise<boolean> => {
      if (equipmentRefreshInFlightRef.current) {
        return false;
      }

      equipmentRefreshInFlightRef.current = true;
      setIsEquipmentRefreshing(true);
      onErrorMessage(null);

      try {
        const nextEquipmentWorkspace = await getOfficeEquipmentWorkspace({
          sessionToken,
          apiBaseUrl,
          includeInactive: showInactiveEquipment
        });
        const nextLocationEquipment = nextEquipmentWorkspace.equipment.filter(
          (record) => record.locationId === location.id
        );
        const preferredSelection =
          preferredEquipmentId === null
            ? undefined
            : (preferredEquipmentId ?? selectedEquipmentIdRef.current);
        const nextSelectedEquipmentId =
          preferredSelection &&
          nextLocationEquipment.some((record) => record.id === preferredSelection)
            ? preferredSelection
            : nextLocationEquipment[0]?.id;

        setEquipmentLocations(nextEquipmentWorkspace.locations);
        setEquipment(nextEquipmentWorkspace.equipment);
        setSuggestedEquipmentTypes(nextEquipmentWorkspace.suggestedEquipmentTypes);
        setHasLoadedEquipmentWorkspace(true);

        if (nextSelectedEquipmentId) {
          const equipmentDetail = await getOfficeEquipmentDetail({
            equipmentId: nextSelectedEquipmentId,
            sessionToken,
            apiBaseUrl
          });
          setSelectedEquipmentId(nextSelectedEquipmentId);
          setSelectedEquipmentDetail(equipmentDetail);
        } else {
          setSelectedEquipmentId(undefined);
          setSelectedEquipmentDetail(null);
        }

        return true;
      } catch (error) {
        onErrorMessage(error instanceof Error ? error.message : 'Unable to refresh equipment.');
        return false;
      } finally {
        equipmentRefreshInFlightRef.current = false;
        setIsEquipmentRefreshing(false);
      }
    },
    [apiBaseUrl, location.id, onErrorMessage, sessionToken, showInactiveEquipment]
  );

  useEffect(() => {
    void refreshLocationEquipmentWorkspace();
  }, [refreshLocationEquipmentWorkspace]);

  async function handleCreateEquipment(draft: EquipmentCreateDraft) {
    try {
      const response = await createOfficeEquipment({
        sessionToken,
        apiBaseUrl,
        locationId: location.id,
        equipmentType: draft.equipmentType,
        brand: draft.brand,
        model: draft.model,
        serialNumber: draft.serialNumber,
        filterSizes: splitFilterSizes(draft.filterSizes),
        equipmentLocationDescription: draft.equipmentLocationDescription || undefined,
        installDate: draft.installDate || undefined,
        warrantyStartDate: draft.warrantyStartDate || undefined,
        warrantyEndDate: draft.warrantyEndDate || undefined,
        warrantyProviderNote: draft.warrantyProviderNote || undefined,
        systemGroupName: draft.systemGroupName || undefined,
        notes: draft.notes || undefined,
        status: draft.status
      });
      await refreshLocationEquipmentWorkspace(response.equipment.id);
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.includes('Serial number is strongly recommended') &&
        window.confirm('Serial number is blank. Create this equipment record anyway?')
      ) {
        const response = await createOfficeEquipment({
          sessionToken,
          apiBaseUrl,
          locationId: location.id,
          equipmentType: draft.equipmentType,
          brand: draft.brand,
          model: draft.model,
          serialNumber: draft.serialNumber,
          filterSizes: splitFilterSizes(draft.filterSizes),
          equipmentLocationDescription: draft.equipmentLocationDescription || undefined,
          installDate: draft.installDate || undefined,
          warrantyStartDate: draft.warrantyStartDate || undefined,
          warrantyEndDate: draft.warrantyEndDate || undefined,
          warrantyProviderNote: draft.warrantyProviderNote || undefined,
          systemGroupName: draft.systemGroupName || undefined,
          notes: draft.notes || undefined,
          status: draft.status,
          confirmMissingSerial: true
        });
        await refreshLocationEquipmentWorkspace(response.equipment.id);
        return;
      }

      onErrorMessage(error instanceof Error ? error.message : 'Unable to add equipment.');
    }
  }

  async function handleEquipmentUpdate(recordId: string, draft: EquipmentEditDraft) {
    try {
      await updateOfficeEquipment({
        equipmentId: recordId,
        sessionToken,
        apiBaseUrl,
        locationId: location.id,
        inventoryLocationLabel: undefined,
        equipmentType: draft.equipmentType,
        brand: draft.brand,
        model: draft.model,
        serialNumber: draft.serialNumber,
        filterSizes: splitFilterSizes(draft.filterSizes),
        equipmentLocationDescription: draft.equipmentLocationDescription,
        installDate: draft.installDate,
        warrantyStartDate: draft.warrantyStartDate || undefined,
        warrantyEndDate: draft.warrantyEndDate || undefined,
        warrantyProviderNote: draft.warrantyProviderNote || undefined,
        systemGroupName: draft.systemGroupName || undefined,
        clearSystemGroup: draft.systemGroupName.trim().length === 0,
        status: draft.status,
        notes: draft.notes
      });
      await refreshLocationEquipmentWorkspace(recordId);
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.includes('Serial number is strongly recommended') &&
        window.confirm('Serial number is blank. Save this equipment change anyway?')
      ) {
        await updateOfficeEquipment({
          equipmentId: recordId,
          sessionToken,
          apiBaseUrl,
          locationId: location.id,
          inventoryLocationLabel: undefined,
          equipmentType: draft.equipmentType,
          brand: draft.brand,
          model: draft.model,
          serialNumber: draft.serialNumber,
          filterSizes: splitFilterSizes(draft.filterSizes),
          equipmentLocationDescription: draft.equipmentLocationDescription,
          installDate: draft.installDate,
          warrantyStartDate: draft.warrantyStartDate || undefined,
          warrantyEndDate: draft.warrantyEndDate || undefined,
          warrantyProviderNote: draft.warrantyProviderNote || undefined,
          systemGroupName: draft.systemGroupName || undefined,
          clearSystemGroup: draft.systemGroupName.trim().length === 0,
          status: draft.status,
          notes: draft.notes,
          confirmMissingSerial: true
        });
        await refreshLocationEquipmentWorkspace(recordId);
        return;
      }

      onErrorMessage(error instanceof Error ? error.message : 'Unable to update equipment.');
    }
  }

  async function handleEquipmentSelect(equipmentId: string) {
    try {
      onErrorMessage(null);
      const equipmentDetail = await getOfficeEquipmentDetail({
        equipmentId,
        sessionToken,
        apiBaseUrl
      });
      setSelectedEquipmentId(equipmentId);
      setSelectedEquipmentDetail(equipmentDetail);
    } catch (error) {
      onErrorMessage(error instanceof Error ? error.message : 'Unable to load equipment detail.');
    }
  }

  async function handleLinkReplacement(equipmentId: string, replacementEquipmentId: string) {
    try {
      await linkOfficeEquipmentReplacement({
        equipmentId,
        replacementEquipmentId,
        sessionToken,
        apiBaseUrl
      });
      await refreshLocationEquipmentWorkspace(equipmentId);
    } catch (error) {
      onErrorMessage(
        error instanceof Error ? error.message : 'Unable to link replacement equipment.'
      );
    }
  }

  async function handleDeleteEquipment(equipmentId: string) {
    if (!window.confirm('Delete this equipment record permanently?')) {
      return;
    }

    try {
      await deleteOfficeEquipment({
        equipmentId,
        sessionToken,
        apiBaseUrl,
        confirmDelete: true
      });
      setSelectedEquipmentId(undefined);
      setSelectedEquipmentDetail(null);
      await refreshLocationEquipmentWorkspace(null);
    } catch (error) {
      onErrorMessage(error instanceof Error ? error.message : 'Unable to delete equipment.');
    }
  }

  return (
    <section aria-label="Location equipment" style={styles.list}>
      {hasLoadedEquipmentWorkspace ? (
        <EquipmentPanel
          locations={locationOptions}
          equipment={locationEquipment}
          suggestedEquipmentTypes={suggestedEquipmentTypes}
          locationScope={{ locationId: location.id, locationName: location.name }}
          selectedEquipmentId={selectedEquipmentId}
          selectedEquipmentDetail={selectedEquipmentDetail}
          showInactiveEquipment={showInactiveEquipment}
          canReplaceRemove={canReplaceRemove}
          canDelete={canDelete}
          onSelectEquipment={handleEquipmentSelect}
          onShowInactiveChange={setShowInactiveEquipment}
          onCreateEquipment={handleCreateEquipment}
          onRecordUpdate={handleEquipmentUpdate}
          onLinkReplacement={handleLinkReplacement}
          onDeleteEquipment={handleDeleteEquipment}
        />
      ) : (
        <section style={styles.workspacePanel} aria-label="Equipment loading">
          <p style={styles.muted}>
            {isEquipmentRefreshing
              ? 'Loading location equipment...'
              : 'Equipment is not ready yet.'}
          </p>
        </section>
      )}
    </section>
  );
}

function splitFilterSizes(filterSizes: string): string[] {
  return filterSizes
    .split(',')
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
}
