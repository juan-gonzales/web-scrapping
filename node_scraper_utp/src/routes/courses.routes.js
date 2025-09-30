import { Router } from 'express';
import { getCourses, postCourse } from '../controllers/courses.controller.js';

const router = Router();

router.get('/', getCourses);
router.post('/', postCourse);

export default router;
