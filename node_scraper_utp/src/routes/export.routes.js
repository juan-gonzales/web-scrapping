import { Router } from 'express';
import { exportComparisonReport } from '../controllers/export.controller.js';

const router = Router();

router.post('/export_report', exportComparisonReport);

export default router;
