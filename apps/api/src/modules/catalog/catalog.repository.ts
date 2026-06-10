import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { CatalogCategory, CatalogItem, FieldCatalogItem } from '@bellfield/contracts';
import { DatabaseService } from '../../database/database.service';
import { toIsoString } from '../../database/database-row.utils';
import type {
  CreateCatalogCategoryRequestDto,
  CreateCatalogItemRequestDto,
  UpdateCatalogCategoryRequestDto,
  UpdateCatalogItemRequestDto
} from './catalog.types';

type CatalogItemRow = {
  id: string;
  code: string | null;
  name: string;
  kind: FieldCatalogItem['kind'];
  category: string | null;
  tradeTags: string[];
  description: string | null;
  unitOfMeasure: string | null;
  taxableDefault: boolean;
  defaultSalePrice: string | number | null;
  agreementPrice: string | number | null;
  estimatedLaborHours: string | number | null;
  linkedInventoryItemId: string | null;
  linkedInventoryItemSku: string | null;
  linkedInventoryItemName: string | null;
  internalNotes: string | null;
  costHint: string | number | null;
  incomeCategory: string | null;
  accountingExportCode: string | null;
  fieldVisible: boolean;
  isActive: boolean;
  registerUsageCount: string | number;
  createdAt: string | Date;
  updatedAt: string | Date;
};

type CatalogCategoryRow = {
  id: string;
  name: string;
  sortOrder: string | number;
  isActive: boolean;
  defaultTaxable: boolean | null;
  createdAt: string | Date;
  updatedAt: string | Date;
};

const CATALOG_ITEM_COLUMNS = `
  ci.id,
  ci.code,
  ci.name,
  ci.kind,
  ci.category,
  ci.trade_tags as "tradeTags",
  ci.description,
  ci.internal_notes as "internalNotes",
  ci.unit_of_measure as "unitOfMeasure",
  ci.taxable_default as "taxableDefault",
  ci.default_sale_price as "defaultSalePrice",
  ci.agreement_price as "agreementPrice",
  ci.estimated_labor_hours as "estimatedLaborHours",
  ci.cost_hint as "costHint",
  ci.linked_inventory_item_id as "linkedInventoryItemId",
  ii.sku as "linkedInventoryItemSku",
  ii.name as "linkedInventoryItemName",
  ci.income_category as "incomeCategory",
  ci.accounting_export_code as "accountingExportCode",
  ci.field_visible as "fieldVisible",
  ci.is_active as "isActive",
  coalesce(usage.register_usage_count, 0) as "registerUsageCount",
  ci.created_at as "createdAt",
  ci.updated_at as "updatedAt"
`;

const CATALOG_CATEGORY_COLUMNS = `
  id,
  name,
  sort_order as "sortOrder",
  is_active as "isActive",
  default_taxable as "defaultTaxable",
  created_at as "createdAt",
  updated_at as "updatedAt"
`;

@Injectable()
export class CatalogRepository {
  constructor(private readonly databaseService: DatabaseService) {}

  async listCategories(): Promise<CatalogCategory[]> {
    const result = await this.databaseService.query<CatalogCategoryRow>(
      `
        select ${CATALOG_CATEGORY_COLUMNS}
        from catalog_categories
        order by is_active desc, sort_order asc, lower(name) asc, id asc
      `
    );

    return result.rows.map(toCatalogCategory);
  }

  async getCategoryById(id: string): Promise<CatalogCategory | null> {
    const result = await this.databaseService.query<CatalogCategoryRow>(
      `
        select ${CATALOG_CATEGORY_COLUMNS}
        from catalog_categories
        where id = $1
        limit 1
      `,
      [id]
    );

    return result.rows[0] ? toCatalogCategory(result.rows[0]) : null;
  }

  async getCategoryByName(name: string): Promise<CatalogCategory | null> {
    const result = await this.databaseService.query<CatalogCategoryRow>(
      `
        select ${CATALOG_CATEGORY_COLUMNS}
        from catalog_categories
        where lower(name) = lower($1)
        limit 1
      `,
      [name.trim()]
    );

    return result.rows[0] ? toCatalogCategory(result.rows[0]) : null;
  }

  async categoryNameExists(name: string, excludingId?: string): Promise<boolean> {
    const result = await this.databaseService.query<{ id: string }>(
      `
        select id
        from catalog_categories
        where lower(name) = lower($1)
          and ($2::text is null or id <> $2)
        limit 1
      `,
      [name.trim(), excludingId ?? null]
    );

    return Boolean(result.rows[0]);
  }

