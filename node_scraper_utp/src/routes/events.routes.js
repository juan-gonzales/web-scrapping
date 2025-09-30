import { Router } from 'express';
import { getEvents, postEvent } from '../controllers/events.controller.js';

const router = Router();

router.get('/', getEvents);
router.post('/', postEvent);

export default router;
