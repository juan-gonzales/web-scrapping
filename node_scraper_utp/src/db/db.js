import pg from 'pg';

const {
  DB_HOST,
  DB_PORT,
  DB_NAME,
  DB_USER,
  DB_PASSWORD
} = process.env;

export const pool = new pg.Pool({
  host: DB_HOST,
  port: DB_PORT ? Number(DB_PORT) : undefined,
  database: DB_NAME,
  user: DB_USER,
  password: DB_PASSWORD
});

export const dbQuery = (text, params = [], client = null) => {
  if (client) {
    return client.query(text, params);
  }
  return pool.query(text, params);
};

export const withTransaction = async (handler) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await handler(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};
