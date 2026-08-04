"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getRoom = exports.createRoom = void 0;
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
const createRoom = async (req, res) => {
    try {
        const { name } = req.body;
        const userId = req.userId;
        if (!userId) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        const room = await prisma.room.create({
            data: {
                name: name || 'Untitled Room',
                hostId: userId,
            }
        });
        res.status(201).json({ room });
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Server error creating room' });
    }
};
exports.createRoom = createRoom;
const getRoom = async (req, res) => {
    try {
        const id = req.params.id;
        const room = await prisma.room.findUnique({
            where: { id },
            include: {
                host: {
                    select: { id: true, name: true }
                }
            }
        });
        if (!room) {
            return res.status(404).json({ error: 'Room not found' });
        }
        res.json({ room });
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Server error fetching room' });
    }
};
exports.getRoom = getRoom;
