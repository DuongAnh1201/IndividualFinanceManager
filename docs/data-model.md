# Data model

Owner: **codex2** (tables, migrations, repositories). Shared TypeScript types live in
`src/domain/types.ts` (owner: **claude2**) — DB rows map to these types.

Conventions:
- IDs: text UUIDs.
- **Money: integer minor units** (`amount_minor`, cents for USD, đồng for VND) + `currency` (ISO 4217: `USD`, `VND`). Never floats.
- Dates: `YYYY-MM-DD` text for calendar dates; ISO-8601 timestamps for `created_at` / `updated_at`.
- Months: `YYYY-MM` text. All month/week math uses the user's local time zone.
- Soft delete via `archived_at` where history must be preserved.

## Tables

### `settings` (single row)
| column | type | notes |
|---|---|---|
| base_currency | text | default `USD` |
| pay_days | json int[] | default `[10, 25]` |
| week_starts_on | int | 1 = Monday (default) |
| timezone | text | e.g. `America/Los_Angeles` |

### `payment_method`
| column | type | notes |
|---|---|---|
| id | text pk | |
| name | text | "Chase Visa" |
| type | text | `credit` \| `debit` \| `cash` |
| last4 | text null | |
| archived_at | timestamp null | |

### `category`
| column | type | notes |
|---|---|---|
| id | text pk | |
| name | text unique | |
| kind | text | `subscription` \| `daily` \| `other` |
| counts_toward_living_limit | bool | Groceries = true, Tuition = false |
| default_bottle_id | text fk null | bottle debited by expenses in this category |
| color | text | hex token from theme |
| mascot | text | mascot/icon key |
| archived_at | timestamp null | |

Seed categories:

| name | kind | living limit | default bottle |
|---|---|---|---|
| Subscriptions | subscription | no | Necessities |
| Groceries/Daily | daily | yes | Necessities |
| Dining out | daily | yes | Play |
| Transport | daily | yes | Necessities |
| Housing & Utilities | other | yes | Necessities |
| Health | other | yes | Necessities |
| Shopping | daily | yes | Play |
| Entertainment | daily | yes | Play |
| Tuition & Education | other | **no** | Education |
| Gifts & Giving | other | no | Give |
| Other | other | yes | Necessities |

### `expense`
| column | type | notes |
|---|---|---|
| id | text pk | |
| date | date | |
| amount_minor | int | > 0 |
| currency | text | |
| fx_rate_to_base | real null | snapshot used for reports; null = base currency |
| category_id | text fk | |
| payment_method_id | text fk | |
| bottle_id | text fk null | defaults from category |
| note | text null | |
| source | text | `manual` \| `subscription` |
| subscription_id | text fk null | |
| billing_month | text null | `YYYY-MM`; **unique (subscription_id, billing_month)** |
| created_at / updated_at | timestamp | |

### `subscription`
| column | type | notes |
|---|---|---|
| id | text pk | |
| name | text | "Netflix" |
| amount_minor / currency | int / text | current price |
| category_id | text fk | default Subscriptions |
| payment_method_id | text fk | |
| billing_day | int | 1–31 (clamped to month end) |
| start_date | date | |
| end_date | date null | set when removed |
| created_at / updated_at | timestamp | |

### `income`
| column | type | notes |
|---|---|---|
| id | text pk | |
| date | date | |
| amount_minor / currency | int / text | |
| fx_rate_to_base | real null | |
| source | text | "Salary" |
| note | text null | |
| pay_day_slot | text null | e.g. `2026-11-10` — links to a reminder |
| bottle_rule_version_id | text fk | rules used for the split |

### `bottle`
| column | type | notes |
|---|---|---|
| id | text pk | |
| name | text | |
| mascot | text | |
| sort_order | int | |
| archived_at | timestamp null | |

Seed: Necessities, Long-term Savings, Financial Freedom, Education, Play, Give.

### `bottle_rule_version` / `bottle_rule_ratio`
Versioned so past splits stay reproducible.

| `bottle_rule_version` | | |
|---|---|---|
| id | text pk | |
| effective_from | timestamp | |
| note | text null | |

| `bottle_rule_ratio` | | |
|---|---|---|
| version_id | text fk | |
| bottle_id | text fk | |
| ratio | int | > 0; default 5,1,1,1,1,1 |

### `bottle_allocation`
| column | type | notes |
|---|---|---|
| id | text pk | |
| income_id | text fk | |
| bottle_id | text fk | |
| amount_minor | int | in income currency |

### `bottle_transfer`
For moving balance when a bottle is removed, or manual moves.
| id | from_bottle_id | to_bottle_id | amount_minor | currency | date | note |

### `living_limit`
| column | type | notes |
|---|---|---|
| month | text pk | `YYYY-MM` |
| limit_minor | int | in base currency |

### `exchange_rate`
| column | type | notes |
|---|---|---|
| month | text | `YYYY-MM` |
| currency | text | |
| rate_to_base | real | 1 unit of `currency` = rate × base |
| pk (month, currency) | | |

### `monthly_report`
Snapshot written when a month closes (current month is always computed live).
| column | type | notes |
|---|---|---|
| month | text pk | |
| payload | json | `MonthlyReport` type from `src/domain/types.ts` |
| generated_at | timestamp | |

### `reminder`
| column | type | notes |
|---|---|---|
| slot | text pk | `YYYY-MM-DD` pay day |
| status | text | `pending` \| `done` \| `dismissed` |
| resolved_at | timestamp null | |

## Derived values (not stored)
- **Bottle balance** = Σ allocations + Σ transfers in − Σ transfers out − Σ expenses with that bottle (converted to base).
- **Living spend (month)** = Σ base-converted expenses in categories with `counts_toward_living_limit`.
