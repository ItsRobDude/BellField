'use client';

import type { CustomerLocationListItem } from '@bellfield/contracts';
import { officeWorkspaceStyles as styles } from './office-workspace-styles';

type CrmCustomerLocationsSectionProps = {
  locations: CustomerLocationListItem[];
  onAddLocation: () => void;
  onOpenLocation: (locationId: string) => void;
};

export function CrmCustomerLocationsSection({
  locations,
  onAddLocation,
  onOpenLocation
}: CrmCustomerLocationsSectionProps) {
  return (
    <div style={styles.subpanel}>
      <div style={styles.row}>
        <strong>Service locations</strong>
        <button type="button" onClick={onAddLocation} style={styles.button}>
          Add location
        </button>
      </div>
      {locations.length > 0 ? (
        <div style={styles.list}>
          {locations.map((location) => (
            <button
              key={location.id}
              type="button"
              onClick={() => onOpenLocation(location.id)}
              style={styles.cardButton}
            >
              <strong>{location.name}</strong>
              <span style={styles.tinyMuted}>
                {location.addressLine1}, {location.city}, {location.state} {location.postalCode}
              </span>
              {!location.isActive ? <span style={styles.badge}>Inactive</span> : null}
            </button>
          ))}
        </div>
      ) : (
        <p style={styles.tinyMuted}>No service locations recorded.</p>
      )}
    </div>
  );
}