  async createCategory(input: CreateCatalogCategoryRequestDto): Promise<CatalogCategory> {
    const id = randomUUID();
    const now = new Date().toISOString();
    await this.databaseService.query(
      `insert into catalog_categories (
         id, name, sort_order, is_active, default_taxable, created_at, updated_at
       )
       values ($1, $2, $3, $4, $5, $6, $6)`,
      [
        id,
        input.name.trim(),
        input.sortOrder ?? 0,
        input.isActive ?? true,
        input.defaultTaxable ?? null,
        now
      ]
    );

    return (await this.getCategoryById(id))!;
  }

  /**
   * Items reference categories by free-text name, so a rename must cascade to
   * the items in the same transaction or it silently strands them in
   * "Uncategorized". Estimate line snapshots are deliberately untouched —
   * history keeps the name that was quoted.
   */
  async updateCategory(
    id: string,
    input: UpdateCatalogCategoryRequestDto,
    previousName: string
  ): Promise<void> {
    const now = new Date().toISOString();
    const newName = input.name.trim();
    await this.databaseService.transaction(async (queryable) => {
      await queryable.query(
        `update catalog_categories set
           name = $2,
           sort_order = $3,
           is_active = $4,
           default_taxable = $5,
           updated_at = $6
         where id = $1`,
        [id, newName, input.sortOrder, input.isActive, input.defaultTaxable ?? null, now]
      );
      if (newName !== previousName.trim()) {
        await queryable.query(
          `update catalog_items
           set category = $1,
               updated_at = $2
           where lower(trim(category)) = lower(trim($3))`,
          [newName, now, previousName]
        );
      }
    });
  }

  async listItems(): Promise<CatalogItem[]> {
    const result = await this.databaseService.query<CatalogItemRow>(
      `
        select ${CATALOG_ITEM_COLUMNS}
        from catalog_items ci
        left join inventory_items ii on ii.id = ci.linked_inventory_item_id
        left join (
          select catalog_item_id, count(*)::int as register_usage_count
          from register_entries
          where catalog_item_id is not null
          group by catalog_item_id
        ) usage on usage.catalog_item_id = ci.id
        order by ci.is_active desc, ci.category nulls last, ci.name asc, ci.id asc
      `
    );

    return result.rows.map(toCatalogItem);
  }

  async getItemById(id: string): Promise<CatalogItem | null> {
    const result = await this.databaseService.query<CatalogItemRow>(
      `
        select ${CATALOG_ITEM_COLUMNS}
        from catalog_items ci
        left join inventory_items ii on ii.id = ci.linked_inventory_item_id
        left join (
          select catalog_item_id, count(*)::int as register_usage_count
          from register_entries
          where catalog_item_id is not null
          group by catalog_item_id
        ) usage on usage.catalog_item_id = ci.id
        where ci.id = $1
        limit 1
      `,
      [id]
    );

    return result.rows[0] ? toCatalogItem(result.rows[0]) : null;
  }

  async listFieldItems(): Promise<FieldCatalogItem[]> {
    const result = await this.databaseService.query<CatalogItemRow>(
      `
        select ${CATALOG_ITEM_COLUMNS}
        from catalog_items ci
        left join inventory_items ii on ii.id = ci.linked_inventory_item_id
        left join (
          select catalog_item_id, count(*)::int as register_usage_count
          from register_entries
          where catalog_item_id is not null
          group by catalog_item_id
        ) usage on usage.catalog_item_id = ci.id
        where ci.is_active = true
          and ci.field_visible = true
          and ci.kind <> 'discount'
        order by ci.category nulls last, ci.name asc, ci.id asc
      `
    );

    return result.rows.map(toFieldCatalogItem);
  }

  async createItem(input: CreateCatalogItemRequestDto): Promise<CatalogItem> {
    const id = randomUUID();
    const now = new Date().toISOString();
    await this.databaseService.query(
      `insert into catalog_items (
         id, code, name, kind, category, trade_tags, description, internal_notes,
         unit_of_measure, taxable_default, default_sale_price, agreement_price,
         estimated_labor_hours, cost_hint, linked_inventory_item_id, income_category,
         accounting_export_code, field_visible, is_active, created_at, updated_at
       )
       values (
         $1, $2, $3, $4, $5, $6, $7, $8,
         $9, $10, $11, $12,
         $13, $14, $15, $16,
         $17, $18, true, $19, $19
       )`,
      [
        id,
        cleanOptionalString(input.code),
        input.name.trim(),
        input.kind,
        cleanOptionalString(input.category),
        normalizeTags(input.tradeTags),
        cleanOptionalString(input.description),
        cleanOptionalString(input.internalNotes),
        cleanOptionalString(input.unitOfMeasure),
        input.taxableDefault ?? true,
        input.defaultSalePrice ?? null,
        input.agreementPrice ?? null,
        input.estimatedLaborHours ?? null,
        input.costHint ?? null,
        cleanOptionalString(input.linkedInventoryItemId),
        cleanOptionalString(input.incomeCategory),
        cleanOptionalString(input.accountingExportCode),
        input.fieldVisible ?? true,
        now
      ]
    );
    return (await this.getItemById(id))!;
  }

