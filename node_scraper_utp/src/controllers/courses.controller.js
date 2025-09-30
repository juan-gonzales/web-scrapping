import { createCourse, listCourses } from '../services/courses.service.js';

export const getCourses = async (req, res, next) => {
  try {
    const filters = {
      web_scraper_event_id: req.query.web_scraper_event_id
        ? Number(req.query.web_scraper_event_id)
        : undefined,
      student_code: req.query.student_code,
      analyzed_system: req.query.analyzed_system
    };
    const courses = await listCourses(filters);
    res.json(courses);
  } catch (error) {
    next(error);
  }
};

export const postCourse = async (req, res, next) => {
  try {
    const payload = {
      student_info_id: req.body.student_info_id,
      web_scraper_event_id: req.body.web_scraper_event_id,
      course_code: req.body.course_code ?? null,
      course: req.body.course ?? null,
      weekly_hours: req.body.weekly_hours ?? null,
      credits: req.body.credits ?? null,
      cycle: req.body.cycle ?? null,
      enrollment: req.body.enrollment ?? null,
      course_type: req.body.course_type ?? null,
      section: req.body.section ?? null,
      extra_buttons: req.body.extra_buttons ?? null,
      available_sections: req.body.available_sections ?? null
    };

    if (!payload.student_info_id || !payload.web_scraper_event_id) {
      return res.status(400).json({ message: 'student_info_id y web_scraper_event_id son obligatorios' });
    }

    const course = await createCourse(payload);
    res.status(201).json(course);
  } catch (error) {
    next(error);
  }
};
