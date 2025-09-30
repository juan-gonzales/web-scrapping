import { dbQuery } from '../db.js';

const baseSelect = `SELECT id, analyzed_system, student_code, status, extra_information, web_scraper_event_id, created_at
FROM student_info_web_scrapper`;

export const getStudentsQuery = async (filters = {}) => {
  const conditions = [];
  const values = [];

  if (filters.web_scraper_event_id) {
    values.push(filters.web_scraper_event_id);
    conditions.push(`web_scraper_event_id = $${values.length}`);
  }
  if (filters.student_code) {
    values.push(filters.student_code);
    conditions.push(`student_code = $${values.length}`);
  }
  if (filters.analyzed_system) {
    values.push(filters.analyzed_system);
    conditions.push(`analyzed_system = $${values.length}`);
  }
  if (filters.status) {
    values.push(filters.status);
    conditions.push(`status = $${values.length}`);
  }

  const whereClause = conditions.length ? ` WHERE ${conditions.join(' AND ')}` : '';
  const result = await dbQuery(
    `${baseSelect}${whereClause} ORDER BY created_at DESC`,
    values
  );
  return result.rows;
};

export const insertStudentQuery = async ({
  analyzed_system,
  student_code,
  status,
  extra_information = null,
  web_scraper_event_id
}) => {
  const result = await dbQuery(
    `INSERT INTO student_info_web_scrapper (analyzed_system, student_code, status, extra_information, web_scraper_event_id)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, analyzed_system, student_code, status, extra_information, web_scraper_event_id, created_at`,
    [
      analyzed_system,
      student_code,
      status,
      extra_information,
      web_scraper_event_id
    ]
  );
  return result.rows[0];
};

export const upsertStudentProcessingQuery = async (
  {
    analyzed_system,
    student_code,
    status,
    extra_information = null,
    web_scraper_event_id
  },
  client = null
) => {
  const result = await dbQuery(
    `INSERT INTO student_info_web_scrapper (analyzed_system, student_code, status, extra_information, web_scraper_event_id)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (analyzed_system, student_code, web_scraper_event_id)
     DO UPDATE SET status = EXCLUDED.status, extra_information = COALESCE(EXCLUDED.extra_information, student_info_web_scrapper.extra_information)
     RETURNING id, analyzed_system, student_code, status, extra_information, web_scraper_event_id, created_at`,
    [
      analyzed_system,
      student_code,
      status,
      extra_information,
      web_scraper_event_id
    ],
    client
  );
  return result.rows[0];
};

export const updateStudentStatusQuery = async (
  { id, status, extra_information },
  client = null
) => {
  const result = await dbQuery(
    `UPDATE student_info_web_scrapper
     SET status = $1, extra_information = $2
     WHERE id = $3
     RETURNING id, analyzed_system, student_code, status, extra_information, web_scraper_event_id, created_at`,
    [status, extra_information, id],
    client
  );
  return result.rows[0];
};

export const findStudentByUniqueQuery = async (
  { analyzed_system, student_code, web_scraper_event_id },
  client = null
) => {
  const result = await dbQuery(
    `${baseSelect}
     WHERE analyzed_system = $1 AND student_code = $2 AND web_scraper_event_id = $3`,
    [analyzed_system, student_code, web_scraper_event_id],
    client
  );
  return result.rows[0] || null;
};
