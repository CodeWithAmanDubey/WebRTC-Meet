import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { sendOTP } from '../utils/mailer';

const prisma = new PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET || 'secret';

export const sendOtp = async (req: Request, res: Response) => {
    try {
        const { email } = req.body;
        const existingUser = await prisma.user.findUnique({ where: { email } });
        if (existingUser) {
            return res.status(400).json({ error: 'Email already in use' });
        }

        const code = Math.floor(100000 + Math.random() * 900000).toString();
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 mins

        await prisma.emailVerification.upsert({
            where: { email },
            update: { code, expiresAt, verified: false },
            create: { email, code, expiresAt, verified: false },
        });

        const sent = await sendOTP(email, code);
        if (!sent) {
            return res.status(500).json({ error: 'Failed to send verification email' });
        }

        res.json({ message: 'Verification code sent' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Server error' });
    }
};

export const verifyOtp = async (req: Request, res: Response) => {
    try {
        const { email, code } = req.body;
        const record = await prisma.emailVerification.findUnique({ where: { email } });

        if (!record || record.code !== code) {
            return res.status(400).json({ error: 'Invalid verification code' });
        }

        if (record.expiresAt < new Date()) {
            return res.status(400).json({ error: 'Verification code expired' });
        }

        await prisma.emailVerification.update({
            where: { email },
            data: { verified: true },
        });

        res.json({ message: 'Email verified successfully' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Server error' });
    }
};

export const register = async (req: Request, res: Response) => {
    try {
        const { name, email, password } = req.body;

        const record = await prisma.emailVerification.findUnique({ where: { email } });
        if (!record || !record.verified) {
            return res.status(400).json({ error: 'Email not verified' });
        }

        // Check if user exists (just in case)
        const existingUser = await prisma.user.findUnique({ where: { email } });
        if (existingUser) {
            return res.status(400).json({ error: 'Email already in use' });
        }

        const salt = await bcrypt.genSalt(10);
        const passwordHash = await bcrypt.hash(password, salt);

        const user = await prisma.user.create({
            data: {
                name,
                email,
                passwordHash,
            },
        });

        // Delete verification record after successful registration
        await prisma.emailVerification.delete({ where: { email } });

        const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' });
        res.status(201).json({ token, user: { id: user.id, name: user.name, email: user.email } });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Server error' });
    }
};

export const login = async (req: Request, res: Response) => {
    try {
        const { email, password } = req.body;
        const user = await prisma.user.findUnique({ where: { email } });

        if (!user) {
            return res.status(400).json({ error: 'Invalid credentials' });
        }

        const isMatch = await bcrypt.compare(password, user.passwordHash);
        if (!isMatch) {
            return res.status(400).json({ error: 'Invalid credentials' });
        }

        const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' });
        res.json({ token, user: { id: user.id, name: user.name, email: user.email } });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Server error' });
    }
};

export const getMe = async (req: Request, res: Response) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        if (!token) return res.status(401).json({ error: 'Unauthorized' });

        const decoded = jwt.verify(token, JWT_SECRET) as { userId: string };
        const user = await prisma.user.findUnique({ where: { id: decoded.userId } });

        if (!user) return res.status(404).json({ error: 'User not found' });

        res.json({ user: { id: user.id, name: user.name, email: user.email } });
    } catch (error) {
        res.status(401).json({ error: 'Unauthorized' });
    }
};
