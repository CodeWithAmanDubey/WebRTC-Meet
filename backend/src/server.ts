import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

import { PrismaClient } from '@prisma/client';
import authRoutes from './routes/auth';
import roomRoutes from './routes/room';

const prisma = new PrismaClient();
const app = express();
const port = process.env.PORT || 8000;

// CORS configuration
const allowedOrigins: string[] = [
  'http://localhost:5173',
  'http://localhost:3000',
  'https://web-rtc-meet.vercel.app',
  process.env.FRONTEND_URL || ''
].filter(url => url.length > 0);

app.use(cors({
  origin: allowedOrigins.length > 0 ? allowedOrigins : '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  credentials: true
}));
app.use(express.json());

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/rooms', roomRoutes);

import { sendOTP } from './utils/mailer';
app.get('/api/test-email', async (req, res) => {
  try {
    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'api-key': process.env.BREVO_API_KEY || '',
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        sender: { name: 'Zoom Clone test', email: process.env.SMTP_USER || 'error@example.com' },
        to: [{ email: process.env.SMTP_USER || 'error@example.com' }],
        subject: 'Diagnostic Test',
        htmlContent: '<p>test</p>'
      })
    });
    const text = await response.text();
    res.send(`HTTP STATUS: ${response.status}<br>RESPONSE: ${text}`);
  } catch (e: any) {
    res.send("CRITICAL ERROR: " + e.message);
  }
});

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: allowedOrigins.length > 0 ? allowedOrigins : '*',
    methods: ['GET', 'POST']
  }
});

// Basic route
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// Mapping of socket IDs to user information
const roomUsers: Record<string, any[]> = {};
const waitingUsers: Record<string, any[]> = {};
const roomHosts: Record<string, string> = {}; // roomId -> socketId

io.on('connection', (socket) => {
  console.log('A user connected:', socket.id);

  // Phase 11: Host Controls & Waiting Room
  socket.on('request-join', async ({ roomId, userId, name }) => {
    try {
      const room = await prisma.room.findUnique({ where: { id: roomId } });

      if (!room) {
        socket.emit('invalid-meeting');
        return;
      }

      const isHost = room.hostId === userId;
      const userObj = { socketId: socket.id, userId, name };

      if (isHost) {
        roomHosts[roomId] = socket.id;
        socket.emit('join-accepted', { isHost: true });

        // Notify host about any currently waiting users
        if (waitingUsers[roomId] && waitingUsers[roomId].length > 0) {
          socket.emit('pending-requests', waitingUsers[roomId]);
        }
      } else {
        if (!waitingUsers[roomId]) waitingUsers[roomId] = [];
        waitingUsers[roomId].push(userObj);

        socket.emit('waiting-for-host');

        const hostSocketId = roomHosts[roomId];
        if (hostSocketId) {
          io.to(hostSocketId).emit('join-request', userObj);
        }
      }
    } catch (err) {
      console.error(err);
      socket.emit('join-rejected');
    }
  });

  socket.on('accept-join', ({ roomId, targetSocketId }) => {
    if (roomHosts[roomId] === socket.id) {
      if (waitingUsers[roomId]) {
        waitingUsers[roomId] = waitingUsers[roomId].filter(u => u.socketId !== targetSocketId);
      }
      io.to(targetSocketId).emit('join-accepted', { isHost: false });
    }
  });

  socket.on('reject-join', ({ roomId, targetSocketId }) => {
    if (roomHosts[roomId] === socket.id) {
      if (waitingUsers[roomId]) {
        waitingUsers[roomId] = waitingUsers[roomId].filter(u => u.socketId !== targetSocketId);
      }
      io.to(targetSocketId).emit('join-rejected');
    }
  });

  socket.on('force-mute', ({ targetSocketId }) => {
    io.to(targetSocketId).emit('force-mute');
  });

  socket.on('force-video-off', ({ targetSocketId }) => {
    io.to(targetSocketId).emit('force-video-off');
  });

  socket.on('end-meeting', async ({ roomId }) => {
    try {
      if (roomHosts[roomId] === socket.id) {
        // Emit to ALL users in the room (including the host themselves)
        io.to(roomId).emit('meeting-ended');

        // Wait briefly to ensure sockets fire before DB drops constraint
        setTimeout(async () => {
          try {
            await prisma.message.deleteMany({ where: { roomId } });
            await prisma.room.delete({ where: { id: roomId } });
          } catch (e) {
            console.error('Cascade DB deletion issue', e);
          }
        }, 100);

        // Clean up in-memory states
        delete roomHosts[roomId];
        delete waitingUsers[roomId];
        delete roomUsers[roomId];
      }
    } catch (err) {
      console.error('Error ending meeting:', err);
    }
  });

  socket.on('join-room', ({ roomId, userId, name }) => {
    socket.join(roomId);

    if (!roomUsers[roomId]) {
      roomUsers[roomId] = [];
    }

    const user = { socketId: socket.id, userId, name };
    roomUsers[roomId].push(user);

    // Notify others in room
    socket.to(roomId).emit('user-joined', user);

    // Send the current users to the newly joined user
    const usersInRoom = roomUsers[roomId].filter(u => u.socketId !== socket.id);
    socket.emit('all-users', usersInRoom);

    // WebRTC Signaling
    socket.on('offer', (payload) => {
      io.to(payload.target).emit('offer', {
        caller: socket.id,
        sdp: payload.sdp,
        name: user.name
      });
    });

    socket.on('answer', (payload) => {
      io.to(payload.target).emit('answer', {
        caller: socket.id,
        sdp: payload.sdp
      });
    });

    socket.on('ice-candidate', (payload) => {
      io.to(payload.target).emit('ice-candidate', {
        candidate: payload.candidate,
        caller: socket.id
      });
    });

    // Chat Signaling
    socket.on('chat-message', (payload) => {
      // Broadcast to others in the room
      socket.to(roomId).emit('chat-message', {
        id: Math.random().toString(36).substring(7),
        message: payload.message,
        senderName: user.name,
        senderId: socket.id,
        timestamp: new Date().toISOString()
      });
    });

    socket.on('disconnect', () => {
      if (roomUsers[roomId]) {
        roomUsers[roomId] = roomUsers[roomId].filter(u => u.socketId !== socket.id);
        socket.to(roomId).emit('user-left', socket.id);
        if (roomUsers[roomId].length === 0) {
          delete roomUsers[roomId];
        }
      }

      if (waitingUsers[roomId]) {
        waitingUsers[roomId] = waitingUsers[roomId].filter(u => u.socketId !== socket.id);
      }

      if (roomHosts[roomId] === socket.id) {
        delete roomHosts[roomId];
      }

      console.log('User disconnected:', socket.id);
    });
  });
});

server.listen(Number(port), '0.0.0.0', () => {
  console.log(`Server is running at http://0.0.0.0:${port}`);
});
