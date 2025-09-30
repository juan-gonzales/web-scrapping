import { dbQuery } from '../db.js';

const baseSelect = `SELECT c.id, c.student_info_id, c.web_scraper_event_id, c.course_code, c.course, c.weekly_hours,
  c.credits, c.cycle, c.enrollment, c.course_type, c.section, c.extra_buttons, c.available_sections, c.created_at,
  s.student_code, s.analyzed_system
FROM courses c
JOIN student_info_web_scrapper s ON s.id = c.student_info_id`;

export const getCoursesQuery = async (filters = {}) => {
  const conditions = [];
  const values = [];

  if (filters.web_scraper_event_id) {
    values.push(filters.web_scraper_event_id);
    conditions.push(`c.web_scraper_event_id = $${values.length}`);
  }
  if (filters.student_code) {
    values.push(filters.student_code);
    conditions.push(`s.student_code = $${values.length}`);
  }
  if (filters.analyzed_system) {
    values.push(filters.analyzed_system);
    conditions.push(`s.analyzed_system = $${values.length}`);
  }

  const whereClause = conditions.length ? ` WHERE ${conditions.join(' AND ')}` : '';
  const result = await dbQuery(`${baseSelect}${whereClause} ORDER BY c.created_at DESC`, values);
  return result.rows;
};

export const insertCourseQuery = async ({
  student_info_id,
  web_scraper_event_id,
  course_code = null,
  course = null,
  weekly_hours = null,
  credits = null,
  cycle = null,
  enrollment = null,
  course_type = null,
  section = null,
  extra_buttons = null,
  available_sections = null
}, client = null) => {
  const result = await dbQuery(
    `INSERT INTO courses (student_info_id, web_scraper_event_id, course_code, course, weekly_hours, credits, cycle, enrollment, course_type, section, extra_buttons, available_sections)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
     RETURNING id, student_info_id, web_scraper_event_id, course_code, course, weekly_hours, credits, cycle, enrollment, course_type, section, extra_buttons, available_sections, created_at`,
    [
      student_info_id,
      web_scraper_event_id,
      course_code,
      course,
      weekly_hours,
      credits,
      cycle,
      enrollment,
      course_type,
      section,
      extra_buttons,
      available_sections
    ],
    client
  );
  return result.rows[0];
};

export const deleteCoursesByStudentInfoQuery = async (student_info_id, client = null) => {
  await dbQuery('DELETE FROM courses WHERE student_info_id = $1', [student_info_id], client);
};

export const insertCourseBatchQuery = async (courses, client) => {
  for (const course of courses) {
    await insertCourseQuery(course, client);
  }
};
