import express from 'express';
import { register, login, getMe, sendOtp, verifyOtp } from '../controllers/auth';

const router = express.Router();

router.post('/send-otp', sendOtp);
router.post('/verify-otp', verifyOtp);
router.post('/register', register);
router.post('/login', login);
router.get('/me', getMe);

export default router;
