'use client';

import { useCallback, useEffect, useState } from 'react';
import { getOfficeRegisterEntries, type RegisterEntrySummary } from '@/lib/operations-api';
import {
  getOfficeInventoryItems,
  getOfficeInventoryLocations,
  type InventoryItem,
  type InventoryLocation
} from '@/lib/operations-inventory-api';
import {
  resolveOfficeRegisterCost,
  type ResolveRegisterCostRequest
} from '@/lib/operations-job-costing-api';
import { officeWorkspaceStyles as styles } from './office-workspace-styles';

// Per-line cost resolution for register lines in `needsResolution`. The office picks how each
// line costs; the server creates the linked cost artifact and moves the line to `applied`.
// Lives on the Job cost tab (not the register tab, which is at its file-size baseline).

type ResolveMode = ResolveRegisterCostRequest['mode'];

type Draft = {
  mode: ResolveMode;
  itemId: string;
  locationId: string;
  amount: string;
  hours: string;
  ratePerHour: string;
};

function emptyDraft(kind: string): Draft {
  return {
    mode: kind === 'labor' ? 'laborActual' : 'trackedInventory',
    itemId: '',
    locationId: '',
    amount: '',
    hours: '',
    ratePerHour: ''
  };
}

function modeOptions(kind: string): Array<{ value: ResolveMode; label: string }> {
  if (kind === 'labor') {
    return [
      { value: 'laborActual', label: 'Labor (hours × rate)' },
      { value: 'zeroCost', label: 'No cost (write off — no parts/labor)' }
    ];
  }
  return [
    { value: 'trackedInventory', label: 'Issue from stock' },
    { value: 'nonStockMaterial', label: 'Non-stock material cost' },
    { value: 'zeroCost', label: 'No cost (write off — no parts/labor)' }
  ];
}

/** Build the resolve request from the draft, or a validation message. */
function buildBody(draft: Draft): ResolveRegisterCostRequest | string {
  if (draft.mode === 'trackedInventory') {
    if (!draft.itemId || !draft.locationId) {
      return 'Pick an inventory item and a stock location.';
    }
    return { mode: 'trackedInventory', itemId: draft.itemId, locationId: draft.locationId };
  }
  if (draft.mode === 'nonStockMaterial') {
    const amount = Number(draft.amount);
    if (!(amount > 0)) {
      return 'Enter a material cost greater than zero.';
    }
    return { mode: 'nonStockMaterial', amount };
  }
  if (draft.mode === 'laborActual') {
    const hours = Number(draft.hours);
    const ratePerHour = Number(draft.ratePerHour);
    if (!(hours > 0) || !(ratePerHour > 0)) {
      return 'Enter hours and a cost rate greater than zero.';
    }
    return { mode: 'laborActual', hours, ratePerHour };
  }
  return { mode: 'zeroCost' };
}

