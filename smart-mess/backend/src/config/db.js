const mysql = require('mysql2/promise');
require('dotenv').config();

function getPoolConfig() {
  const databaseUrl = (process.env.DATABASE_URL || process.env.MYSQL_URL || '').trim();
  const config = {
    host: String(process.env.DB_HOST || '127.0.0.1').trim(),
    port: Number(process.env.DB_PORT || 3306),
    user: String(process.env.DB_USER || 'root').trim(),
    password: String(process.env.DB_PASSWORD || '').trim(),
    database: String(process.env.DB_NAME || 'smart_mess_db').trim(),
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    dateStrings: true, // Returns DATE columns as 'YYYY-MM-DD' strings
    decimalNumbers: true
  };

  if (databaseUrl) {
    try {
      const parsed = new URL(databaseUrl);
      config.host = parsed.hostname.trim();
      config.port = Number(parsed.port) || 3306;
      config.user = decodeURIComponent(parsed.username).trim();
      config.password = decodeURIComponent(parsed.password).trim();
      const dbFromPath = parsed.pathname.replace(/^\//, '').trim();
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
    )) ||
    (databaseUrl && (databaseUrl.includes('ssl=') || databaseUrl.includes('sslmode=require')));

  if (needsSsl) {
    config.ssl = {
      minVersion: 'TLSv1.2',
      rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false'
    };
  }

  // TiDB Cloud 'sys' is an internal MySQL database; use 'test' or 'smart_mess_db' for application data
  if (!config.database || config.database === 'sys') {
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
