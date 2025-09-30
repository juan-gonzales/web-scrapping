import { createStudent, listStudents } from '../services/students.service.js';

export const getStudents = async (req, res, next) => {
  try {
    const filters = {
      web_scraper_event_id: req.query.web_scraper_event_id
        ? Number(req.query.web_scraper_event_id)
        : undefined,
      student_code: req.query.student_code,
      analyzed_system: req.query.analyzed_system,
      status: req.query.status
    };
    const students = await listStudents(filters);
    res.json(students);
  } catch (error) {
    next(error);
  }
};

export const postStudent = async (req, res, next) => {
  try {
    const payload = {
      analyzed_system: req.body.analyzed_system,
      student_code: req.body.student_code,
      status: req.body.status,
      extra_information: req.body.extra_information ?? null,
      web_scraper_event_id: req.body.web_scraper_event_id
    };

    if (!payload.analyzed_system || !payload.student_code || !payload.status) {
      return res.status(400).json({ message: 'Datos incompletos para registrar al alumno' });
    }

    const student = await createStudent(payload);
    res.status(201).json(student);
  } catch (error) {
    next(error);
  }
};
