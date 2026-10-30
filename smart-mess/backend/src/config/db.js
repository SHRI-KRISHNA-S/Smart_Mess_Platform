const mysql = require('mysql2/promise');
require('dotenv').config();

const {
  DB_HOST = '127.0.0.1',
  DB_PORT = 3306,
  DB_USER = 'root',
  DB_PASSWORD = '',
  DB_NAME = 'smart_mess_db',
} = process.env;

let pool = null;

function getPoolConfig() {
  const databaseUrl = process.env.DATABASE_URL || process.env.MYSQL_URL;
  const config = {
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'smart_mess_db',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    dateStrings: true, // Returns DATE columns as 'YYYY-MM-DD' strings
    decimalNumbers: true
  };

  if (databaseUrl) {
    try {
      const parsed = new URL(databaseUrl);
      config.host = parsed.hostname;
      config.port = Number(parsed.port) || 3306;
      config.user = decodeURIComponent(parsed.username);
      config.password = decodeURIComponent(parsed.password);
      const dbFromPath = parsed.pathname.replace(/^\//, '');
      if (dbFromPath) {
        config.database = dbFromPath;
      }
    } catch {
      // Fallback to default config if parse fails
    }
  }

  // Cloud MySQL providers (TiDB Cloud, Aiven, etc.) require TLS/SSL
  const needsSsl =
    process.env.DB_SSL === 'true' ||
    (config.host && (
      config.host.includes('tidbcloud.com') ||
      config.host.includes('aivencloud.com') ||
      config.host.includes('clever-cloud.com')
    ));

  if (needsSsl) {
    config.ssl = {
      minVersion: 'TLSv1.2',
      rejectUnauthorized: true
    };
  }

  // TiDB Cloud 'sys' is an internal MySQL database; use 'test' or 'smart_mess_db' for application data
  if (config.database === 'sys') {
    config.database = 'test';
  }

  return config;
}

let pool = null;

function getPool() {
  if (!pool) {
    pool = mysql.createPool(getPoolConfig());
  }
  return pool;
}

module.exports = {
  getPool,
  query: async (sql, params) => {
    const p = getPool();
    return p.query(sql, params);
  },
  execute: async (sql, params) => {
    const p = getPool();
    return p.execute(sql, params);
  }
};
