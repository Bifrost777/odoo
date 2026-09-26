# StockSense — API Contract

This is the single source of truth for endpoint shapes, field names, and enums.
Every backend and frontend agent/teammate should build against THIS document,
not their own assumptions. If something needs to change, update this file first,
then tell the team.

**Response envelope (all endpoints):**
```json
// success
{ "success": true, "data": { ... } }
// error
{ "success": false, "error": "Human readable message" }
```

**Auth:** Bearer token in `Authorization` header after login, unless noted public.

---

## 1. Auth

### POST /api/auth/signup
Request: `{ "name": "string", "email": "string", "password": "string" }`
Response: `{ "user": { "id", "name", "email" }, "token": "jwt" }`

### POST /api/auth/login
Request: `{ "email": "string", "password": "string" }`
Response: `{ "user": {...}, "token": "jwt" }`

### POST /api/auth/otp/request
Request: `{ "email": "string" }`
Response: `{ "message": "OTP sent" }`

### POST /api/auth/otp/verify-reset
Request: `{ "email": "string", "otp": "string", "new_password": "string" }`
Response: `{ "message": "Password reset successful" }`

### GET /api/auth/me
Response: `{ "id", "name", "email" }`

---

## 2. Products

### Product object shape
```json
{
  "id": 1,
  "name": "Steel Rods",
  "sku": "STL-001",
  "category_id": 2,
  "category_name": "Raw Materials",
  "unit_of_measure": "kg",
  "reorder_point": 50,
  "reorder_qty": 200,
  "total_stock": 340,
  "created_at": "2026-09-01T10:00:00Z"
}
```

### POST /api/products
Request: `{ "name", "sku", "category_id", "unit_of_measure", "reorder_point"?, "reorder_qty"?, "initial_stock"? }`
Response: Product object

### GET /api/products
Query params: `?search=`, `?category_id=`, `?low_stock=true`, `?warehouse_id=`
Response: `{ "products": [Product], "total": 42 }`

### GET /api/products/:id
Response: Product object + `"stock_by_location": [{ "location_id", "location_name", "warehouse_id", "quantity" }]`

### PUT /api/products/:id
Request: partial Product fields
Response: updated Product object

### DELETE /api/products/:id
Response: `{ "message": "Product archived" }` (soft delete)

### GET /api/products/:id/ledger
Response: `{ "entries": [LedgerEntry], "running_balance_included": true }`

### GET /api/categories
Response: `{ "categories": [{ "id", "name", "parent_id" }] }`

### POST /api/categories
Request: `{ "name", "parent_id"? }`

---

## 3. Warehouses & Locations

### Warehouse object
```json
{ "id": 1, "name": "Main Warehouse", "code": "WH-01",
  "locations": [{ "id", "name", "code", "is_internal": true }] }
```

### GET /api/warehouses
Response: `{ "warehouses": [Warehouse] }`

### POST /api/warehouses
Request: `{ "name", "code" }`

### POST /api/warehouses/:id/locations
Request: `{ "name", "code" }`
Response: Location object

---

## 4. Stock Ledger (internal engine + read API)

### LedgerEntry object shape (returned by all read endpoints)
```json
{
  "id": 101,
  "product_id": 5,
  "product_name": "Steel Rods",
  "location_from_id": 1,
  "location_from_name": "Vendor",
  "location_to_id": 3,
  "location_to_name": "Main Store",
  "quantity": 100,
  "movement_type": "receipt",
  "reference_doc_type": "receipt",
  "reference_doc_id": 12,
  "status": "done",
  "created_by": "user_id_or_name",
  "created_at": "2026-09-26T09:00:00Z",
  "running_balance": 340
}
```

**movement_type enum:** `receipt | delivery | transfer | adjustment`
**status enum:** `draft | waiting | ready | done | cancelled`

Virtual locations (seeded, fixed IDs used by the engine):
- `Vendor` — source for receipts
- `Customer` — destination for deliveries
- `Inventory Adjustment` — counterpart for adjustment entries

### GET /api/ledger
Query params: `?product_id=`, `?location_id=`, `?movement_type=`, `?from_date=`, `?to_date=`
Response: `{ "entries": [LedgerEntry], "total": n }`

**Internal engine contract (backend-only, not HTTP):**
```
applyMovement({ productId, locationFromId, locationToId, quantity,
                 movementType, referenceDocType, referenceDocId })
→ returns created LedgerEntry
→ throws { code: "INSUFFICIENT_STOCK" | "INVALID_LOCATION" | "INVALID_PRODUCT", message }
```
Every module below (Receipts, Deliveries, Transfers, Adjustments) calls this
function on document validation — never writes stock directly.

---

## 5. Receipts (Incoming Stock)

### Receipt object
```json
{
  "id": 12,
  "supplier_name": "Acme Steel Co.",
  "warehouse_id": 1,
  "destination_location_id": 3,
  "status": "draft",
  "lines": [
    { "id", "product_id", "product_name", "quantity", "unit_of_measure" }
  ],
  "created_at": "..."
}
```

