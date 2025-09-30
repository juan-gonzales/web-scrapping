import { dbQuery } from '../db.js';

export const deleteSchedulesByStudentInfoQuery = async (student_info_id, client = null) => {
  await dbQuery('DELETE FROM student_schedules WHERE student_info_id = $1', [student_info_id], client);
};

export const insertScheduleQuery = async ({
  student_info_id,
  web_scraper_event_id,
  content_information = null,
  weekly_timetable = null
}, client = null) => {
  await dbQuery(
    `INSERT INTO student_schedules (student_info_id, web_scraper_event_id, content_information, weekly_timetable)
     VALUES ($1, $2, $3, $4)`,
    [student_info_id, web_scraper_event_id, content_information, weekly_timetable],
    client
  );
};
