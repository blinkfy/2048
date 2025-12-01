// MySQL helper for 2048 service
const mysql = require('mysql2/promise');
const dotenv = require('dotenv');
dotenv.config();

const MYSQL_HOST = process.env.MYSQL_HOST || 'rubbish-db-mysql.ns-hh6q93qe.svc';
const MYSQL_PORT = Number(process.env.MYSQL_PORT || 3306);
const MYSQL_USER = process.env.MYSQL_USER || 'root';
const MYSQL_PASSWORD = process.env.MYSQL_PASSWORD || 'svlpb86n';
const MYSQL_DB = process.env.MYSQL_2048_DATABASE || 'game2048';

let pool;

async function ensureDatabaseAndTables() {
  // Admin connection without database
  const admin = await mysql.createConnection({
    host: MYSQL_HOST,
    port: MYSQL_PORT,
    user: MYSQL_USER,
    password: MYSQL_PASSWORD,
    multipleStatements: true,
  });
  await admin.query(`CREATE DATABASE IF NOT EXISTS \`${MYSQL_DB}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`);
  await admin.end();

  // Create pool bound to DB
  pool = mysql.createPool({
    host: MYSQL_HOST,
    port: MYSQL_PORT,
    user: MYSQL_USER,
    password: MYSQL_PASSWORD,
    database: MYSQL_DB,
    waitForConnections: true,
    connectionLimit: 10,
    charset: 'utf8mb4_unicode_ci'
  });

  // Ensure Users table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS Users (
      nid VARCHAR(191) PRIMARY KEY,
      pswd VARCHAR(191) NOT NULL,
      score INT DEFAULT 0,
      lstime VARCHAR(64) DEFAULT '',
      requireTimes INT DEFAULT 0,
      winTimes INT DEFAULT 0,
      score3d INT DEFAULT 0,
      zombiescore INT DEFAULT 0,
      createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);
}

function getPool() {
  if (!pool) throw new Error('DB pool not initialized');
  return pool;
}

module.exports = { ensureDatabaseAndTables, getPool };
