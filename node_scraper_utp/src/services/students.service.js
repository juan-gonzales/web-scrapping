import {
  findStudentByUniqueQuery,
  getStudentsQuery,
  insertStudentQuery,
  upsertStudentProcessingQuery,
  updateStudentStatusQuery
} from '../db/queries/students.queries.js';
import {
  deleteCoursesByStudentInfoQuery,
  insertCourseBatchQuery
} from '../db/queries/courses.queries.js';
import {
  deleteSchedulesByStudentInfoQuery,
  insertScheduleQuery
} from '../db/queries/schedules.queries.js';
import { withTransaction } from '../db/db.js';

export const listStudents = async (filters = {}) => getStudentsQuery(filters);

export const createStudent = async (data) => insertStudentQuery(data);

export const ensureProcessingRecord = async (data) =>
  upsertStudentProcessingQuery({ ...data, status: 'Procesando' });

export const finalizeStudentScrape = async ({
  analyzed_system,
  student_code,
  web_scraper_event_id,
  status,
  extra_information = null,
  courses = [],
  schedules = []
}) => {
  const normalizedSchedules = Array.isArray(schedules)
    ? schedules.filter(Boolean)
    : schedules
    ? [schedules]
    : [];

  return withTransaction(async (client) => {
    const student = await findStudentByUniqueQuery(
      { analyzed_system, student_code, web_scraper_event_id },
      client
    );

    if (!student) {
      throw new Error('Student record not found for finalization');
    }

    const updated = await updateStudentStatusQuery(
      { id: student.id, status, extra_information },
      client
    );

    await deleteCoursesByStudentInfoQuery(student.id, client);
    if (courses.length) {
      const payload = courses.map((course) => ({
        student_info_id: student.id,
        web_scraper_event_id,
        course_code: course.course_code ?? null,
        course: course.course ?? null,
        weekly_hours: course.weekly_hours ?? null,
        credits: course.credits ?? null,
        cycle: course.cycle ?? null,
        enrollment: course.enrollment ?? null,
        course_type: course.course_type ?? null,
        section: course.section ?? null,
        extra_buttons: course.extra_buttons ?? null,
        available_sections: course.available_sections ?? null
      }));
      await insertCourseBatchQuery(payload, client);
    }

    await deleteSchedulesByStudentInfoQuery(student.id, client);
    for (const schedule of normalizedSchedules) {
      await insertScheduleQuery(
        {
          student_info_id: student.id,
          web_scraper_event_id,
          content_information: schedule.content_information ?? null,
          weekly_timetable: schedule.weekly_timetable ?? null
        },
        client
      );
    }

    return updated;
  });
};
