import { Router } from 'express';
import eventsRoutes from './events.routes.js';
import studentsRoutes from './students.routes.js';
import coursesRoutes from './courses.routes.js';
import csvRoutes from './csv.routes.js';
import exportRoutes from './export.routes.js';

const router = Router();

router.use('/events', eventsRoutes);
router.use('/students', studentsRoutes);
router.use('/courses', coursesRoutes);
router.use('/csv', csvRoutes);
router.use('/course-comparison', exportRoutes);

export default router;
