import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { LogOut, Video, Calendar, Clock, Copy, Plus, X } from 'lucide-react';
import { BACKEND_URL } from '../config';

export default function Home() {
    const { user, token, logout } = useAuth();
    const navigate = useNavigate();
    const [roomId, setRoomId] = useState('');
    const [myMeetings, setMyMeetings] = useState<any[]>([]);

    // Scheduling state
    const [showScheduleModal, setShowScheduleModal] = useState(false);
    const [scheduleDate, setScheduleDate] = useState('');
    const [scheduleTime, setScheduleTime] = useState('');
    const [scheduleName, setScheduleName] = useState('');

    // Notification states
    const notifiedRef = useRef<Record<string, boolean>>({});
    const [now, setNow] = useState(new Date());

    useEffect(() => {
        const interval = setInterval(() => {
            setNow(new Date());
        }, 10000); // Check every 10 seconds for UI updates
        return () => clearInterval(interval);
    }, []);

    useEffect(() => {
        if ('Notification' in window && Notification.permission === 'default') {
            Notification.requestPermission();
        }
    }, []);

    useEffect(() => {
        if (!myMeetings.length) return;

        const thresholds = [15, 5, 1];

        myMeetings.forEach(meeting => {
            if (meeting.scheduledFor) {
                const scheduledTime = new Date(meeting.scheduledFor);
                const diffMs = scheduledTime.getTime() - now.getTime();

                if (diffMs > 0) {
                    const diffMinutes = Math.floor(diffMs / 60000);

                    thresholds.forEach(threshold => {
                        // We check within a window because we check every 10 secs
                        if (diffMinutes === threshold) {
                            const key = `${meeting.id}-${threshold}`;
                            if (!notifiedRef.current[key]) {
                                notifiedRef.current[key] = true;
                                if ('Notification' in window && Notification.permission === 'granted') {
                                    new Notification("Meeting starting soon!", {
                                        body: `Your meeting "${meeting.name || 'Untitled'}" is starting in ${diffMinutes === 1 ? '1 minute' : diffMinutes + ' minutes'}!`,
                                    });
                                } else {
                                    // Fallback to basic alert if permissions blocked 
                                    // (not ideal UX, but fulfills the popup requirement).
                                    alert(`Reminder: Your meeting "${meeting.name || 'Untitled'}" is starting in ${diffMinutes === 1 ? '1 minute' : diffMinutes + ' minutes'}!`);
                                }
                            }
                        }
                    });
                }
            }
        });
    }, [now, myMeetings]);

    const formatRelativeTime = (dateString: string) => {
        const scheduledTime = new Date(dateString);
        const diffMs = scheduledTime.getTime() - now.getTime();

        if (diffMs < 0) return 'Already started';

        const diffMins = Math.floor(diffMs / 60000);
        if (diffMins < 60) return `in ${diffMins} min`;

        const diffHours = Math.floor(diffMins / 60);
        const remMins = diffMins % 60;

        if (diffHours < 24) return `in ${diffHours} h ${remMins} min`;

        const diffDays = Math.floor(diffHours / 24);
        return `in ${diffDays} day${diffDays > 1 ? 's' : ''}`;
    }

    useEffect(() => {
        if (token) {
            fetchMyMeetings();
        }
    }, [token]);

    const fetchMyMeetings = async () => {
        try {
            const res = await fetch(`${BACKEND_URL}/api/rooms/my/meetings`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                setMyMeetings(data.rooms);
            }
        } catch (err) {
            console.error(err);
        }
    };

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

    const handleScheduleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const scheduledFor = new Date(`${scheduleDate}T${scheduleTime}:00`).toISOString();
            const res = await fetch(`${BACKEND_URL}/api/rooms`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ name: (scheduleName.trim() || `${user?.name}'s Scheduled Meeting`), scheduledFor })
            });
            if (res.ok) {
                setShowScheduleModal(false);
                setScheduleName('');
                setScheduleDate('');
                setScheduleTime('');
                fetchMyMeetings();
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

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text);
        alert('Meeting ID copied to clipboard');
    };

    return (
        <div className="min-h-screen bg-gray-900 flex flex-col items-center justify-center text-white p-4 relative overflow-hidden">
            <div className="absolute top-4 right-4 flex items-center gap-4 z-20">
                <span className="text-gray-400">Hello, <strong className="text-white">{user?.name}</strong></span>
                <button onClick={logout} className="p-2 bg-gray-800 hover:bg-gray-700 rounded-full transition-colors" title="Log out">
                    <LogOut className="w-5 h-5 text-gray-400" />
                </button>
            </div>

            <div className="absolute top-0 right-0 p-32 bg-indigo-500 rounded-full blur-[100px] opacity-20 transform translate-x-1/2 -translate-y-1/2"></div>
            <div className="absolute bottom-0 left-0 p-32 bg-purple-500 rounded-full blur-[100px] opacity-10 transform -translate-x-1/2 translate-y-1/2"></div>

            <div className="w-full max-w-5xl z-10 grid grid-cols-1 md:grid-cols-12 gap-8 items-start relative mt-16 md:mt-0">

                {/* Main Controls Panel */}
                <div className="md:col-span-5 bg-gray-800/80 p-8 rounded-2xl shadow-2xl border border-gray-700/50 backdrop-blur-md">
                    <h1 className="text-3xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-purple-400 mb-2 flex items-center gap-3">
                        <Video className="text-indigo-400 w-8 h-8" /> WebRTC Meet
                    </h1>
                    <p className="text-gray-400 mb-8 font-medium">Connect anywhere, anytime.</p>

                    <div className="space-y-4">
                        <button
                            onClick={handleCreateRoom}
                            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-3 px-4 rounded-xl transition-all flex items-center justify-center gap-2 group shadow-lg shadow-indigo-600/30 hover:scale-[1.02]"
                        >
                            <Video className="w-5 h-5" />
                            Start an instant meeting
                        </button>

                        <button
                            onClick={() => setShowScheduleModal(true)}
                            className="w-full bg-gray-700 hover:bg-gray-600 border border-gray-600 text-white font-semibold py-3 px-4 rounded-xl transition-all flex items-center justify-center gap-2 group shadow-lg hover:scale-[1.02]"
                        >
                            <Calendar className="w-5 h-5" />
                            Schedule for later
                        </button>

                        <div className="relative flex items-center py-6">
                            <div className="flex-grow border-t border-gray-700"></div>
                            <span className="flex-shrink-0 mx-4 text-gray-500 text-sm font-medium">or join existing</span>
                            <div className="flex-grow border-t border-gray-700"></div>
                        </div>

                        <form onSubmit={handleJoinRoom} className="flex gap-2">
                            <input
                                type="text"
                                value={roomId}
                                onChange={(e) => setRoomId(e.target.value)}
                                placeholder="Enter 6-digit code"
                                className="flex-grow bg-gray-900 border border-gray-700 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-gray-100 placeholder-gray-500"
                            />
                            <button
                                type="submit"
                                disabled={!roomId.trim()}
                                className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed font-semibold py-3 px-6 rounded-xl transition-colors text-white"
                            >
                                Join
                            </button>
                        </form>
                    </div>
                </div>

                {/* Upcoming Meetings Panel */}
                <div className="md:col-span-7 bg-gray-800/50 p-6 sm:p-8 rounded-2xl shadow-xl border border-gray-700/30 backdrop-blur-sm flex flex-col min-h-[450px]">
                    <h2 className="text-xl font-bold flex items-center gap-2 mb-6 text-gray-200">
                        <Clock className="w-6 h-6 text-purple-400" />
                        Your Meetings
                    </h2>

                    <div className="flex-1 overflow-y-auto space-y-3 pr-2 scrollbar-thin scrollbar-thumb-gray-600 scrollbar-track-transparent">
                        {myMeetings.length === 0 ? (
                            <div className="h-full flex flex-col items-center justify-center text-gray-500">
                                <Calendar className="w-16 h-16 mb-4 opacity-20" />
                                <p>You have no scheduled meetings.</p>
                            </div>
                        ) : (
                            myMeetings.map((meeting) => (
                                <div key={meeting.id} className="bg-gray-900/60 border border-gray-700/50 p-4 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 group hover:bg-gray-800/80 transition-colors">
                                    <div>
                                        <h3 className="font-semibold text-white truncate max-w-[200px]">{meeting.name || 'Untitled Room'}</h3>
                                        {meeting.scheduledFor ? (
                                            <p className="text-sm text-indigo-400 font-medium flex items-center gap-2 mt-0.5">
                                                {new Date(meeting.scheduledFor).toLocaleString(undefined, {
                                                    weekday: 'short',
                                                    month: 'short',
                                                    day: 'numeric',
                                                    hour: '2-digit',
                                                    minute: '2-digit'
                                                })}
                                                <span className="text-xs bg-indigo-500/20 px-2 py-0.5 rounded-full text-indigo-300">
                                                    {formatRelativeTime(meeting.scheduledFor)}
                                                </span>
                                            </p>
                                        ) : (
                                            <p className="text-sm text-green-400 font-medium">Instant Meeting</p>
                                        )}
                                        <p className="text-xs text-gray-500 mt-1 font-mono">ID: {meeting.id}</p>
                                    </div>
                                    <div className="flex gap-2 shrink-0">
                                        <button
                                            onClick={() => copyToClipboard(meeting.id)}
                                            className="p-2.5 bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-300 rounded-lg transition-colors group-hover:border-gray-600"
                                            title="Copy Code"
                                        >
                                            <Copy className="w-4 h-4" />
                                        </button>
                                        <button
                                            onClick={() => navigate(`/room/${meeting.id}`)}
                                            className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-lg transition-colors"
                                        >
                                            Start
                                        </button>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </div>

            {/* Schedule Modal */}
            {showScheduleModal && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-gray-900 border border-gray-700 w-full max-w-md rounded-2xl p-6 shadow-2xl">
                        <div className="flex justify-between items-center mb-6">
                            <h2 className="text-2xl font-bold flex items-center gap-2">
                                <Calendar className="w-6 h-6 text-indigo-500" />
                                Schedule Meeting
                            </h2>
                            <button onClick={() => setShowScheduleModal(false)} className="text-gray-400 hover:text-white p-1">
                                <X className="w-6 h-6" />
                            </button>
                        </div>

                        <form onSubmit={handleScheduleSubmit} className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-300 mb-1">Meeting Topic</label>
                                <input
                                    type="text"
                                    placeholder={`${user?.name}'s Scheduled Meeting`}
                                    value={scheduleName}
                                    onChange={(e) => setScheduleName(e.target.value)}
                                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-indigo-500 text-white placeholder-gray-500"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-300 mb-1">Date</label>
                                <input
                                    type="date"
                                    required
                                    value={scheduleDate}
                                    onChange={(e) => setScheduleDate(e.target.value)}
                                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-indigo-500 text-white"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-300 mb-1">Time</label>
                                <input
                                    type="time"
                                    required
                                    value={scheduleTime}
                                    onChange={(e) => setScheduleTime(e.target.value)}
                                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-indigo-500 text-white"
                                />
                            </div>

                            <div className="pt-4 flex gap-3">
                                <button
                                    type="button"
                                    onClick={() => setShowScheduleModal(false)}
                                    className="flex-1 py-2.5 bg-gray-800 hover:bg-gray-700 text-gray-300 font-semibold rounded-lg transition-colors border border-gray-700"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={!scheduleDate || !scheduleTime}
                                    className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-semibold rounded-lg transition-colors"
                                >
                                    Schedule
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
