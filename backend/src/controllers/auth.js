"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getMe = exports.login = exports.register = void 0;
const client_1 = require("@prisma/client");
const bcrypt_1 = __importDefault(require("bcrypt"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const prisma = new client_1.PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET || 'secret';
const register = async (req, res) => {
    try {
        const { name, email, password } = req.body;
        // Check if user exists
        const existingUser = await prisma.user.findUnique({ where: { email } });
        if (existingUser) {
            return res.status(400).json({ error: 'Email already in use' });
        }
        const salt = await bcrypt_1.default.genSalt(10);
        const passwordHash = await bcrypt_1.default.hash(password, salt);
        const user = await prisma.user.create({
            data: {
                name,
                email,
                passwordHash,
            },
        });
        const token = jsonwebtoken_1.default.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' });
        res.status(201).json({ token, user: { id: user.id, name: user.name, email: user.email } });
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Server error' });
    }
};
exports.register = register;
const login = async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await prisma.user.findUnique({ where: { email } });
        if (!user) {
            return res.status(400).json({ error: 'Invalid credentials' });
        }
        const isMatch = await bcrypt_1.default.compare(password, user.passwordHash);
        if (!isMatch) {
            return res.status(400).json({ error: 'Invalid credentials' });
        }
        const token = jsonwebtoken_1.default.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' });
        res.json({ token, user: { id: user.id, name: user.name, email: user.email } });
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Server error' });
    }
};
exports.login = login;
const getMe = async (req, res) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        if (!token)
            return res.status(401).json({ error: 'Unauthorized' });
        const decoded = jsonwebtoken_1.default.verify(token, JWT_SECRET);
        const user = await prisma.user.findUnique({ where: { id: decoded.userId } });
        if (!user)
            return res.status(404).json({ error: 'User not found' });
        res.json({ user: { id: user.id, name: user.name, email: user.email } });
    }
    catch (error) {
        res.status(401).json({ error: 'Unauthorized' });
    }
};
exports.getMe = getMe;