  async updateItem(id: string, input: UpdateCatalogItemRequestDto): Promise<void> {
    const now = new Date().toISOString();
    await this.databaseService.query(
      `update catalog_items set
         code = $2,
         name = $3,
         kind = $4,
         category = $5,
         trade_tags = $6,
         description = $7,
         internal_notes = $8,
         unit_of_measure = $9,
         taxable_default = $10,
         default_sale_price = $11,
         agreement_price = $12,
         estimated_labor_hours = $13,
         cost_hint = $14,
         linked_inventory_item_id = $15,
         income_category = $16,
         accounting_export_code = $17,
         field_visible = $18,
         is_active = $19,
         updated_at = $20
       where id = $1`,
      [
        id,
        cleanOptionalString(input.code),
        input.name.trim(),
        input.kind,
        cleanOptionalString(input.category),
        normalizeTags(input.tradeTags),
        cleanOptionalString(input.description),
        cleanOptionalString(input.internalNotes),
        cleanOptionalString(input.unitOfMeasure),
        input.taxableDefault,
        input.defaultSalePrice ?? null,
        input.agreementPrice ?? null,
        input.estimatedLaborHours ?? null,
        input.costHint ?? null,
        cleanOptionalString(input.linkedInventoryItemId),
        cleanOptionalString(input.incomeCategory),
        cleanOptionalString(input.accountingExportCode),
        input.fieldVisible,
        input.isActive,
        now
      ]
    );
  }

  async inventoryItemExists(itemId: string): Promise<boolean> {
    const result = await this.databaseService.query<{ id: string }>(
      `select id from inventory_items where id = $1 limit 1`,
      [itemId]
    );
    return Boolean(result.rows[0]);
  }
}

function toCatalogCategory(row: CatalogCategoryRow): CatalogCategory {
  return {
    id: row.id,
    name: row.name,
    sortOrder: Number(row.sortOrder),
    isActive: row.isActive,
    defaultTaxable: row.defaultTaxable ?? undefined,
    createdAt: toIsoString(row.createdAt),
    updatedAt: toIsoString(row.updatedAt)
  };
}

function toOptionalNumber(value: string | number | null): number | undefined {
  return value === null ? undefined : Number(value);
}

function toFieldCatalogItem(row: CatalogItemRow): FieldCatalogItem {
  return {
    id: row.id,
    code: row.code ?? undefined,
    name: row.name,
    kind: row.kind,
    category: row.category ?? undefined,
    tradeTags: [...row.tradeTags],
    description: row.description ?? undefined,
    unitOfMeasure: row.unitOfMeasure ?? undefined,
    taxableDefault: row.taxableDefault,
    defaultSalePrice: toOptionalNumber(row.defaultSalePrice),
    agreementPrice: toOptionalNumber(row.agreementPrice),
    estimatedLaborHours: toOptionalNumber(row.estimatedLaborHours),
    linkedInventoryItemId: row.linkedInventoryItemId ?? undefined,
    linkedInventoryItemSku: row.linkedInventoryItemSku ?? undefined,
    linkedInventoryItemName: row.linkedInventoryItemName ?? undefined,
    updatedAt: toIsoString(row.updatedAt)
  };
}

function toCatalogItem(row: CatalogItemRow): CatalogItem {
  return {
    ...toFieldCatalogItem(row),
    internalNotes: row.internalNotes ?? undefined,
    costHint: toOptionalNumber(row.costHint),
    incomeCategory: row.incomeCategory ?? undefined,
    accountingExportCode: row.accountingExportCode ?? undefined,
    fieldVisible: row.fieldVisible,
    isActive: row.isActive,
    registerUsageCount: Number(row.registerUsageCount),
    createdAt: toIsoString(row.createdAt)
  };
}

function cleanOptionalString(value: string | undefined): string | null {
  const trimmed = value?.trim() ?? '';
  return trimmed ? trimmed : null;
}

function normalizeTags(tags: string[] | undefined): string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const tag of tags ?? []) {
    const trimmed = tag.trim();
    const key = trimmed.toLocaleLowerCase();
    if (trimmed && !seen.has(key)) {
      seen.add(key);
      normalized.push(trimmed);
    }
  }
  return normalized;
}
