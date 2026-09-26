'use strict';
/**
 * Comprehensive Test Suite for StockSense API
 * Tests all endpoints, auth, CRUD, edge cases, error cases, and core ledger workflows.
 */

const BASE_URL = 'http://localhost:5000';

let authToken = '';
let testUserId = null;
let createdCategoryId = null;
let createdWarehouseId = null;
let createdLocationId = null;
let createdProductId = null;

let passed = 0;
let failed = 0;
const results = [];

function assert(condition, message) {
  if (condition) {
    passed++;
    console.log(`  ✅ PASS: ${message}`);
    results.push({ message, status: 'PASS' });
  } else {
    failed++;
    console.error(`  ❌ FAIL: ${message}`);
    results.push({ message, status: 'FAIL' });
  }
}

async function request(path, options = {}) {
  const url = `${BASE_URL}${path}`;
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (authToken && !headers.Authorization) {
    headers.Authorization = `Bearer ${authToken}`;
  }

  const res = await fetch(url, {
    method: options.method || 'GET',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  let data = null;
  try {
    data = await res.json();
  } catch (e) {
    // not JSON
  }

  return { status: res.status, ok: res.ok, data };
}

async function runTests() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('   🚀 RUNNING STOCKSENSE ENDPOINT & WORKFLOW TESTS      ');
  console.log('═══════════════════════════════════════════════════════\n');

  // ─────────────────────────────────────────────────────────────
  // 1. HEALTH & PUBLIC STUBS
  // ─────────────────────────────────────────────────────────────
  console.log('── Section 1: Health & Public Endpoints ──');
  {
    const res = await request('/api/health');
    assert(res.status === 200 && res.data.success === true && res.data.data.status === 'ok', 'GET /api/health returns status ok');

    const res404 = await request('/api/non-existent-endpoint');
    assert(res404.status === 404 && res404.data.success === false, 'Unknown route returns 404 envelope');

    const otpReq = await request('/api/auth/otp/request', { method: 'POST', body: { email: 'user@example.com' } });
    assert(otpReq.status === 200 && otpReq.data.data.message === 'OTP sent', 'POST /api/auth/otp/request stubs OTP send');

    const otpReset = await request('/api/auth/otp/verify-reset', { method: 'POST', body: { email: 'user@example.com', otp: '123456', new_password: 'new' } });
    assert(otpReset.status === 200 && otpReset.data.data.message === 'Password reset successful', 'POST /api/auth/otp/verify-reset stubs reset');
  }

  // ─────────────────────────────────────────────────────────────
  // 2. AUTH WORKFLOWS
  // ─────────────────────────────────────────────────────────────
  console.log('\n── Section 2: Auth Endpoints & Token Security ──');
  {
    // Unauthorized access
    const noAuth = await request('/api/auth/me');
    assert(noAuth.status === 401, 'GET /api/auth/me rejects missing Authorization header');

    // Invalid login
    const badLogin = await request('/api/auth/login', {
      method: 'POST',
      body: { email: 'wrong@stocksense.dev', password: 'bad' },
    });
    assert(badLogin.status === 401 && badLogin.data.success === false, 'POST /api/auth/login rejects wrong credentials');

    // Admin login
    const adminLogin = await request('/api/auth/login', {
      method: 'POST',
      body: { email: 'admin@stocksense.dev', password: 'Admin@1234' },
    });
    assert(adminLogin.status === 200 && adminLogin.data.data.token, 'POST /api/auth/login succeeds for seeded admin');

    // Sign up a new unique user
    const uniqueEmail = `test_${Date.now()}@stocksense.dev`;
    const signupRes = await request('/api/auth/signup', {
      method: 'POST',
      body: { name: 'Test Operator', email: uniqueEmail, password: 'SecurePassword@123' },
    });
    assert(signupRes.status === 201 && signupRes.data.data.token, 'POST /api/auth/signup registers new operator and returns JWT');
    authToken = signupRes.data.data.token;
    testUserId = signupRes.data.data.user.id;

    // Duplicate signup conflict
    const dupSignup = await request('/api/auth/signup', {
      method: 'POST',
      body: { name: 'Duplicate Operator', email: uniqueEmail, password: 'SecurePassword@123' },
    });
    assert(dupSignup.status === 409, 'POST /api/auth/signup rejects duplicate email with 409 Conflict');

    // Verify /api/auth/me with new token
    const meRes = await request('/api/auth/me');
    assert(meRes.status === 200 && meRes.data.data.email === uniqueEmail, 'GET /api/auth/me returns current user info');
  }

  // ─────────────────────────────────────────────────────────────
  // 3. CATEGORIES WORKFLOW
  // ─────────────────────────────────────────────────────────────
  console.log('\n── Section 3: Categories Endpoints ──');
  {
    const getCats = await request('/api/categories');
    assert(getCats.status === 200 && Array.isArray(getCats.data.data.categories) && getCats.data.data.categories.length >= 3, 'GET /api/categories returns category list');

    // Validation: missing name
    const badCat = await request('/api/categories', { method: 'POST', body: {} });
    assert(badCat.status === 400, 'POST /api/categories rejects missing name');

    // Invalid parent_id
    const badParent = await request('/api/categories', { method: 'POST', body: { name: 'Invalid Child', parent_id: 99999 } });
    assert(badParent.status === 404, 'POST /api/categories rejects non-existent parent_id with 404');

    // Create root category
    const catName = `Hardware_${Date.now()}`;
    const createCat = await request('/api/categories', { method: 'POST', body: { name: catName } });
    assert(createCat.status === 201 && createCat.data.data.name === catName, 'POST /api/categories creates new category');
    createdCategoryId = createCat.data.data.id;

    // Create subcategory
    const subCat = await request('/api/categories', { method: 'POST', body: { name: 'Fasteners', parent_id: createdCategoryId } });
    assert(subCat.status === 201 && subCat.data.data.parent_id === createdCategoryId, 'POST /api/categories creates subcategory with parent_id');
  }

  // ─────────────────────────────────────────────────────────────
  // 4. WAREHOUSES & LOCATIONS WORKFLOW
  // ─────────────────────────────────────────────────────────────
  console.log('\n── Section 4: Warehouses & Locations Endpoints ──');
  {
    const getWhs = await request('/api/warehouses');
    assert(getWhs.status === 200 && Array.isArray(getWhs.data.data.warehouses) && getWhs.data.data.warehouses.length >= 2, 'GET /api/warehouses returns list with nested locations');

    // Duplicate code rejection
    const dupWh = await request('/api/warehouses', { method: 'POST', body: { name: 'Conflict WH', code: 'WH-01' } });
    assert(dupWh.status === 409, 'POST /api/warehouses rejects duplicate warehouse code with 409');

    // Create new warehouse
    const whCode = `WH-${Date.now().toString().slice(-4)}`;
    const createWh = await request('/api/warehouses', { method: 'POST', body: { name: 'Northern Hub', code: whCode } });
    assert(createWh.status === 201 && createWh.data.data.locations.length >= 1, 'POST /api/warehouses creates warehouse and auto-generates default location');
    createdWarehouseId = createWh.data.data.id;

    // Create custom location inside warehouse
    const createLoc = await request(`/api/warehouses/${createdWarehouseId}/locations`, {
      method: 'POST',
      body: { name: 'Aisle 3 Shelf B', code: `${whCode}-A3B` },
    });
    assert(createLoc.status === 201 && createLoc.data.data.warehouse_id === createdWarehouseId, 'POST /api/warehouses/:id/locations adds internal location');
    createdLocationId = createLoc.data.data.id;

    // Location under invalid warehouse
    const badWhLoc = await request('/api/warehouses/99999/locations', {
      method: 'POST',
      body: { name: 'Ghost Location', code: 'GHOST-01' },
    });
    assert(badWhLoc.status === 404, 'POST /api/warehouses/99999/locations returns 404 for invalid warehouse ID');
  }

  // ─────────────────────────────────────────────────────────────
  // 5. PRODUCTS WORKFLOW (CRUD, Stock Engine Integration, Queries)
  // ─────────────────────────────────────────────────────────────
  console.log('\n── Section 5: Products Endpoints & Inventory Integrations ──');
  {
    // List seeded products
    const getProds = await request('/api/products');
    assert(getProds.status === 200 && Array.isArray(getProds.data.data.products) && getProds.data.data.total >= 6, 'GET /api/products returns products list with total');

    // Check Steel Rods total_stock (500 received - 60 delivered = 440 kg)
    const steelRods = getProds.data.data.products.find(p => p.sku === 'STL-001');
    assert(steelRods && steelRods.total_stock === 440, `Steel Rods total_stock is correctly computed as 440 (actual: ${steelRods?.total_stock})`);

    // Search query filter
    const searchRes = await request('/api/products?search=motor');
    assert(searchRes.status === 200 && searchRes.data.data.products.some(p => p.sku === 'ELC-005'), 'GET /api/products?search=motor returns matching product');

    // Category query filter
    const catProds = await request('/api/products?category_id=1');
    assert(catProds.status === 200 && catProds.data.data.products.every(p => p.category_id === 1), 'GET /api/products?category_id=1 filters correctly');

    // Low stock filter
    const lowStock = await request('/api/products?low_stock=true');
    assert(lowStock.status === 200, 'GET /api/products?low_stock=true executes without error');

    // Create new product with initial_stock = 75
    const sku = `COP-${Date.now().toString().slice(-4)}`;
    const createProd = await request('/api/products', {
      method: 'POST',
      body: {
        name: 'Copper Wire 2.5mm',
        sku,
        category_id: createdCategoryId,
        unit_of_measure: 'meters',
        reorder_point: 20,
        reorder_qty: 100,
        initial_stock: 75,
      },
    });
    assert(createProd.status === 201 && createProd.data.data.sku === sku && createProd.data.data.total_stock === 75,
      `POST /api/products creates product and auto-seeds initial_stock to 75 (total_stock: ${createProd.data.data?.total_stock})`);
    createdProductId = createProd.data.data.id;

    // Duplicate SKU
    const dupSku = await request('/api/products', {
      method: 'POST',
      body: { name: 'Dup Copper', sku, unit_of_measure: 'meters' },
    });
    assert(dupSku.status === 409, 'POST /api/products rejects duplicate SKU with 409');

    // Single product detail with stock_by_location
    const prodDetail = await request(`/api/products/${createdProductId}`);
    assert(prodDetail.status === 200 && Array.isArray(prodDetail.data.data.stock_by_location) && prodDetail.data.data.stock_by_location.length >= 1,
      'GET /api/products/:id includes stock_by_location breakdown');

    // Update product
    const updateRes = await request(`/api/products/${createdProductId}`, {
      method: 'PUT',
      body: { name: 'Copper Wire 2.5mm Heavy Duty', reorder_point: 35 },
    });
    assert(updateRes.status === 200 && updateRes.data.data.name === 'Copper Wire 2.5mm Heavy Duty' && updateRes.data.data.reorder_point === 35,
      'PUT /api/products/:id updates product details');

    // Product ledger with running balance
    const prodLedger = await request(`/api/products/${createdProductId}/ledger`);
    assert(prodLedger.status === 200 && prodLedger.data.data.running_balance_included === true && prodLedger.data.data.entries.length >= 1,
      'GET /api/products/:id/ledger returns ledger entries with running_balance_included: true');
    assert(prodLedger.data.data.entries[0].running_balance === 75, `Initial entry running balance matches 75 (actual: ${prodLedger.data.data.entries[0].running_balance})`);

    // Soft delete (archive) product
    const archiveRes = await request(`/api/products/${createdProductId}`, { method: 'DELETE' });
    assert(archiveRes.status === 200 && archiveRes.data.data.message === 'Product archived', 'DELETE /api/products/:id soft-deletes (archives) product');

    // Archived product should not appear in default list
    const postArchiveList = await request('/api/products');
    assert(!postArchiveList.data.data.products.some(p => p.id === createdProductId), 'Archived product is omitted from GET /api/products');

    // Direct access to archived product should return 404
    const getArchived = await request(`/api/products/${createdProductId}`);
    assert(getArchived.status === 404, 'GET /api/products/:id on archived product returns 404');
  }

  // ─────────────────────────────────────────────────────────────
  // 6. GENERAL LEDGER ENDPOINTS & FILTERING
  // ─────────────────────────────────────────────────────────────
  console.log('\n── Section 6: Stock Ledger Endpoints ──');
  {
    const ledgerRes = await request('/api/ledger');
    assert(ledgerRes.status === 200 && Array.isArray(ledgerRes.data.data.entries) && ledgerRes.data.data.total >= 10,
      `GET /api/ledger returns complete audit trail (total: ${ledgerRes.data.data.total})`);

    // Filter by movement_type
    const receiptLedger = await request('/api/ledger?movement_type=receipt');
    assert(receiptLedger.status === 200 && receiptLedger.data.data.entries.every(e => e.movement_type === 'receipt'),
      'GET /api/ledger?movement_type=receipt filters entries by type');

    // Filter by product_id
    const prod1Ledger = await request('/api/ledger?product_id=1');
    assert(prod1Ledger.status === 200 && prod1Ledger.data.data.entries.every(e => e.product_id === 1),
      'GET /api/ledger?product_id=1 filters entries by product');
  }

  // ─────────────────────────────────────────────────────────────
  // 7. CORE ENGINE TESTS (applyMovement & Constraints)
  // ─────────────────────────────────────────────────────────────
  console.log('\n── Section 7: Core Movement Engine & Concurrency ──');
  {
    const { applyMovement } = require('./src/engine/applyMovement');
    const { VIRTUAL_LOCATIONS } = require('./src/config/constants');

    // Transfer movement
    try {
      const transferEntry = await applyMovement({
        productId: 1, // Steel Rods
        locationFromId: 4, // Main Store
        locationToId: 5,   // Raw Materials Bay
        quantity: 15,
        movementType: 'transfer',
        createdBy: testUserId,
      });
      assert(transferEntry && transferEntry.movement_type === 'transfer' && transferEntry.quantity === 15,
        'applyMovement executes transfer between two internal locations');
    } catch (e) {
      assert(false, `applyMovement transfer failed: ${e.message}`);
    }

    // Negative stock guard
    try {
      await applyMovement({
        productId: 1,
        locationFromId: 4,
        locationToId: VIRTUAL_LOCATIONS.CUSTOMER,
        quantity: 999999, // Impossible amount
        movementType: 'delivery',
      });
      assert(false, 'applyMovement allowed overdraft (should have failed)');
    } catch (err) {
      assert(err.code === 'INSUFFICIENT_STOCK', `applyMovement blocks overdraft with INSUFFICIENT_STOCK (code: ${err.code})`);
    }

    // Invalid product guard
    try {
      await applyMovement({
        productId: 999999,
        locationFromId: 4,
        locationToId: 5,
        quantity: 10,
        movementType: 'transfer',
      });
      assert(false, 'applyMovement allowed invalid product');
    } catch (err) {
      assert(err.code === 'INVALID_PRODUCT', `applyMovement blocks non-existent product with INVALID_PRODUCT (code: ${err.code})`);
    }

    // Invalid location guard
    try {
      await applyMovement({
        productId: 1,
        locationFromId: 999999,
        locationToId: 5,
        quantity: 10,
        movementType: 'transfer',
      });
      assert(false, 'applyMovement allowed invalid location');
    } catch (err) {
      assert(err.code === 'INVALID_LOCATION', `applyMovement blocks non-existent location with INVALID_LOCATION (code: ${err.code})`);
    }

    // Non-positive quantity guard
    try {
      await applyMovement({
        productId: 1,
        locationFromId: 4,
        locationToId: 5,
        quantity: -10,
        movementType: 'transfer',
      });
      assert(false, 'applyMovement allowed negative quantity');
    } catch (err) {
      assert(err.code === 'VALIDATION_ERROR', `applyMovement blocks non-positive quantity with VALIDATION_ERROR (code: ${err.code})`);
    }
  }

  // ─────────────────────────────────────────────────────────────
  // SUMMARY
  // ─────────────────────────────────────────────────────────────
  console.log('\n═══════════════════════════════════════════════════════');
  console.log(`   TEST RUN COMPLETED: ${passed} PASSED, ${failed} FAILED `);
  console.log('═══════════════════════════════════════════════════════\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Unexpected test runner error:', err);
  process.exit(1);
});
