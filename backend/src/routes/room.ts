import express from 'express';
import { createRoom, getRoom } from '../controllers/room';
import { authenticate } from '../middleware/auth';

const router = express.Router();

router.post('/', authenticate, createRoom);
router.get('/:id', authenticate, getRoom);

export default router;
