'use strict';
require('dotenv').config();
const app      = require('./src/app');
const sequelize = require('./src/config/sequelize');

const PORT = process.env.PORT || 5000;

async function start() {
  try {
    await sequelize.authenticate();
    console.log('✅  Database connection established');
    app.listen(PORT, () => {
      console.log(`🚀  StockSense API running on http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error('❌  Failed to connect to database:', err.message);
    process.exit(1);
  }
}

start();
