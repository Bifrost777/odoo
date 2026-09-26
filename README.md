# StockSense — Backend API

Inventory Management System backend built with **Node.js + Express + PostgreSQL + Sequelize**.

---

## Quick Start

### Prerequisites
- Node.js v18+
- PostgreSQL running locally

### 1. Install dependencies
```bash
npm install
```

### 2. Configure environment
```bash
copy .env.example .env
# Edit .env — set DB_PASSWORD to your PostgreSQL password
```

### 3. Create the database
```bash
psql -U postgres -c "CREATE DATABASE stocksense_db;"
```

### 4. Run migrations
```bash
npm run migrate
```

### 5. Seed data
```bash
npm run seed
```

### 6. Start the dev server
```bash
npm run dev
```

Server runs at `http://localhost:5000`.

### One-shot setup (migrate + seed)
```bash
npm run db:setup
```

---

## Sample cURL Requests

> Replace `TOKEN` with the JWT returned by login/signup.

### Auth

**Signup**
```bash
curl -X POST http://localhost:5000/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"name":"John Doe","email":"john@example.com","password":"Secret@123"}'
```

**Login**
```bash
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@stocksense.dev","password":"Admin@1234"}'
```

**Get current user**
```bash
curl http://localhost:5000/api/auth/me \
  -H "Authorization: Bearer TOKEN"
```

---

### Products

**List all products**
```bash
curl http://localhost:5000/api/products \
  -H "Authorization: Bearer TOKEN"
```

**Search products**
```bash
curl "http://localhost:5000/api/products?search=steel" \
  -H "Authorization: Bearer TOKEN"
```

**Filter low-stock products**
```bash
curl "http://localhost:5000/api/products?low_stock=true" \
  -H "Authorization: Bearer TOKEN"
```

**Filter by category**
```bash
curl "http://localhost:5000/api/products?category_id=1" \
  -H "Authorization: Bearer TOKEN"
```

**Filter by warehouse**
```bash
curl "http://localhost:5000/api/products?warehouse_id=1" \
  -H "Authorization: Bearer TOKEN"
```

**Create a product**
```bash
curl -X POST http://localhost:5000/api/products \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Copper Wire",
    "sku": "COP-007",
    "category_id": 1,
    "unit_of_measure": "meters",
    "reorder_point": 100,
    "reorder_qty": 500,
    "initial_stock": 1000
  }'
```

**Get single product with stock by location**
```bash
curl http://localhost:5000/api/products/1 \
  -H "Authorization: Bearer TOKEN"
```

**Update product**
```bash
curl -X PUT http://localhost:5000/api/products/1 \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"reorder_point": 75, "reorder_qty": 250}'
```

**Archive (soft delete) product**
```bash
curl -X DELETE http://localhost:5000/api/products/1 \
  -H "Authorization: Bearer TOKEN"
```

**Get product ledger with running balance**
```bash
curl http://localhost:5000/api/products/1/ledger \
  -H "Authorization: Bearer TOKEN"
```

---

### Categories

**List all categories**
```bash
curl http://localhost:5000/api/categories \
  -H "Authorization: Bearer TOKEN"
```

**Create a category**
```bash
curl -X POST http://localhost:5000/api/categories \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name": "Fasteners", "parent_id": 1}'
```

---

### Warehouses & Locations

**List warehouses with their locations**
```bash
curl http://localhost:5000/api/warehouses \
  -H "Authorization: Bearer TOKEN"
```

**Create a warehouse**
```bash
curl -X POST http://localhost:5000/api/warehouses \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name": "Northern Hub", "code": "WH-03"}'
```

**Add a location to a warehouse**
```bash
curl -X POST http://localhost:5000/api/warehouses/1/locations \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name": "Overflow Bay", "code": "WH01-OVF"}'
```

---

### Stock Ledger

**Get all ledger entries**
```bash
curl http://localhost:5000/api/ledger \
  -H "Authorization: Bearer TOKEN"
```

**Filter by product**
```bash
curl "http://localhost:5000/api/ledger?product_id=1" \
  -H "Authorization: Bearer TOKEN"
```

**Filter by movement type**
```bash
curl "http://localhost:5000/api/ledger?movement_type=receipt" \
  -H "Authorization: Bearer TOKEN"
```

**Filter by date range**
```bash
curl "http://localhost:5000/api/ledger?from_date=2026-09-01&to_date=2026-09-30" \
  -H "Authorization: Bearer TOKEN"
```

**Filter by location**
```bash
curl "http://localhost:5000/api/ledger?location_id=4" \
  -H "Authorization: Bearer TOKEN"
```

---

## Project Structure

```
stocksense/
├── server.js                   # Entry point
├── seed.js                     # npm run seed
├── ARCHITECTURE.md             # Ledger design + applyMovement() guide
├── .env / .env.example
├── .sequelizerc                # CLI config paths
└── src/
    ├── app.js                  # Express app + routes
    ├── config/
    │   ├── sequelize.js        # Sequelize instance (reads .env)
    │   ├── database.json       # Sequelize CLI config
    │   └── constants.js        # ★ VIRTUAL_LOCATIONS fixed IDs
    ├── engine/
    │   └── applyMovement.js    # ★ THE ONLY CODE THAT WRITES stock_current
    ├── models/
    │   ├── index.js            # Registry + all associations
    │   ├── Warehouse.js
    │   ├── Location.js
    │   ├── Category.js
    │   ├── User.js
    │   ├── Product.js
    │   ├── StockCurrent.js
    │   └── StockLedger.js
    ├── migrations/
    │   ├── 20260926000001-create-warehouses.js
    │   ├── 20260926000002-create-locations.js
    │   ├── 20260926000003-create-categories.js
    │   ├── 20260926000004-create-users.js
    │   ├── 20260926000005-create-products.js
    │   ├── 20260926000006-create-stock-current.js
    │   └── 20260926000007-create-stock-ledger.js
    ├── controllers/
    │   ├── authController.js
    │   ├── productController.js
    │   ├── categoryController.js
    │   ├── warehouseController.js
    │   └── ledgerController.js
    ├── routes/
    │   ├── auth.js
    │   ├── products.js
    │   ├── categories.js
    │   ├── warehouses.js
    │   └── ledger.js
    └── middleware/
        ├── auth.js             # JWT verify
        └── errorHandler.js     # Maps engine codes → HTTP status
```

---

## Virtual Location IDs (For Other Module Agents)

```js
const { VIRTUAL_LOCATIONS } = require('./src/config/constants');
// { VENDOR: 1, CUSTOMER: 2, INVENTORY_ADJUSTMENT: 3 }
```

These IDs are **fixed** — seeded with explicit `INSERT ... ON CONFLICT DO NOTHING`.

**Never hardcode the numbers 1, 2, 3 — always import the constant.**

---

## npm Scripts

| Command | Action |
|---|---|
| `npm run dev` | Start with nodemon (hot reload) |
| `npm start` | Start in production mode |
| `npm run migrate` | Run all pending migrations |
| `npm run migrate:undo` | Roll back all migrations |
| `npm run seed` | Seed warehouses, products, ledger history |
| `npm run db:setup` | migrate + seed in one command |
