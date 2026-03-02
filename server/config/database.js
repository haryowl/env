const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'iot_monitoring',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
  max: 20, // Maximum number of clients in the pool
  idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
  connectionTimeoutMillis: 10000, // Return an error after 10 seconds if connection could not be established
});

// Test the connection (log only in dev or when LOG_LEVEL is debug)
pool.on('connect', () => {
  if (process.env.NODE_ENV !== 'production' || process.env.LOG_LEVEL === 'debug') {
    console.log('Connected to PostgreSQL database');
  }
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
  process.exit(-1);
});

// Only log queries in development or when explicitly enabled (reduces noise in production)
const shouldLogQueries = () => {
  if (process.env.DB_LOG_QUERIES === 'true') return true;
  if (process.env.LOG_LEVEL === 'debug') return true;
  return process.env.NODE_ENV === 'development';
};

// Helper function to execute queries with error handling
const query = async (text, params) => {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    if (shouldLogQueries()) {
      console.log('Executed query', { text: text.substring(0, 80), duration, rows: res.rowCount });
    }
    return res;
  } catch (error) {
    console.error('Database query error:', error);
    throw error;
  }
};

// Helper function to get a single row
const getRow = async (text, params) => {
  const res = await query(text, params);
  return res.rows[0];
};

// Helper function to get multiple rows
const getRows = async (text, params) => {
  const res = await query(text, params);
  return res.rows;
};

// Helper function to execute a transaction
const transaction = async (callback) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

// Helper function to check if a table exists
const tableExists = async (tableName) => {
  const res = await query(
    `SELECT EXISTS (
      SELECT FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name = $1
    )`,
    [tableName]
  );
  return res.rows[0].exists;
};

// Helper function to get table info
const getTableInfo = async (tableName) => {
  const res = await query(
    `SELECT column_name, data_type, is_nullable, column_default
     FROM information_schema.columns 
     WHERE table_name = $1 
     ORDER BY ordinal_position`,
    [tableName]
  );
  return res.rows;
};

// Helper function to get database size
const getDatabaseSize = async () => {
  const res = await query(
    `SELECT pg_size_pretty(pg_database_size($1)) as size`,
    [process.env.DB_NAME || 'iot_monitoring']
  );
  return res.rows[0].size;
};

// Helper function to get table sizes
const getTableSizes = async () => {
  const res = await query(`
    SELECT 
      schemaname,
      tablename,
      pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size,
      pg_total_relation_size(schemaname||'.'||tablename) as size_bytes
    FROM pg_tables 
    WHERE schemaname = 'public'
    ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC
  `);
  return res.rows;
};

// Helper function to vacuum and analyze tables
const vacuumAnalyze = async (tableName = null) => {
  if (tableName) {
    await query(`VACUUM ANALYZE ${tableName}`);
  } else {
    await query('VACUUM ANALYZE');
  }
};

// Helper function to get connection pool status
const getPoolStatus = () => {
  return {
    totalCount: pool.totalCount,
    idleCount: pool.idleCount,
    waitingCount: pool.waitingCount
  };
};

module.exports = {
  pool,
  query,
  getRow,
  getRows,
  transaction,
  tableExists,
  getTableInfo,
  getDatabaseSize,
  getTableSizes,
  vacuumAnalyze,
  getPoolStatus
}; 