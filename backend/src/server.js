"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const http_1 = __importDefault(require("http"));
const socket_io_1 = require("socket.io");
const cors_1 = __importDefault(require("cors"));
const dotenv_1 = __importDefault(require("dotenv"));
const auth_1 = __importDefault(require("./routes/auth"));
const room_1 = __importDefault(require("./routes/room"));
dotenv_1.default.config();
const app = (0, express_1.default)();
const port = process.env.PORT || 8000;
app.use((0, cors_1.default)());
app.use(express_1.default.json());
// Routes
app.use('/api/auth', auth_1.default);
app.use('/api/rooms', room_1.default);
const server = http_1.default.createServer(app);
const io = new socket_io_1.Server(server, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST']
    }
});
// Basic route
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', time: new Date().toISOString() });
});
// Mapping of socket IDs to user information
const roomUsers = {};
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
server.listen(port, () => {
    console.log(`Server is running at http://localhost:${port}`);
});