### POST /api/receipts
Request: `{ "supplier_name", "warehouse_id", "destination_location_id", "lines": [{ "product_id", "quantity" }] }`
Response: Receipt object, status `draft`

### GET /api/receipts
Query: `?status=`, `?warehouse_id=`
Response: `{ "receipts": [Receipt] }`

### GET /api/receipts/:id
Response: Receipt object

### PUT /api/receipts/:id
Request: updated `lines` / supplier info (only if status is `draft` or `waiting`)

### POST /api/receipts/:id/validate
Effect: for each line, calls `applyMovement` with `movementType: "receipt"`,
`location_from_id: Vendor`, `location_to_id: destination_location_id`.
Sets Receipt status → `done`.
Response: updated Receipt + created ledger entries

### POST /api/receipts/:id/cancel
Response: Receipt with status `cancelled` (only allowed pre-`done`)

---

## 6. Delivery Orders (Outgoing Stock)

### Delivery object
```json
{
  "id": 8,
  "customer_name": "John's Furniture",
  "warehouse_id": 1,
  "source_location_id": 3,
  "status": "draft",
  "lines": [{ "id", "product_id", "product_name", "quantity" }],
  "created_at": "..."
}
```

### POST /api/deliveries
Request: `{ "customer_name", "warehouse_id", "source_location_id", "lines": [{ "product_id", "quantity" }] }`
Response: Delivery object, status `draft`

### GET /api/deliveries
Query: `?status=`, `?warehouse_id=`

### GET /api/deliveries/:id

### POST /api/deliveries/:id/pick
Sets status → `waiting` (no stock change)

### POST /api/deliveries/:id/pack
Sets status → `ready` (no stock change)

### POST /api/deliveries/:id/validate
Effect: for each line, calls `applyMovement` with `movementType: "delivery"`,
`location_from_id: source_location_id`, `location_to_id: Customer`.
Throws `INSUFFICIENT_STOCK` if not enough on hand.
Sets status → `done`.

### POST /api/deliveries/:id/cancel

---

## 7. Internal Transfers

### Transfer object
```json
{
  "id": 5,
  "product_id": 5,
  "product_name": "Steel Rods",
  "location_from_id": 3,
  "location_to_id": 4,
  "quantity": 100,
  "status": "draft",
  "created_at": "..."
}
```

### POST /api/transfers
Request: `{ "product_id", "location_from_id", "location_to_id", "quantity" }`
Response: Transfer object, status `draft`

### GET /api/transfers
Query: `?status=`, `?warehouse_id=`

### POST /api/transfers/:id/validate
Effect: calls `applyMovement` with `movementType: "transfer"` using the
transfer's own from/to locations. Sets status → `done`.

### POST /api/transfers/:id/cancel

---

## 8. Stock Adjustments

### Adjustment object
```json
{
  "id": 3,
  "product_id": 5,
  "location_id": 4,
  "counted_quantity": 97,
  "system_quantity": 100,
  "difference": -3,
  "reason": "Damaged goods",
  "status": "draft",
  "created_at": "..."
}
```

### POST /api/adjustments
Request: `{ "product_id", "location_id", "counted_quantity", "reason"? }`
Backend computes `system_quantity` from `stock_current` and `difference`.
Response: Adjustment object, status `draft`

### GET /api/adjustments
Query: `?status=`, `?location_id=`

### POST /api/adjustments/:id/validate
Effect: if `difference` is negative, calls `applyMovement` with
`movementType: "adjustment"`, `location_from_id: location_id`,
`location_to_id: Inventory Adjustment`, `quantity: abs(difference)`.
If positive, reverse direction. Sets status → `done`.

---

## 9. Dashboard

### GET /api/dashboard/summary
Response:
```json
{
  "total_products": 42,
  "low_stock_count": 3,
  "out_of_stock_count": 1,
  "pending_receipts": 2,
  "pending_deliveries": 4,
  "scheduled_transfers": 1
}
```

### GET /api/dashboard/documents
Query: `?doc_type=receipt|delivery|transfer|adjustment`, `?status=`, `?warehouse_id=`, `?category_id=`
Response: `{ "documents": [{ "id", "doc_type", "reference", "status", "created_at" }] }`
(Powers the dynamic filter panel — one unified feed across all document types.)

---

## Enum quick reference

| Enum | Values |
|---|---|
| movement_type | receipt, delivery, transfer, adjustment |
| document status | draft, waiting, ready, done, cancelled |

## Field naming conventions (keep consistent everywhere)
- IDs: `product_id`, `location_id`, `warehouse_id` (never `productId` in JSON)
- Timestamps: `created_at`, ISO 8601
- Quantities: always positive numbers; direction lives in from/to fields, never in sign
