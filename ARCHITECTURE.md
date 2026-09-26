# StockSense — Architecture Guide

> For teammates building Receipts, Deliveries, Transfers, and Adjustments on top of this core module.

---

## The Ledger-of-Record Design

StockSense uses a **double-entry ledger** approach. Every stock movement creates:

1. An **immutable row** in `stock_ledger` — the permanent audit trail.
2. **Atomically updated rows** in `stock_current` — the materialised current balance.

```
         ┌────────────┐    applyMovement()    ┌──────────────────┐
 Receipt ─►            ├──────────────────────► stock_ledger row  │ (append-only)
Delivery ─►   YOUR     │                       └──────────────────┘
Transfer ─►  MODULE    │    same transaction   ┌──────────────────┐
   Adj.  ─►            ├──────────────────────► stock_current     │ (upserted)
         └────────────┘                        └──────────────────┘
```

### Why quantities are always positive

Direction is expressed via `location_from_id → location_to_id`, never via sign.

- `+100` from `Vendor → Main Store` = a receipt of 100 units.
- `+100` from `Main Store → Customer` = a delivery of 100 units.
- Signed quantities (`-100`) are forbidden — they obscure intent and make running-balance queries fragile.

This is enforced at three levels:

| Level | Mechanism |
|---|---|
| Engine | `applyMovement()` throws if `quantity ≤ 0` |
| DB constraint | `CHECK (quantity > 0)` on `stock_ledger` |
| DB constraint | `CHECK (quantity >= 0)` on `stock_current` |

---

## The Three Virtual Locations

These are seeded with **fixed, well-known IDs** and exported as constants:

```js
// src/config/constants.js
const VIRTUAL_LOCATIONS = {
  VENDOR:               1,   // Infinite source for receipts
  CUSTOMER:             2,   // Infinite sink for deliveries
  INVENTORY_ADJUSTMENT: 3,   // Counterpart for physical count adjustments
};
```

Import this constant file — **never hardcode `1`, `2`, `3` directly**:

```js
const { VIRTUAL_LOCATIONS } = require('../config/constants');
```

**Why virtual?** These locations have no physical warehouse. The engine skips balance checks for them (a Vendor can always supply; a Customer can always receive) and never tracks their stock in `stock_current`.

---

## How to Call `applyMovement()`

```js
const { applyMovement } = require('../engine/applyMovement');
const { VIRTUAL_LOCATIONS } = require('../config/constants');

// Receipt (Vendor → internal location)
const ledgerEntry = await applyMovement({
  productId:        5,
  locationFromId:   VIRTUAL_LOCATIONS.VENDOR,
  locationToId:     destinationLocationId,
  quantity:         100,             // always positive
  movementType:    'receipt',
  referenceDocType: 'receipt',
  referenceDocId:   receiptId,
  createdBy:        req.user.id,
});

// Delivery (internal location → Customer)
await applyMovement({
  productId:       5,
  locationFromId:  sourceLocationId,
  locationToId:    VIRTUAL_LOCATIONS.CUSTOMER,
  quantity:        40,
  movementType:   'delivery',
  referenceDocType: 'delivery',
  referenceDocId:  deliveryId,
  createdBy:       req.user.id,
});

// Transfer (location A → location B)
await applyMovement({
  productId:       5,
  locationFromId:  locationA,
  locationToId:    locationB,
  quantity:        25,
  movementType:   'transfer',
  referenceDocType: 'transfer',
  referenceDocId:  transferId,
  createdBy:       req.user.id,
});

// Adjustment — negative diff (system has more than physical count)
// location_from = actual location, location_to = Inventory Adjustment
await applyMovement({
  productId:       5,
  locationFromId:  locationId,
  locationToId:    VIRTUAL_LOCATIONS.INVENTORY_ADJUSTMENT,
  quantity:        Math.abs(difference),   // always positive
  movementType:   'adjustment',
  referenceDocType: 'adjustment',
  referenceDocId:  adjustmentId,
  createdBy:       req.user.id,
});

// Adjustment — positive diff (physical has more than system)
// location_from = Inventory Adjustment, location_to = actual location
await applyMovement({
  productId:       5,
  locationFromId:  VIRTUAL_LOCATIONS.INVENTORY_ADJUSTMENT,
  locationToId:    locationId,
  quantity:        Math.abs(difference),
  movementType:   'adjustment',
  ...
});
```

### Error codes thrown by `applyMovement()`

| code | HTTP | Meaning |
|---|---|---|
| `INSUFFICIENT_STOCK` | 409 | Not enough stock at the from-location |
| `INVALID_PRODUCT` | 404 | Product ID doesn't exist |
| `INVALID_LOCATION` | 404 | Location ID doesn't exist |
| `VALIDATION_ERROR` | 400 | quantity ≤ 0 or not a number |

The `errorHandler` middleware automatically maps these to the right HTTP status code.

---

## Table Relationships

```
warehouses ──< locations >── stock_current >── products
                                                  │
                                             stock_ledger
                                          (location_from_id,
                                           location_to_id)
```

- `stock_ledger` uses **two FK columns** to `locations` (from and to), not a sign.
- `stock_current` has a **unique constraint** on `(product_id, location_id)` and a `CHECK (quantity >= 0)`.
- `products.deleted_at` enables **soft delete** — archived products are excluded from the default scope but their ledger history is preserved.

---

## The `running_balance` Computation

The `running_balance` field in `LedgerEntry` is **computed server-side** — not stored:

```
For each ledger entry in chronological order:
  if location_to is internal (not virtual): balance += quantity
  if location_from is internal (not virtual): balance -= quantity
```

This is intentional — computing it from the ledger guarantees it matches the source of truth.

---

## What Is NOT In This Module

The following are intentionally **out of scope** for this core module:

- Receipts (`/api/receipts`) — separate agent
- Deliveries (`/api/deliveries`) — separate agent
- Internal Transfers (`/api/transfers`) — separate agent
- Adjustments (`/api/adjustments`) — separate agent
- Dashboard (`/api/dashboard`) — separate agent
- OTP email flow — separate agent

All of these will call `applyMovement()` from this module. **They must never write to `stock_current` directly.**

---

## Assumptions Made (not covered by api-contract.md)

1. **`initial_stock` in `POST /api/products`** — seeded via an adjustment movement from `Inventory Adjustment` location to the first available internal location. The contract doesn't specify which location to target; we chose the first available internal location as a sensible default.

2. **`created_by` in ledger entries** — the contract shows `"created_by": "user_id_or_name"` without specifying the type. We store the integer user ID in the DB and return the user's name (string) in the API response.

3. **`running_balance` scope** — computed as total stock for the filtered product across all internal locations. For `GET /api/ledger` (multi-product), running_balance resets per entry since the balance is not product-scoped in that view.

4. **`total_stock` in Product object** — computed by summing `stock_current` for all non-virtual internal locations. Not stored redundantly in the `products` table.

5. **Auto-create default location on warehouse creation** — when `POST /api/warehouses` creates a warehouse, a `Main Store` location is auto-created. The contract doesn't specify this, but it makes the system usable immediately.

6. **Virtual locations are excluded from warehouse listings** — `GET /api/warehouses` only returns physical internal locations, not the system-wide virtual ones.
