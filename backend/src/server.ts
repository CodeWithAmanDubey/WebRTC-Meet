import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';

import authRoutes from './routes/auth';
import roomRoutes from './routes/room';

dotenv.config();

const app = express();
const port = process.env.PORT || 8000;

// CORS configuration
const allowedOrigins: string[] = [
  'http://localhost:5173',
  'http://localhost:3000',
  process.env.FRONTEND_URL || ''
].filter(url => url.length > 0);

app.use(cors({
  origin: allowedOrigins.length > 0 ? allowedOrigins : '*',
  methods: ['GET', 'POST'],
  credentials: true
}));
app.use(express.json());

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/rooms', roomRoutes);

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

io.on('connection', (socket) => {
  console.log('A user connected:', socket.id);

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
      roomUsers[roomId] = roomUsers[roomId].filter(u => u.socketId !== socket.id);
      socket.to(roomId).emit('user-left', socket.id);
      if (roomUsers[roomId].length === 0) {
        delete roomUsers[roomId];
      }
      console.log('User disconnected:', socket.id);
    });
  });
});

server.listen(Number(port), '0.0.0.0', () => {
  console.log(`Server is running at http://0.0.0.0:${port}`);
});
