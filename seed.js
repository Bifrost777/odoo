'use strict';
/**
 * ════════════════════════════════════════════════════════════════════════════
 * seed.js  —  Runnable via:  npm run seed
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Creates:
 *  - 3 virtual locations with FIXED IDs (Vendor=1, Customer=2, Adj=3)
 *  - 2 warehouses with 2-3 internal locations each
 *  - 2-3 categories
 *  - 5-6 products including "Steel Rods" (unit_of_measure: "kg")
 *  - A set of historical ledger entries via applyMovement()
 *
 * IDEMPOTENT: Running this script multiple times is safe — it skips rows
 * that already exist. However, the virtual location IDs MUST remain 1, 2, 3.
 */

require('dotenv').config();
const sequelize     = require('./src/config/sequelize');
const { Warehouse, Location, Category, User, Product, StockCurrent, StockLedger } = require('./src/models');
const { applyMovement } = require('./src/engine/applyMovement');
const { VIRTUAL_LOCATIONS } = require('./src/config/constants');
const bcrypt = require('bcryptjs');

async function seed() {
  try {
    await sequelize.authenticate();
    console.log('✅  DB connected');

    // ── 1. Virtual Locations (fixed IDs via raw INSERT with explicit id) ─────
    // We use a raw upsert to guarantee the IDs are EXACTLY 1, 2, 3.
    // Sequelize's bulkCreate with updateOnDuplicate handles idempotency.
    console.log('🌱  Seeding virtual locations...');
    await sequelize.query(`
      INSERT INTO locations (id, name, code, warehouse_id, is_internal, is_virtual, created_at, updated_at)
      VALUES
        (${VIRTUAL_LOCATIONS.VENDOR},              'Vendor',               'VIRT-VENDOR', NULL, false, true, NOW(), NOW()),
        (${VIRTUAL_LOCATIONS.CUSTOMER},            'Customer',             'VIRT-CUST',   NULL, false, true, NOW(), NOW()),
        (${VIRTUAL_LOCATIONS.INVENTORY_ADJUSTMENT},'Inventory Adjustment', 'VIRT-ADJ',    NULL, false, true, NOW(), NOW())
      ON CONFLICT (id) DO NOTHING;
    `);
    // Reset the sequence so future auto-increments don't conflict with IDs 1-3
    await sequelize.query(`SELECT setval(pg_get_serial_sequence('locations', 'id'), GREATEST(3, (SELECT MAX(id) FROM locations)))`);
    console.log('   ✓ Virtual locations: Vendor(1), Customer(2), Inventory Adjustment(3)');

    // ── 2. Warehouses ─────────────────────────────────────────────────────────
    console.log('🌱  Seeding warehouses...');
    const [wh1] = await Warehouse.findOrCreate({
      where: { code: 'WH-01' },
      defaults: { name: 'Main Warehouse', code: 'WH-01' },
    });
    const [wh2] = await Warehouse.findOrCreate({
      where: { code: 'WH-02' },
      defaults: { name: 'Secondary Warehouse', code: 'WH-02' },
    });
    console.log(`   ✓ Warehouses: ${wh1.name}(${wh1.id}), ${wh2.name}(${wh2.id})`);

    // ── 3. Internal Locations ─────────────────────────────────────────────────
    console.log('🌱  Seeding internal locations...');
    const [mainStore] = await Location.findOrCreate({
      where: { code: 'WH01-MAIN' },
      defaults: { name: 'Main Store', code: 'WH01-MAIN', warehouse_id: wh1.id, is_internal: true, is_virtual: false },
    });
    const [rawMat] = await Location.findOrCreate({
      where: { code: 'WH01-RAW' },
      defaults: { name: 'Raw Materials Bay', code: 'WH01-RAW', warehouse_id: wh1.id, is_internal: true, is_virtual: false },
    });
    const [finished] = await Location.findOrCreate({
      where: { code: 'WH01-FIN' },
      defaults: { name: 'Finished Goods', code: 'WH01-FIN', warehouse_id: wh1.id, is_internal: true, is_virtual: false },
    });
    const [sec1] = await Location.findOrCreate({
      where: { code: 'WH02-MAIN' },
      defaults: { name: 'Secondary Store', code: 'WH02-MAIN', warehouse_id: wh2.id, is_internal: true, is_virtual: false },
    });
    const [sec2] = await Location.findOrCreate({
      where: { code: 'WH02-COLD' },
      defaults: { name: 'Cold Storage', code: 'WH02-COLD', warehouse_id: wh2.id, is_internal: true, is_virtual: false },
    });
    console.log(`   ✓ Locations seeded`);

    // ── 4. Categories ─────────────────────────────────────────────────────────
    console.log('🌱  Seeding categories...');
    const [rawMatCat] = await Category.findOrCreate({
      where: { name: 'Raw Materials' },
      defaults: { name: 'Raw Materials', parent_id: null },
    });
    const [finishedCat] = await Category.findOrCreate({
      where: { name: 'Finished Goods' },
      defaults: { name: 'Finished Goods', parent_id: null },
    });
    const [electronicsCat] = await Category.findOrCreate({
      where: { name: 'Electronics' },
      defaults: { name: 'Electronics', parent_id: null },
    });
    console.log(`   ✓ Categories seeded`);

    // ── 5. Products ───────────────────────────────────────────────────────────
    console.log('🌱  Seeding products...');
    const [steelRods] = await Product.findOrCreate({
      where: { sku: 'STL-001' },
      defaults: {
        name: 'Steel Rods', sku: 'STL-001',
        category_id: rawMatCat.id, unit_of_measure: 'kg',
        reorder_point: 50, reorder_qty: 200,
      },
    });
    const [aluminumSheet] = await Product.findOrCreate({
      where: { sku: 'ALU-002' },
      defaults: {
        name: 'Aluminum Sheet', sku: 'ALU-002',
        category_id: rawMatCat.id, unit_of_measure: 'kg',
        reorder_point: 30, reorder_qty: 100,
      },
    });
    const [cementBag] = await Product.findOrCreate({
      where: { sku: 'CEM-003' },
      defaults: {
        name: 'Cement Bag 50kg', sku: 'CEM-003',
        category_id: rawMatCat.id, unit_of_measure: 'bags',
        reorder_point: 20, reorder_qty: 80,
      },
    });
    const [steelBeam] = await Product.findOrCreate({
      where: { sku: 'FIN-004' },
      defaults: {
        name: 'Steel Beam 6m', sku: 'FIN-004',
        category_id: finishedCat.id, unit_of_measure: 'pcs',
        reorder_point: 10, reorder_qty: 30,
      },
    });
    const [motor] = await Product.findOrCreate({
      where: { sku: 'ELC-005' },
      defaults: {
        name: 'Electric Motor 5HP', sku: 'ELC-005',
        category_id: electronicsCat.id, unit_of_measure: 'units',
        reorder_point: 5, reorder_qty: 15,
      },
    });
    const [sensor] = await Product.findOrCreate({
      where: { sku: 'ELC-006' },
      defaults: {
        name: 'Proximity Sensor', sku: 'ELC-006',
        category_id: electronicsCat.id, unit_of_measure: 'units',
        reorder_point: 15, reorder_qty: 50,
      },
    });
    console.log(`   ✓ 6 products seeded`);

    // ── 6. Admin User (for created_by fields) ─────────────────────────────────
    console.log('🌱  Seeding admin user...');
    const [adminUser] = await User.findOrCreate({
      where: { email: 'admin@stocksense.dev' },
      defaults: {
        name: 'Admin',
        email: 'admin@stocksense.dev',
        password_hash: await bcrypt.hash('Admin@1234', 12),
      },
    });
    console.log(`   ✓ Admin user: admin@stocksense.dev / Admin@1234`);

    // ── 7. Historical Ledger Entries ──────────────────────────────────────────
    // Check if we already have ledger entries (idempotency guard)
    const existingCount = await StockLedger.count();
    if (existingCount > 0) {
      console.log(`   ℹ  Ledger already has ${existingCount} entries — skipping historical seed`);
    } else {
      console.log('🌱  Seeding historical stock movements...');

      // Receipt 1: 500 kg Steel Rods from Vendor → Main Store
      await applyMovement({
        productId: steelRods.id, locationFromId: VIRTUAL_LOCATIONS.VENDOR,
        locationToId: mainStore.id, quantity: 500, movementType: 'receipt',
        referenceDocType: 'receipt', referenceDocId: 1, createdBy: adminUser.id,
      });

      // Receipt 2: 200 kg Aluminum Sheet from Vendor → Raw Materials Bay
      await applyMovement({
        productId: aluminumSheet.id, locationFromId: VIRTUAL_LOCATIONS.VENDOR,
        locationToId: rawMat.id, quantity: 200, movementType: 'receipt',
        referenceDocType: 'receipt', referenceDocId: 2, createdBy: adminUser.id,
      });

      // Receipt 3: 100 bags Cement from Vendor → Secondary Store
      await applyMovement({
        productId: cementBag.id, locationFromId: VIRTUAL_LOCATIONS.VENDOR,
        locationToId: sec1.id, quantity: 100, movementType: 'receipt',
        referenceDocType: 'receipt', referenceDocId: 3, createdBy: adminUser.id,
      });

      // Receipt 4: 50 Steel Beams from Vendor → Finished Goods
      await applyMovement({
        productId: steelBeam.id, locationFromId: VIRTUAL_LOCATIONS.VENDOR,
        locationToId: finished.id, quantity: 50, movementType: 'receipt',
        referenceDocType: 'receipt', referenceDocId: 4, createdBy: adminUser.id,
      });

      // Receipt 5: 30 Electric Motors from Vendor → Main Store
      await applyMovement({
        productId: motor.id, locationFromId: VIRTUAL_LOCATIONS.VENDOR,
        locationToId: mainStore.id, quantity: 30, movementType: 'receipt',
        referenceDocType: 'receipt', referenceDocId: 5, createdBy: adminUser.id,
      });

      // Receipt 6: 80 Proximity Sensors from Vendor → Secondary Store
      await applyMovement({
        productId: sensor.id, locationFromId: VIRTUAL_LOCATIONS.VENDOR,
        locationToId: sec1.id, quantity: 80, movementType: 'receipt',
        referenceDocType: 'receipt', referenceDocId: 6, createdBy: adminUser.id,
      });

      // Transfer: 100 kg Steel Rods from Main Store → Raw Materials Bay
      await applyMovement({
        productId: steelRods.id, locationFromId: mainStore.id,
        locationToId: rawMat.id, quantity: 100, movementType: 'transfer',
        referenceDocType: 'transfer', referenceDocId: 1, createdBy: adminUser.id,
      });

      // Delivery: 60 kg Steel Rods from Main Store → Customer
      await applyMovement({
        productId: steelRods.id, locationFromId: mainStore.id,
        locationToId: VIRTUAL_LOCATIONS.CUSTOMER, quantity: 60, movementType: 'delivery',
        referenceDocType: 'delivery', referenceDocId: 1, createdBy: adminUser.id,
      });

      // Adjustment: +5 Proximity Sensors (found extra during count)
      await applyMovement({
        productId: sensor.id, locationFromId: VIRTUAL_LOCATIONS.INVENTORY_ADJUSTMENT,
        locationToId: sec1.id, quantity: 5, movementType: 'adjustment',
        referenceDocType: 'adjustment', referenceDocId: 1, createdBy: adminUser.id,
      });

      console.log('   ✓ 9 historical ledger entries created');
    }

    console.log('\n🎉  Seed complete!');
    console.log('   📦  Warehouses:  Main(WH-01), Secondary(WH-02)');
    console.log('   📍  Virtual locations: Vendor(1), Customer(2), Inventory Adjustment(3)');
    console.log('   📦  Products: Steel Rods, Aluminum Sheet, Cement Bag, Steel Beam, Electric Motor, Proximity Sensor');
    console.log('   👤  Admin: admin@stocksense.dev / Admin@1234\n');

  } catch (err) {
    console.error('❌  Seed failed:', err.message);
    console.error(err);
    process.exit(1);
  } finally {
    await sequelize.close();
  }
}

seed();
