'use client';

import type { CatalogCategory, CatalogItem, CatalogItemKind } from '@/lib/operations-api';
import { officeWorkspaceStyles as styles } from './office-workspace-styles';

export type CatalogDraft = {
  code: string;
  name: string;
  kind: CatalogItemKind;
  category: string;
  tradeTags: string;
  description: string;
  internalNotes: string;
  unitOfMeasure: string;
  taxableDefault: boolean;
  defaultSalePrice: string;
  agreementPrice: string;
  estimatedLaborHours: string;
  costHint: string;
  linkedInventoryItemId: string;
  incomeCategory: string;
  accountingExportCode: string;
  fieldVisible: boolean;
  isActive: boolean;
};

export type ActiveCatalogForm = {
  editingId: string | null;
  draft: CatalogDraft;
};

export const emptyCatalogDraft: CatalogDraft = {
  code: '',
  name: '',
  kind: 'service',
  category: '',
  tradeTags: '',
  description: '',
  internalNotes: '',
  unitOfMeasure: '',
  taxableDefault: true,
  defaultSalePrice: '',
  agreementPrice: '',
  estimatedLaborHours: '',
  costHint: '',
  linkedInventoryItemId: '',
  incomeCategory: '',
  accountingExportCode: '',
  fieldVisible: true,
  isActive: true
};

const kindOptions: Array<{ value: CatalogItemKind; label: string }> = [
  { value: 'service', label: 'Service' },
  { value: 'part', label: 'Part' },
  { value: 'equipment', label: 'Equipment' },
  { value: 'labor', label: 'Labor' },
  { value: 'fee', label: 'Fee' },
  { value: 'discount', label: 'Discount' },
  { value: 'agreement', label: 'Agreement' },
  { value: 'other', label: 'Other' }
];

export function draftFromCatalogItem(item: CatalogItem): CatalogDraft {
  return {
    code: item.code ?? '',
    name: item.name,
    kind: item.kind,
    category: item.category ?? '',
    tradeTags: item.tradeTags.join(', '),
    description: item.description ?? '',
    internalNotes: item.internalNotes ?? '',
    unitOfMeasure: item.unitOfMeasure ?? '',
    taxableDefault: item.taxableDefault,
    defaultSalePrice: item.defaultSalePrice === undefined ? '' : String(item.defaultSalePrice),
    agreementPrice: item.agreementPrice === undefined ? '' : String(item.agreementPrice),
    estimatedLaborHours:
      item.estimatedLaborHours === undefined ? '' : String(item.estimatedLaborHours),
    costHint: item.costHint === undefined ? '' : String(item.costHint),
    linkedInventoryItemId: item.linkedInventoryItemId ?? '',
    incomeCategory: item.incomeCategory ?? '',
    accountingExportCode: item.accountingExportCode ?? '',
    fieldVisible: item.fieldVisible,
    isActive: item.isActive
  };
}

