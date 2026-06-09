import type { RegisterSearchResult } from './field-register-search';
import { formatCurrency, type RegisterEntryDraft } from './field-workspace-drafts';

export type RegisterComposerSelectionState = {
  query: string;
  selectedResult: RegisterSearchResult | null;
  isAdvancedOpen: boolean;
};

export function isDraftCoherentForSelectedResult(
  draft: RegisterEntryDraft,
  result: RegisterSearchResult
): boolean {
  if (result.kind === 'catalog') {
    return draft.catalogItemId === result.item.id && !!draft.description.trim();
  }

  if (result.kind === 'truckStock') {
    return (
      draft.inventoryItemId === result.item.itemId &&
      draft.inventoryLocationId === result.item.locationId &&
      !!draft.description.trim()
    );
  }

  return draft.registerEntryKind === 'other' && !!(draft.description.trim() || draft.totalAmount);
}

export function formatDraftTotalLabel(draft: RegisterEntryDraft): string {
  const totalAmount = Number(draft.totalAmount);
  const unitPrice = draft.unitPrice.trim() ? Number(draft.unitPrice) : undefined;
  const hasIntentionalZero = draft.totalAmount.trim() === '0' && draft.unitPrice.trim() === '0';

  if (
    !draft.totalAmount.trim() ||
    !Number.isFinite(totalAmount) ||
    (!hasIntentionalZero && totalAmount === 0 && unitPrice === undefined)
  ) {
    return 'Price not set';
  }

  return formatCurrency(totalAmount);
}

export function resolveRegisterComposerAfterAddAttempt(
  state: RegisterComposerSelectionState,
  didQueue: boolean
): RegisterComposerSelectionState {
  if (!didQueue) {
    return state;
  }

  return {
    query: '',
    selectedResult: null,
    isAdvancedOpen: false
  };
}
