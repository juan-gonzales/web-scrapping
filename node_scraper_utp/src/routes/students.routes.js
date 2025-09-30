import { Router } from 'express';
import { getStudents, postStudent } from '../controllers/students.controller.js';

const router = Router();

router.get('/', getStudents);
router.post('/', postStudent);

export default router;
