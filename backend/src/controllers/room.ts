import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Extend Request to include userId (attached by middleware)
interface AuthRequest extends Request {
    userId?: string;
}

export const createRoom = async (req: AuthRequest, res: Response) => {
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
