import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Extend Request to include userId (attached by middleware)
interface AuthRequest extends Request {
    userId?: string;
}

export const createRoom = async (req: AuthRequest, res: Response) => {
    try {
        const { name, scheduledFor } = req.body;
        const userId = req.userId;

        if (!userId) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        let roomId = '';
        let roomExists = true;
        while (roomExists) {
            roomId = Math.floor(100000 + Math.random() * 900000).toString();
            const existingRoom = await prisma.room.findUnique({ where: { id: roomId } });
            if (!existingRoom) {
                roomExists = false;
            }
        }

        const room = await prisma.room.create({
            data: {
                id: roomId,
                name: name || 'Untitled Room',
                hostId: userId,
                scheduledFor: scheduledFor ? new Date(scheduledFor) : null,
            }
        });

        res.status(201).json({ room });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Server error creating room' });
    }
};

export const getRoom = async (req: AuthRequest, res: Response) => {
    try {
        const id = req.params.id as string;
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
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Server error fetching room' });
    }
};

export const getMyMeetings = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.userId;

        if (!userId) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        const rooms = await prisma.room.findMany({
            where: {
                hostId: userId,
                scheduledFor: { not: null }
            },
            orderBy: {
                scheduledFor: 'asc' // Optional bonus: ordering by when the meeting is scheduled instead of created
            }
        });

        res.json({ rooms });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Server error fetching your meetings' });
    }
};

export const deleteRoom = async (req: AuthRequest, res: Response) => {
    try {
        const id = req.params.id as string;
        const userId = req.userId;

        if (!userId) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        const room = await prisma.room.findUnique({
            where: { id }
        });

        if (!room) {
            return res.status(404).json({ error: 'Room not found' });
        }

        if (room.hostId !== userId) {
            return res.status(403).json({ error: 'Forbidden: You are not the host of this room' });
        }

        // Delete all messages associated with the room first due to foreign key constraints
        await prisma.message.deleteMany({
            where: { roomId: id }
        });

        await prisma.room.delete({
            where: { id }
        });

        res.json({ message: 'Room deleted successfully' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Server error deleting room' });
    }
};