export function JobCostResolutionPanel({
  jobId,
  apiBaseUrl,
  sessionToken,
  canEdit,
  jobIsFinal,
  onResolved
}: {
  jobId: string;
  apiBaseUrl: string;
  sessionToken: string;
  canEdit: boolean;
  jobIsFinal: boolean;
  onResolved: () => void;
}) {
  const [lines, setLines] = useState<RegisterEntrySummary[]>([]);
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [locations, setLocations] = useState<InventoryLocation[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const result = await getOfficeRegisterEntries({ sessionToken, apiBaseUrl, jobId });
      setLines(
        result.registerEntries.filter((e) => !e.isVoid && e.costingStatus === 'needsResolution')
      );
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load unresolved lines.');
    }
  }, [apiBaseUrl, jobId, sessionToken]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void (async () => {
      try {
        const [itemResult, locationResult] = await Promise.all([
          getOfficeInventoryItems({ sessionToken, apiBaseUrl }),
          getOfficeInventoryLocations({ sessionToken, apiBaseUrl })
        ]);
        setItems(itemResult.items.filter((i) => i.isActive));
        setLocations(locationResult.locations.filter((l) => l.isActive));
      } catch {
        // Pickers are best-effort; non-stock / labor / zero-cost still work without them.
      }
    })();
  }, [apiBaseUrl, sessionToken]);

  if (lines.length === 0) {
    return null;
  }

  async function submit(entry: RegisterEntrySummary) {
    if (!draft) {
      return;
    }
    const body = buildBody(draft);
    if (typeof body === 'string') {
      setError(body);
      return;
    }
    setIsSaving(true);
    setError(null);
    try {
      await resolveOfficeRegisterCost({
        sessionToken,
        apiBaseUrl,
        jobId,
        registerEntryId: entry.id,
        body
      });
      setOpenId(null);
      setDraft(null);
      await load();
      onResolved();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to resolve this line.');
    } finally {
      setIsSaving(false);
    }
  }

  const canResolve = canEdit && !jobIsFinal;

  return (
    <div style={styles.panel}>
      <div style={styles.row}>
        <h3 style={styles.sectionHeading}>Needs cost resolution</h3>
        <span style={styles.badge}>{lines.length}</span>
      </div>
      <p style={styles.tinyMuted}>
        These field-captured lines bill the customer but still owe a job cost. Resolve each so the
        cost is complete.
      </p>
      {error ? <p style={styles.error}>{error}</p> : null}

      {lines.map((entry) => {
        const isOpen = openId === entry.id && draft !== null;
        return (
          <div key={entry.id} style={styles.panel}>
            <div style={styles.row}>
              <div>
                <strong>{entry.description}</strong>
                <p style={styles.tinyMuted}>
                  {entry.kind} · qty {entry.quantity}
                  {entry.partNumber ? ` · ${entry.partNumber}` : ''}
                </p>
              </div>
              {canResolve && !isOpen ? (
                <button
                  type="button"
                  style={styles.button}
                  disabled={isSaving}
                  onClick={() => {
                    setOpenId(entry.id);
                    setDraft(emptyDraft(entry.kind));
                    setError(null);
                  }}
                >
                  Resolve cost
                </button>
              ) : null}
            </div>

            {isOpen && draft ? (
              <form
                style={styles.formGridCompact}
                onSubmit={(event) => {
                  event.preventDefault();
                  void submit(entry);
                }}
              >
                <label style={styles.fieldLabel}>
                  How does this cost?
                  <select
                    style={styles.input}
                    value={draft.mode}
                    onChange={(event) =>
                      setDraft({ ...draft, mode: event.target.value as ResolveMode })
                    }
                  >
                    {modeOptions(entry.kind).map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>

                {draft.mode === 'trackedInventory' ? (
                  <>
                    <label style={styles.fieldLabel}>
                      Inventory item
                      <select
                        style={styles.input}
                        value={draft.itemId}
                        onChange={(event) => setDraft({ ...draft, itemId: event.target.value })}
                      >
                        <option value="">Select an item…</option>
                        {items.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.name} ({item.sku})
                          </option>
                        ))}
                      </select>
                    </label>
                    <label style={styles.fieldLabel}>
                      Stock location
                      <select
                        style={styles.input}
                        value={draft.locationId}
                        onChange={(event) => setDraft({ ...draft, locationId: event.target.value })}
                      >
                        <option value="">Select a location…</option>
                        {locations.map((location) => (
                          <option key={location.id} value={location.id}>
                            {location.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  </>
                ) : null}

                {draft.mode === 'nonStockMaterial' ? (
                  <label style={styles.fieldLabel}>
                    Material cost
                    <input
                      style={styles.input}
                      value={draft.amount}
                      onChange={(event) => setDraft({ ...draft, amount: event.target.value })}
                    />
                  </label>
                ) : null}

                {draft.mode === 'laborActual' ? (
                  <>
                    <label style={styles.fieldLabel}>
                      Hours
                      <input
                        style={styles.input}
                        value={draft.hours}
                        onChange={(event) => setDraft({ ...draft, hours: event.target.value })}
                      />
                    </label>
                    <label style={styles.fieldLabel}>
                      Cost rate / hour
                      <input
                        style={styles.input}
                        value={draft.ratePerHour}
                        onChange={(event) =>
                          setDraft({ ...draft, ratePerHour: event.target.value })
                        }
                      />
                    </label>
                  </>
                ) : null}

                <div style={styles.inlineActionBar}>
                  <button type="submit" style={styles.primaryButton} disabled={isSaving}>
                    {isSaving ? 'Resolving…' : 'Resolve'}
                  </button>
                  <button
                    type="button"
                    style={styles.button}
                    disabled={isSaving}
                    onClick={() => {
                      setOpenId(null);
                      setDraft(null);
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
