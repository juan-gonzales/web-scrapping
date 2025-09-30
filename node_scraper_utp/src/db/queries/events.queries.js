import { dbQuery } from '../db.js';

export const getEventsQuery = async () => {
  const result = await dbQuery(
    'SELECT id, created_at FROM web_scraper_events ORDER BY created_at DESC'
  );
  return result.rows;
};

export const createEventQuery = async (client = null) => {
  const result = await dbQuery(
    'INSERT INTO web_scraper_events DEFAULT VALUES RETURNING id, created_at',
    [],
    client
  );
  return result.rows[0];
};