export function CatalogForm({
  form,
  categories,
  inventoryItems,
  isSaving,
  onChange,
  onCancel,
  onSubmit
}: {
  form: ActiveCatalogForm;
  categories: CatalogCategory[];
  inventoryItems: Array<{ id: string; name: string }>;
  isSaving: boolean;
  onChange: (form: ActiveCatalogForm) => void;
  onCancel: () => void;
  onSubmit: () => void;
}) {
  const submitDisabled = isSaving || !form.draft.name.trim();
  const categoryOptions = buildCategoryOptions(categories, form.draft.category);

  function patch(patch: Partial<CatalogDraft>) {
    onChange({ ...form, draft: { ...form.draft, ...patch } });
  }

  function selectCategory(categoryName: string) {
    const selectedCategory = categories.find((category) => category.name === categoryName);
    const categoryPatch: Partial<CatalogDraft> = { category: categoryName };
    if (!form.editingId && selectedCategory?.defaultTaxable !== undefined) {
      categoryPatch.taxableDefault = selectedCategory.defaultTaxable;
    }
    patch(categoryPatch);
  }

  return (
    <form
      style={styles.panel}
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <div style={styles.row}>
        <h2 style={styles.heading}>{form.editingId ? 'Edit catalog item' : 'Add catalog item'}</h2>
        {form.editingId ? (
          <CheckboxField
            label="Active"
            checked={form.draft.isActive}
            onChange={(isActive) => patch({ isActive })}
          />
        ) : null}
      </div>

      <div style={styles.formGridCompact}>
        <TextField label="Name" value={form.draft.name} onChange={(name) => patch({ name })} />
        <TextField label="Code" value={form.draft.code} onChange={(code) => patch({ code })} />
        <label style={styles.fieldLabel}>
          Kind
          <select
            style={styles.input}
            value={form.draft.kind}
            onChange={(event) => patch({ kind: event.target.value as CatalogItemKind })}
          >
            {kindOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label style={styles.fieldLabel}>
          Category
          <select
            style={styles.input}
            value={form.draft.category}
            onChange={(event) => selectCategory(event.target.value)}
          >
            <option value="">No category</option>
            {categoryOptions.map((category) => (
              <option key={category.name} value={category.name}>
                {category.name}
                {category.isActive ? '' : ' (inactive)'}
              </option>
            ))}
          </select>
        </label>
        <TextField
          label="Tags"
          value={form.draft.tradeTags}
          onChange={(tradeTags) => patch({ tradeTags })}
        />
        <TextField
          label="Unit"
          value={form.draft.unitOfMeasure}
          onChange={(unitOfMeasure) => patch({ unitOfMeasure })}
        />
        <TextField
          label="Default price"
          value={form.draft.defaultSalePrice}
          onChange={(defaultSalePrice) => patch({ defaultSalePrice })}
        />
        <TextField
          label="Agreement price"
          value={form.draft.agreementPrice}
          onChange={(agreementPrice) => patch({ agreementPrice })}
        />
        <TextField
          label="Labor hours"
          value={form.draft.estimatedLaborHours}
          onChange={(estimatedLaborHours) => patch({ estimatedLaborHours })}
        />
        <TextField
          label="Cost hint"
          value={form.draft.costHint}
          onChange={(costHint) => patch({ costHint })}
        />
        <label style={styles.fieldLabel}>
          Linked inventory item
          <select
            style={styles.input}
            value={form.draft.linkedInventoryItemId}
            onChange={(event) => patch({ linkedInventoryItemId: event.target.value })}
          >
            <option value="">None</option>
            {inventoryItems.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        <TextField
          label="Income category"
          value={form.draft.incomeCategory}
          onChange={(incomeCategory) => patch({ incomeCategory })}
        />
        <TextField
          label="Export code"
          value={form.draft.accountingExportCode}
          onChange={(accountingExportCode) => patch({ accountingExportCode })}
        />
        <CheckboxField
          label="Taxable by default"
          checked={form.draft.taxableDefault}
          onChange={(taxableDefault) => patch({ taxableDefault })}
        />
        <CheckboxField
          label="Visible to field"
          checked={form.draft.fieldVisible}
          onChange={(fieldVisible) => patch({ fieldVisible })}
        />
        <label style={{ ...styles.fieldLabel, ...styles.formGridFullWidth }}>
          Description
          <textarea
            style={styles.textarea}
            value={form.draft.description}
            onChange={(event) => patch({ description: event.target.value })}
          />
        </label>
        <label style={{ ...styles.fieldLabel, ...styles.formGridFullWidth }}>
          Internal notes
          <textarea
            style={styles.textarea}
            value={form.draft.internalNotes}
            onChange={(event) => patch({ internalNotes: event.target.value })}
          />
        </label>
      </div>

      <div style={styles.inlineActionBar}>
        <button type="submit" style={styles.primaryButton} disabled={submitDisabled}>
          {isSaving ? 'Saving...' : 'Save'}
        </button>
        <button type="button" style={styles.button} disabled={isSaving} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function buildCategoryOptions(
  categories: CatalogCategory[],
  currentCategoryName: string
): CatalogCategory[] {
  const byName = new Map<string, CatalogCategory>();
  for (const category of categories) {
    if (category.isActive) {
      byName.set(category.name.toLocaleLowerCase(), category);
    }
  }

  const currentCategory = currentCategoryName.trim();
  if (currentCategory) {
    const key = currentCategory.toLocaleLowerCase();
    const knownCategory = categories.find((category) => category.name.toLocaleLowerCase() === key);
    // The select matches options by exact string, so a case-variant item (an
    // item saved as 'hvac' under managed 'HVAC') must keep its own text as the
    // option value or the form falsely shows "No category".
    byName.set(
      key,
      knownCategory
        ? knownCategory.name === currentCategory
          ? knownCategory
          : { ...knownCategory, name: currentCategory }
        : {
            id: `unmanaged-${key}`,
            name: currentCategory,
            sortOrder: Number.MAX_SAFE_INTEGER,
            isActive: false,
            createdAt: '',
            updatedAt: ''
          }
    );
  }

  return [...byName.values()].sort((left, right) => {
    if (left.isActive !== right.isActive) {
      return left.isActive ? -1 : 1;
    }
    if (left.sortOrder !== right.sortOrder) {
      return left.sortOrder - right.sortOrder;
    }
    return left.name.localeCompare(right.name);
  });
}

function TextField({
  label,
  value,
  onChange
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label style={styles.fieldLabel}>
      {label}
      <input
        style={styles.input}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function CheckboxField({
  label,
  checked,
  onChange
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label style={styles.inlineLabel}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      {label}
    </label>
  );
}
