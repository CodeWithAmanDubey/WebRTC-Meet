import express from 'express';
import { createRoom, getRoom, getMyMeetings, deleteRoom } from '../controllers/room';
import { authenticate } from '../middleware/auth';

const router = express.Router();

router.post('/', authenticate, createRoom);
router.get('/my/meetings', authenticate, getMyMeetings);
router.get('/:id', authenticate, getRoom);
router.delete('/:id', authenticate, deleteRoom);

export default router;
