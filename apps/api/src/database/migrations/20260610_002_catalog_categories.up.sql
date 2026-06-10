create table if not exists catalog_categories (
  id text primary key,
  name text not null,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  default_taxable boolean,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint catalog_categories_name_not_blank check (
    length(trim(name)) > 0 and length(name) <= 80
  ),
  constraint catalog_categories_sort_order_range check (
    sort_order >= -100000 and sort_order <= 100000
  )
);

create unique index if not exists catalog_categories_name_key
  on catalog_categories (lower(name));

insert into catalog_categories (
  id,
  name,
  sort_order,
  is_active,
  default_taxable,
  created_at,
  updated_at
)
select
  'catalog-category-' || md5(lower(trim(category))) as id,
  trim(category) as name,
  (row_number() over (order by lower(trim(category))) * 10)::integer as sort_order,
  true as is_active,
  case
    when bool_and(taxable_default) then true
    when bool_and(not taxable_default) then false
    else null
  end as default_taxable,
  now(),
  now()
from catalog_items
where category is not null
  and length(trim(category)) > 0
group by trim(category)
on conflict do nothing;
