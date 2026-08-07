import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { LogOut, Video, Calendar, Clock, Copy, Plus, X, Trash2 } from 'lucide-react';
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

    const handleDeleteRoom = async (meetingId: string) => {
        if (!confirm('Are you sure you want to delete this scheduled meeting?')) return;
        try {
            const res = await fetch(`${BACKEND_URL}/api/rooms/${meetingId}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                fetchMyMeetings();
            } else {
                console.error('Failed to delete room');
                alert('Failed to delete meeting. Please try again.');
            }
        } catch (err) {
            console.error(err);
        }
    };

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center text-gray-900 p-4 relative overflow-hidden selection:bg-neutral-900 selection:text-white">
            <div className="absolute top-4 right-4 flex items-center gap-4 z-20">
                <span className="text-gray-600">Hello, <strong className="text-neutral-900">{user?.name}</strong></span>
                <button onClick={logout} className="p-2 bg-gray-200 hover:bg-gray-300 rounded-full transition-colors" title="Log out">
                    <LogOut className="w-5 h-5 text-gray-600" />
                </button>
            </div>

            <div className="absolute top-0 right-0 p-32 bg-gray-200 rounded-full blur-[100px] opacity-40 transform translate-x-1/2 -translate-y-1/2"></div>
            <div className="absolute bottom-0 left-0 p-32 bg-gray-300 rounded-full blur-[100px] opacity-30 transform -translate-x-1/2 translate-y-1/2"></div>

            <div className="w-full max-w-5xl z-10 grid grid-cols-1 md:grid-cols-12 gap-8 items-start relative mt-16 md:mt-0">

                {/* Main Controls Panel */}
                <div className="md:col-span-5 bg-white p-8 rounded-2xl shadow-xl border border-gray-200">
                    <h1 className="text-3xl font-extrabold text-neutral-900 mb-2 flex items-center gap-3">
                        <Video className="text-neutral-900 w-8 h-8" /> WebRTC Meet
                    </h1>
                    <p className="text-gray-500 mb-8 font-medium">Connect anywhere, anytime.</p>

                    <div className="space-y-4">
                        <button
                            onClick={handleCreateRoom}
                            className="w-full bg-neutral-900 hover:bg-black text-white font-semibold py-3 px-4 rounded-xl transition-all flex items-center justify-center gap-2 group shadow-lg shadow-black/10 hover:scale-[1.02]"
                        >
                            <Video className="w-5 h-5" />
                            Start an instant meeting
                        </button>

                        <button
                            onClick={() => setShowScheduleModal(true)}
                            className="w-full bg-gray-50 hover:bg-gray-100 border border-gray-200 text-neutral-900 font-semibold py-3 px-4 rounded-xl transition-all flex items-center justify-center gap-2 group shadow-sm hover:scale-[1.02]"
                        >
                            <Calendar className="w-5 h-5" />
                            Schedule for later
                        </button>

                        <div className="relative flex items-center py-6">
                            <div className="flex-grow border-t border-gray-200"></div>
                            <span className="flex-shrink-0 mx-4 text-gray-400 text-sm font-medium">or join existing</span>
                            <div className="flex-grow border-t border-gray-200"></div>
                        </div>

                        <form onSubmit={handleJoinRoom} className="flex gap-2">
                            <input
                                type="text"
                                value={roomId}
                                onChange={(e) => setRoomId(e.target.value)}
                                placeholder="Enter 6-digit code"
                                className="flex-grow bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-neutral-900 focus:border-transparent text-gray-900 placeholder-gray-400"
                            />
                            <button
                                type="submit"
                                disabled={!roomId.trim()}
                                className="bg-neutral-900 hover:bg-black disabled:opacity-50 disabled:cursor-not-allowed font-semibold py-3 px-6 rounded-xl transition-colors text-white"
                            >
                                Join
                            </button>
                        </form>
                    </div>
                </div>

                {/* Upcoming Meetings Panel */}
                <div className="md:col-span-7 bg-white/70 p-6 sm:p-8 rounded-2xl shadow-lg border border-gray-200 flex flex-col min-h-[450px]">
                    <h2 className="text-xl font-bold flex items-center gap-2 mb-6 text-neutral-900">
                        <Clock className="w-6 h-6 text-neutral-900" />
                        Your Meetings
                    </h2>

                    <div className="flex-1 overflow-y-auto space-y-3 pr-2 scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-transparent">
                        {myMeetings.length === 0 ? (
                            <div className="h-full flex flex-col items-center justify-center text-gray-400">
                                <Calendar className="w-16 h-16 mb-4 opacity-20" />
                                <p className="font-medium">You have no scheduled meetings.</p>
                            </div>
                        ) : (
                            myMeetings.map((meeting) => (
                                <div key={meeting.id} className="bg-white border border-gray-200 p-4 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 group hover:bg-gray-50 transition-colors shadow-sm">
                                    <div>
                                        <h3 className="font-bold text-gray-900 truncate max-w-[200px]">{meeting.name || 'Untitled Room'}</h3>
                                        {meeting.scheduledFor ? (
                                            <p className="text-sm text-neutral-600 font-medium flex items-center gap-2 mt-0.5">
                                                {new Date(meeting.scheduledFor).toLocaleString(undefined, {
                                                    weekday: 'short',
                                                    month: 'short',
                                                    day: 'numeric',
                                                    hour: '2-digit',
                                                    minute: '2-digit'
                                                })}
                                                <span className="text-xs bg-gray-100 border border-gray-200 px-2 py-0.5 rounded-full text-neutral-700">
                                                    {formatRelativeTime(meeting.scheduledFor)}
                                                </span>
                                            </p>
                                        ) : (
                                            <p className="text-sm text-emerald-600 font-medium">Instant Meeting</p>
                                        )}
                                        <p className="text-xs text-gray-400 mt-1 font-mono">ID: {meeting.id}</p>
                                    </div>
                                    <div className="flex gap-2 shrink-0">
                                        <button
                                            onClick={() => copyToClipboard(meeting.id)}
                                            className="p-2.5 bg-gray-50 hover:bg-gray-100 border border-gray-200 text-gray-600 rounded-lg transition-colors group-hover:border-gray-300"
                                            title="Copy Code"
                                        >
                                            <Copy className="w-4 h-4" />
                                        </button>
                                        <button
                                            onClick={() => handleDeleteRoom(meeting.id)}
                                            className="p-2.5 bg-red-50 hover:bg-red-100 border border-red-100/50 text-red-500 hover:text-red-700 rounded-lg transition-colors"
                                            title="Delete Meeting"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                        <button
                                            onClick={() => navigate(`/room/${meeting.id}`)}
                                            className="px-5 py-2.5 bg-neutral-900 hover:bg-black text-white text-sm font-bold rounded-lg transition-colors shadow-sm"
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
                <div className="fixed inset-0 bg-neutral-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white border border-gray-200 w-full max-w-md rounded-2xl p-6 shadow-2xl">
                        <div className="flex justify-between items-center mb-6">
                            <h2 className="text-2xl font-bold flex items-center gap-2 text-neutral-900">
                                <Calendar className="w-6 h-6 text-neutral-900" />
                                Schedule Meeting
                            </h2>
                            <button onClick={() => setShowScheduleModal(false)} className="text-gray-400 hover:text-gray-900 p-1 transition-colors">
                                <X className="w-6 h-6" />
                            </button>
                        </div>

                        <form onSubmit={handleScheduleSubmit} className="space-y-4">
                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-1">Meeting Topic</label>
                                <input
                                    type="text"
                                    placeholder={`${user?.name}'s Scheduled Meeting`}
                                    value={scheduleName}
                                    onChange={(e) => setScheduleName(e.target.value)}
                                    className="w-full bg-gray-50 border border-gray-200 rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-neutral-900 text-gray-900 placeholder-gray-400"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-1">Date</label>
                                <input
                                    type="date"
                                    required
                                    value={scheduleDate}
                                    onChange={(e) => setScheduleDate(e.target.value)}
                                    className="w-full bg-gray-50 border border-gray-200 rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-neutral-900 text-gray-900"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-1">Time</label>
                                <input
                                    type="time"
                                    required
                                    value={scheduleTime}
                                    onChange={(e) => setScheduleTime(e.target.value)}
                                    className="w-full bg-gray-50 border border-gray-200 rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-neutral-900 text-gray-900"
                                />
                            </div>

                            <div className="pt-4 flex gap-3">
                                <button
                                    type="button"
                                    onClick={() => setShowScheduleModal(false)}
                                    className="flex-1 py-2.5 bg-gray-50 hover:bg-gray-100 text-gray-700 font-bold rounded-lg transition-colors border border-gray-200"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={!scheduleDate || !scheduleTime}
                                    className="flex-1 py-2.5 bg-neutral-900 hover:bg-black disabled:opacity-50 text-white font-bold rounded-lg transition-colors shadow-lg"
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
