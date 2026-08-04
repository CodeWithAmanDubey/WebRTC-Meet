import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { LogOut, Video } from 'lucide-react';
import { BACKEND_URL } from '../config';

export default function Home() {
    const { user, token, logout } = useAuth();
    const navigate = useNavigate();
    const [roomId, setRoomId] = useState('');

    const handleCreateRoom = async () => {
        try {
            const res = await fetch(`${BACKEND_URL}/api/rooms`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ name: `${user?.name}'s Meeting` })
            });
            if (res.ok) {
                const data = await res.json();
                navigate(`/room/${data.room.id}`);
            } else {
                console.error('Failed to create room');
            }
        } catch (err) {
            console.error(err);
        }
    };

    const handleJoinRoom = (e: React.FormEvent) => {
        e.preventDefault();
        if (roomId.trim()) {
            navigate(`/room/${roomId.trim()}`);
        }
    };

    return (
        <div className="min-h-screen bg-gray-900 flex items-center justify-center text-white p-4">
            <div className="absolute top-4 right-4 flex items-center gap-4">
                <span className="text-gray-400">Hello, <strong className="text-white">{user?.name}</strong></span>
                <button onClick={logout} className="p-2 bg-gray-800 hover:bg-gray-700 rounded-full transition-colors">
                    <LogOut className="w-5 h-5 text-gray-400" />
                </button>
            </div>

            <div className="max-w-md w-full bg-gray-800 p-8 rounded-xl shadow-2xl border border-gray-700/50 backdrop-blur-sm relative overflow-hidden">
                <div className="absolute top-0 right-0 p-10 bg-indigo-500 rounded-full blur-3xl opacity-20 transform translate-x-12 -translate-y-12"></div>
                <div className="relative z-10">
                    <h1 className="text-3xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-purple-400 mb-2 flex items-center gap-3">
                        <Video className="text-indigo-400 w-8 h-8" /> WebRTC Meet
                    </h1>
                    <p className="text-gray-400 mb-6 font-medium">Connect anywhere, anytime.</p>

                    <div className="space-y-4">
                        <button
                            onClick={handleCreateRoom}
                            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-3 px-4 rounded-lg transition-colors flex items-center justify-center gap-2 group shadow-lg shadow-indigo-600/20"
                        >
                            Start a new meeting
                            <svg className="w-5 h-5 transform group-hover:translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                            </svg>
                        </button>

                        <div className="relative flex items-center py-2">
                            <div className="flex-grow border-t border-gray-700"></div>
                            <span className="flex-shrink-0 mx-4 text-gray-500 text-sm font-medium">or</span>
                            <div className="flex-grow border-t border-gray-700"></div>
                        </div>

                        <form onSubmit={handleJoinRoom} className="flex gap-2">
                            <input
                                type="text"
                                value={roomId}
                                onChange={(e) => setRoomId(e.target.value)}
                                placeholder="Enter meeting code"
                                className="flex-grow bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-gray-100 placeholder-gray-600"
                            />
                            <button
                                type="submit"
                                disabled={!roomId.trim()}
                                className="bg-gray-700 hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed font-semibold py-2 px-6 rounded-lg transition-colors text-gray-200"
                            >
                                Join
                            </button>
                        </form>
                    </div>
                </div>
            </div>
        </div>
    );
}
