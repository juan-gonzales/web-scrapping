import { Router } from 'express';
import multer from 'multer';
import { getCsvInfo, postCsv } from '../controllers/csv.controller.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

router.get('/', getCsvInfo);
router.post('/', upload.single('csv_file'), postCsv);

export default router;
