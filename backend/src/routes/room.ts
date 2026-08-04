import express from 'express';
import { createRoom, getRoom, getMyMeetings } from '../controllers/room';
import { authenticate } from '../middleware/auth';

const router = express.Router();

router.post('/', authenticate, createRoom);
router.get('/my/meetings', authenticate, getMyMeetings);
router.get('/:id', authenticate, getRoom);

export default router;
