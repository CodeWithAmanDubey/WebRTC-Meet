import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { io, Socket } from 'socket.io-client';
import { Mic, MicOff, Video as VideoIcon, VideoOff, PhoneOff, MessageSquare, Send, MonitorUp, Users, CheckCircle, XCircle } from 'lucide-react';
import { BACKEND_URL } from '../config';

const ICE_SERVERS: RTCConfiguration = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
    ]
};

interface PeerData {
    id: string;
    name: string;
    stream: MediaStream;
}

interface ChatMessage {
    id: string;
    message: string;
    senderName: string;
    senderId: string;
    timestamp: string;
    isLocal?: boolean;
}

export default function Room() {
    const { roomId } = useParams<{ roomId: string }>();
    const { user, token } = useAuth();
    const navigate = useNavigate();

    const [isMuted, setIsMuted] = useState(false);
    const [isVideoOff, setIsVideoOff] = useState(false);
    const [peers, setPeers] = useState<PeerData[]>([]);

    // Phase 11: Host Controls & Waiting Room states
    const [isHost, setIsHost] = useState(false);
    const [waitingStatus, setWaitingStatus] = useState<'idle' | 'waiting' | 'accepted' | 'rejected'>('idle');
    const [pendingUsers, setPendingUsers] = useState<any[]>([]);
    const [isParticipantsOpen, setIsParticipantsOpen] = useState(false);

    // Chat states
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [chatInput, setChatInput] = useState('');
    const [isChatOpen, setIsChatOpen] = useState(false);
    const [isScreenSharing, setIsScreenSharing] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const originalVideoTrackRef = useRef<MediaStreamTrack | null>(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages, isChatOpen]);

    const localVideoRef = useRef<HTMLVideoElement>(null);
    const socketRef = useRef<Socket | null>(null);
    const localStreamRef = useRef<MediaStream | null>(null);
    const peerConnectionsRef = useRef<Record<string, RTCPeerConnection>>({});
    const peerNamesRef = useRef<Record<string, string>>({});

    const addPeerStream = useCallback((socketId: string, name: string, stream: MediaStream) => {
        setPeers(prev => {
            const exists = prev.find(p => p.id === socketId);
            if (exists) {
                return prev.map(p => p.id === socketId ? { ...p, stream } : p);
            }
            return [...prev, { id: socketId, name, stream }];
        });
    }, []);

    const createPeerConnection = useCallback((targetSocketId: string, peerName: string): RTCPeerConnection => {
        // Close any existing connection to this peer
        if (peerConnectionsRef.current[targetSocketId]) {
            peerConnectionsRef.current[targetSocketId].close();
        }

        const pc = new RTCPeerConnection(ICE_SERVERS);
        peerConnectionsRef.current[targetSocketId] = pc;
        peerNamesRef.current[targetSocketId] = peerName;

        // Send ICE candidates to remote peer via signaling
        pc.onicecandidate = (event) => {
            if (event.candidate) {
                socketRef.current?.emit('ice-candidate', {
                    target: targetSocketId,
                    candidate: event.candidate.toJSON()
                });
            }
        };

        // When we receive remote tracks, add them to state for rendering
        pc.ontrack = (event) => {
            console.log(`[WebRTC] ontrack from ${peerName} (${targetSocketId}), streams:`, event.streams.length);
            const remoteStream = event.streams[0];
            if (remoteStream) {
                addPeerStream(targetSocketId, peerName, remoteStream);
            }
        };

        pc.oniceconnectionstatechange = () => {
            console.log(`[WebRTC] ICE state with ${peerName}: ${pc.iceConnectionState}`);
            if (pc.iceConnectionState === 'failed' || pc.iceConnectionState === 'disconnected') {
                console.warn(`[WebRTC] Connection with ${peerName} ${pc.iceConnectionState}`);
            }
        };

        return pc;
    }, [addPeerStream]);

    useEffect(() => {
        const socket = io(BACKEND_URL, {
            query: { token }
        });
        socketRef.current = socket;

        let localStream: MediaStream | null = null;

        const init = async () => {
            // 1. Get local media FIRST — graceful fallback if camera is busy
            try {
                localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
                console.log('[Media] Got video + audio');
            } catch (err) {
                console.warn('[Media] Camera unavailable, trying audio only:', err);
                try {
                    localStream = await navigator.mediaDevices.getUserMedia({ video: false, audio: true });
                    console.log('[Media] Got audio only (camera busy)');
                } catch (err2) {
                    console.warn('[Media] No media devices available, joining without media');
                    // Create an empty stream so peer connections still work
                    localStream = new MediaStream();
                }
            }

            localStreamRef.current = localStream;
            const originalVideo = localStream.getVideoTracks()[0];
            if (originalVideo) {
                originalVideoTrackRef.current = originalVideo;
            }

            if (localVideoRef.current) {
                localVideoRef.current.srcObject = localStream;
            }

            // Auto-detect if we have no video track
            const hasVideo = localStream.getVideoTracks().length > 0;
            if (!hasVideo) {
                setIsVideoOff(true);
            }

            console.log('[Media] Tracks:', localStream.getTracks().map(t => `${t.kind}:${t.enabled}`));

            // 2. Set up socket event handlers BEFORE joining room
            // When we join, server tells us who is already in the room
            socket.on('all-users', async (users: { socketId: string; name: string }[]) => {
                console.log('[Signal] all-users:', users.map(u => u.name));
                for (const remoteUser of users) {
                    const pc = createPeerConnection(remoteUser.socketId, remoteUser.name);

                    // Add our local tracks to this peer connection
                    localStreamRef.current!.getTracks().forEach(track => {
                        pc.addTrack(track, localStreamRef.current!);
                    });

                    // Create offer — always request both audio AND video
                    // so that even if we have no camera, the remote peer's video can flow to us
                    try {
                        const offer = await pc.createOffer({
                            offerToReceiveAudio: true,
                            offerToReceiveVideo: true
                        });
                        await pc.setLocalDescription(offer);
                        socket.emit('offer', {
                            target: remoteUser.socketId,
                            sdp: pc.localDescription
                        });
                        console.log(`[Signal] Sent offer to ${remoteUser.name}`);
                    } catch (err) {
                        console.error(`[Signal] Error creating offer for ${remoteUser.name}:`, err);
                    }
                }
            });

            // When a new user joins after us
            socket.on('user-joined', (remoteUser: { socketId: string; name: string }) => {
                console.log(`[Signal] user-joined: ${remoteUser.name} (${remoteUser.socketId})`);
                // We don't create an offer here — THEY will send us an offer via all-users handler
            });

            // When we receive an offer from another peer
            socket.on('offer', async (payload: { caller: string; sdp: RTCSessionDescriptionInit; name: string }) => {
                console.log(`[Signal] Received offer from ${payload.name}`);
                const pc = createPeerConnection(payload.caller, payload.name);

                // Add our local tracks
                localStreamRef.current!.getTracks().forEach(track => {
                    pc.addTrack(track, localStreamRef.current!);
                });

                try {
                    await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
                    const answer = await pc.createAnswer();
                    await pc.setLocalDescription(answer);
                    socket.emit('answer', {
                        target: payload.caller,
                        sdp: pc.localDescription
                    });
                    console.log(`[Signal] Sent answer to ${payload.name}`);
                } catch (err) {
                    console.error(`[Signal] Error handling offer from ${payload.name}:`, err);
                }
            });


            // When we receive an answer to our offer
            socket.on('answer', async (payload: { caller: string; sdp: RTCSessionDescriptionInit }) => {
                const pc = peerConnectionsRef.current[payload.caller];
                if (pc) {
                    try {
                        await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
                        console.log(`[Signal] Set remote description (answer) from ${peerNamesRef.current[payload.caller]}`);
                    } catch (err) {
                        console.error('[Signal] Error setting remote description:', err);
                    }
                }
            });

            // When we receive an ICE candidate
            socket.on('ice-candidate', async (payload: { candidate: RTCIceCandidateInit; caller: string }) => {
                const pc = peerConnectionsRef.current[payload.caller];
                if (pc) {
                    try {
                        await pc.addIceCandidate(new RTCIceCandidate(payload.candidate));
                    } catch (err) {
                        console.error('[ICE] Error adding candidate:', err);
                    }
                }
            });

            // When we receive a chat message
            socket.on('chat-message', (data: ChatMessage) => {
                setMessages(prev => [...prev, data]);
            });

            // When a user leaves
            socket.on('user-left', (socketId: string) => {
                console.log(`[Signal] user-left: ${socketId}`);
                if (peerConnectionsRef.current[socketId]) {
                    peerConnectionsRef.current[socketId].close();
                    delete peerConnectionsRef.current[socketId];
                    delete peerNamesRef.current[socketId];
                }
                setPeers(prev => prev.filter(p => p.id !== socketId));
            });

            // Phase 11: Listeners for Host and Waiting Room
            socket.on('waiting-for-host', () => setWaitingStatus('waiting'));
            socket.on('join-request', (newUser) => setPendingUsers(prev => [...prev, newUser]));
            socket.on('pending-requests', (users) => setPendingUsers(users));
            socket.on('join-accepted', ({ isHost: hostStatus }) => {
                setIsHost(hostStatus);
                setWaitingStatus('accepted');
                // Proceed with normal WebRTC join flow
                socket.emit('join-room', { roomId, userId: user?.id, name: user?.name });
                console.log(`[Signal] Joined room ${roomId} as ${user?.name} (Host: ${hostStatus})`);
            });
            socket.on('join-rejected', () => setWaitingStatus('rejected'));

            // Host Control Listeners
            socket.on('force-mute', () => {
                if (localStreamRef.current) {
                    const audioTrack = localStreamRef.current.getAudioTracks()[0];
                    if (audioTrack) {
                        audioTrack.enabled = false;
                        setIsMuted(true);
                    }
                }
            });
            socket.on('force-video-off', () => {
                if (localStreamRef.current) {
                    const videoTrack = localStreamRef.current.getVideoTracks()[0];
                    if (videoTrack) {
                        videoTrack.enabled = false;
                        setIsVideoOff(true);
                    }
                }
            });

            // 3. Instead of joining immediately, request to join
            socket.emit('request-join', { roomId, userId: user?.id, name: user?.name });
        };

        init();

        // Cleanup on unmount
        return () => {
            localStream?.getTracks().forEach(track => track.stop());
            Object.values(peerConnectionsRef.current).forEach(pc => pc.close());
            peerConnectionsRef.current = {};
            socket.disconnect();
        };
    }, [roomId, user, token, createPeerConnection]);

    const toggleMute = () => {
        if (localStreamRef.current) {
            const audioTrack = localStreamRef.current.getAudioTracks()[0];
            if (audioTrack) {
                audioTrack.enabled = !audioTrack.enabled;
                setIsMuted(!audioTrack.enabled);
            }
        }
    };

    const toggleVideo = () => {
        if (localStreamRef.current) {
            const videoTrack = localStreamRef.current.getVideoTracks()[0];
            if (videoTrack) {
                videoTrack.enabled = !videoTrack.enabled;
                setIsVideoOff(!videoTrack.enabled);
            }
        }
    };

    const handleLeave = () => {
        navigate('/');
    };

    // Phase 11: Host Control Actions
    const admitUser = (targetSocketId: string) => {
        socketRef.current?.emit('accept-join', { roomId, targetSocketId });
        setPendingUsers(prev => prev.filter(u => u.socketId !== targetSocketId));
    };

    const denyUser = (targetSocketId: string) => {
        socketRef.current?.emit('reject-join', { roomId, targetSocketId });
        setPendingUsers(prev => prev.filter(u => u.socketId !== targetSocketId));
    };

    const handleForceMute = (targetSocketId: string) => {
        socketRef.current?.emit('force-mute', { targetSocketId });
    };

    const handleForceVideoOff = (targetSocketId: string) => {
        socketRef.current?.emit('force-video-off', { targetSocketId });
    };

    const sendMessage = (e: React.FormEvent) => {
        e.preventDefault();
        if (!chatInput.trim() || !socketRef.current) return;

        const messageData = {
            roomId,
            message: chatInput,
            senderName: user?.name,
            timestamp: new Date().toISOString()
        };

        socketRef.current.emit('chat-message', messageData);

        setMessages(prev => [...prev, {
            id: Date.now().toString(),
            message: chatInput,
            senderName: user?.name || 'Me',
            senderId: socketRef.current?.id || 'local',
            timestamp: messageData.timestamp,
            isLocal: true
        }]);

        setChatInput('');
    };

    const revertToCamera = useCallback(() => {
        const cameraTrack = originalVideoTrackRef.current;
        Object.values(peerConnectionsRef.current).forEach(pc => {
            const sender = pc.getSenders().find(s => s.track?.kind === 'video');
            if (sender && cameraTrack) sender.replaceTrack(cameraTrack);
        });

        if (localStreamRef.current) {
            const currentVideo = localStreamRef.current.getVideoTracks()[0];
            if (currentVideo && currentVideo !== cameraTrack) {
                currentVideo.stop();
                localStreamRef.current.removeTrack(currentVideo);
            }
            if (cameraTrack) {
                localStreamRef.current.addTrack(cameraTrack);
                setIsVideoOff(!cameraTrack.enabled);
            } else {
                setIsVideoOff(true);
            }
        }
        setIsScreenSharing(false);
    }, []);

    const toggleScreenShare = async () => {
        if (!isScreenSharing) {
            try {
                const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
                const screenTrack = screenStream.getVideoTracks()[0];

                Object.values(peerConnectionsRef.current).forEach(pc => {
                    const sender = pc.getSenders().find(s => s.track?.kind === 'video');
                    if (sender) sender.replaceTrack(screenTrack);
                });

                if (localStreamRef.current) {
                    const oldVideo = localStreamRef.current.getVideoTracks()[0];
                    if (oldVideo) localStreamRef.current.removeTrack(oldVideo);
                    localStreamRef.current.addTrack(screenTrack);
                }

                setIsScreenSharing(true);
                setIsVideoOff(false);

                screenTrack.onended = () => {
                    revertToCamera();
                };
            } catch (err) {
                console.error("Screen sharing cancelled or failed", err);
            }
        } else {
            revertToCamera();
        }
    };

    if (waitingStatus === 'idle') {
        return <div className="h-screen bg-gray-950 flex items-center justify-center text-white">Connecting to secure room...</div>;
    }

    if (waitingStatus === 'waiting') {
        return (
            <div className="h-screen bg-gray-950 flex items-center justify-center text-white flex-col gap-4">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-500"></div>
                <h2 className="text-xl font-semibold">Waiting for the host to let you in...</h2>
            </div>
        );
    }

    if (waitingStatus === 'rejected') {
        return (
            <div className="h-screen bg-gray-950 flex flex-col items-center justify-center text-white gap-6">
                <h2 className="text-2xl font-bold text-red-500">The host declined your request to join.</h2>
                <button onClick={() => navigate('/')} className="px-6 py-2 bg-indigo-600 rounded-md hover:bg-indigo-700">Return Home</button>
            </div>
        );
    }

    // Calculate grid columns based on participant count
    const totalParticipants = 1 + peers.length;
    const gridCols = totalParticipants <= 1 ? 'grid-cols-1' :
        totalParticipants <= 4 ? 'grid-cols-2' :
            'grid-cols-3';

    return (
        <div className="h-screen bg-gray-950 flex flex-col p-4">
            <header className="flex justify-between items-center mb-4 px-2">
                <div className="flex items-center gap-3">
                    <div className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-400 to-purple-400">WebRTC Meet</div>
                    <span className="bg-gray-800 text-gray-300 px-3 py-1 rounded-md text-sm font-mono">
                        {roomId}
                    </span>
                </div>
                <div className="text-gray-500 text-sm">
                    {totalParticipants} participant{totalParticipants > 1 ? 's' : ''}
                </div>
            </header>

            <div className="flex flex-1 min-h-0 mb-20 gap-4 relative">
                <main className={`flex-1 grid ${gridCols} gap-4 auto-rows-fr`}>
                    {/* Local Video */}
                    <div className="bg-gray-900 rounded-2xl overflow-hidden relative border border-gray-800 shadow-xl h-full min-h-[250px]">
                        <video
                            ref={localVideoRef}
                            autoPlay
                            playsInline
                            muted
                            className={`w-full h-full object-cover ${isScreenSharing ? '' : '-scale-x-100'} ${isVideoOff ? 'hidden' : ''}`}
                        />
                        {isVideoOff && (
                            <div className="absolute inset-0 flex items-center justify-center bg-gray-800">
                                <span className="text-3xl font-bold bg-indigo-600/30 w-24 h-24 flex items-center justify-center rounded-full text-white border-2 border-indigo-500/30">
                                    {user?.name?.charAt(0).toUpperCase()}
                                </span>
                            </div>
                        )}
                        <div className="absolute bottom-4 left-4 bg-black/60 px-3 py-1 rounded-md text-sm text-white backdrop-blur-sm flex items-center gap-2">
                            {user?.name} (You)
                            {isMuted && <MicOff className="w-4 h-4 text-red-400" />}
                        </div>
                    </div>

                    {/* Remote Videos */}
                    {peers.map(peer => (
                        <div key={peer.id} className="bg-gray-900 rounded-2xl overflow-hidden relative border border-gray-800 shadow-xl h-full min-h-[250px]">
                            <RemoteVideo stream={peer.stream} name={peer.name} />
                            <div className="absolute bottom-4 left-4 bg-black/60 px-3 py-1 rounded-md text-sm text-white backdrop-blur-sm">
                                {peer.name}
                            </div>
                        </div>
                    ))}
                </main>

                {/* Participants Sidebar (Host Only) */}
                {isHost && isParticipantsOpen && (
                    <aside className="w-80 shrink-0 bg-gray-900 rounded-2xl border border-gray-800 shadow-xl flex flex-col overflow-hidden z-10 hidden md:flex">
                        <div className="p-4 border-b border-gray-800 bg-gray-900/50">
                            <h2 className="font-semibold text-white">Participants & Waitlist</h2>
                        </div>
                        <div className="flex-1 overflow-y-auto p-4 space-y-6 flex flex-col">
                            {/* Pending Users */}
                            {pendingUsers.length > 0 && (
                                <div>
                                    <h3 className="text-sm text-gray-400 font-semibold mb-3 uppercase">Waiting ({pendingUsers.length})</h3>
                                    <div className="space-y-3">
                                        {pendingUsers.map(u => (
                                            <div key={u.socketId} className="flex items-center justify-between bg-gray-800 p-3 rounded-xl border border-yellow-500/30">
                                                <span className="text-sm font-medium text-white break-all pr-2">{u.name}</span>
                                                <div className="flex gap-2 shrink-0">
                                                    <button onClick={() => admitUser(u.socketId)} className="text-green-400 hover:text-green-300 transition-colors bg-green-400/10 p-1.5 rounded-md"><CheckCircle className="w-4 h-4" /></button>
                                                    <button onClick={() => denyUser(u.socketId)} className="text-red-400 hover:text-red-300 transition-colors bg-red-400/10 p-1.5 rounded-md"><XCircle className="w-4 h-4" /></button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Active Users */}
                            <div>
                                <h3 className="text-sm text-gray-400 font-semibold mb-3 uppercase">In Meeting ({peers.length + 1})</h3>
                                <div className="space-y-3">
                                    <div className="flex items-center justify-between text-gray-300 text-sm">
                                        <span>{user?.name} (Host, You)</span>
                                    </div>
                                    {peers.map(peer => (
                                        <div key={peer.id} className="flex items-center justify-between text-gray-300 text-sm">
                                            <span className="truncate pr-2">{peer.name}</span>
                                            <div className="flex gap-2 shrink-0">
                                                <button onClick={() => handleForceMute(peer.id)} title="Force Mute" className="p-1 hover:bg-gray-800 rounded-md text-red-400 transition-colors">
                                                    <MicOff className="w-4 h-4" />
                                                </button>
                                                <button onClick={() => handleForceVideoOff(peer.id)} title="Stop Video" className="p-1 hover:bg-gray-800 rounded-md text-red-400 transition-colors">
                                                    <VideoOff className="w-4 h-4" />
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </aside>
                )}

                {/* Chat Sidebar */}
                {isChatOpen && (
                    <aside className="w-80 shrink-0 bg-gray-900 rounded-2xl border border-gray-800 shadow-xl flex flex-col overflow-hidden z-10 hidden md:flex">
                        <div className="p-4 border-b border-gray-800 bg-gray-900/50">
                            <h2 className="font-semibold text-white">In-call Messages</h2>
                        </div>
                        <div className="flex-1 overflow-y-auto p-4 space-y-4">
                            {messages.map((msg, idx) => (
                                <div key={msg.id || idx} className={`flex flex-col ${msg.isLocal ? 'items-end' : 'items-start'}`}>
                                    <span className="text-xs text-gray-500 mb-1">{msg.isLocal ? 'You' : msg.senderName}</span>
                                    <div className={`px-4 py-2 rounded-2xl text-sm max-w-[85%] break-words ${msg.isLocal ? 'bg-indigo-600 text-white rounded-br-none' : 'bg-gray-800 text-gray-200 rounded-bl-none'}`}>
                                        {msg.message}
                                    </div>
                                </div>
                            ))}
                            <div ref={messagesEndRef} />
                        </div>
                        <form onSubmit={sendMessage} className="p-3 bg-gray-900 border-t border-gray-800 flex gap-2">
                            <input
                                type="text"
                                value={chatInput}
                                onChange={(e) => setChatInput(e.target.value)}
                                placeholder="Send a message..."
                                className="flex-1 bg-gray-800 text-white rounded-full px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 min-w-0"
                            />
                            <button type="submit" disabled={!chatInput.trim()} className="p-2 bg-indigo-600 text-white rounded-full hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shrink-0">
                                <Send className="w-4 h-4" />
                            </button>
                        </form>
                    </aside>
                )}
            </div>

            <footer className="fixed bottom-0 left-0 right-0 h-20 bg-gray-900/90 backdrop-blur-md border-t border-gray-800 flex justify-center items-center gap-4 px-4 shadow-2xl z-50">
                <button
                    onClick={toggleMute}
                    className={`p-4 rounded-full transition-all shadow-lg ${isMuted ? 'bg-red-500 hover:bg-red-600 text-white' : 'bg-gray-700 hover:bg-gray-600 text-gray-200'}`}
                >
                    {isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                </button>
                <button
                    onClick={toggleVideo}
                    className={`p-4 rounded-full transition-all shadow-lg ${isVideoOff ? 'bg-red-500 hover:bg-red-600 text-white' : 'bg-gray-700 hover:bg-gray-600 text-gray-200'}`}
                >
                    {isVideoOff ? <VideoOff className="w-5 h-5" /> : <VideoIcon className="w-5 h-5" />}
                </button>
                <button
                    onClick={toggleScreenShare}
                    className={`p-4 rounded-full transition-all shadow-lg ${isScreenSharing ? 'bg-indigo-600 text-white shadow-[0_0_15px_rgba(79,70,229,0.5)]' : 'bg-gray-700 hover:bg-gray-600 text-gray-200'}`}
                >
                    <MonitorUp className="w-5 h-5" />
                </button>
                {isHost && (
                    <button
                        onClick={() => setIsParticipantsOpen(!isParticipantsOpen)}
                        className={`p-4 rounded-full transition-all flex items-center justify-center relative shadow-lg hidden md:flex ${isParticipantsOpen ? 'bg-indigo-600 text-white' : 'bg-gray-700 hover:bg-gray-600 text-gray-200'}`}
                    >
                        <Users className="w-5 h-5" />
                        {pendingUsers.length > 0 && (
                            <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full z-10 shadow-md min-w-[20px] text-center shrink-0">
                                {pendingUsers.length}
                            </span>
                        )}
                    </button>
                )}
                <button
                    onClick={() => setIsChatOpen(!isChatOpen)}
                    className={`p-4 rounded-full transition-all shadow-lg hidden md:block ${isChatOpen ? 'bg-indigo-600 text-white' : 'bg-gray-700 hover:bg-gray-600 text-gray-200'}`}
                >
                    <MessageSquare className="w-5 h-5" />
                </button>
                <button
                    onClick={handleLeave}
                    className="p-4 rounded-full bg-red-600 hover:bg-red-700 text-white transition-all shadow-[0_0_15px_rgba(220,38,38,0.5)] ml-4"
                >
                    <PhoneOff className="w-5 h-5" />
                </button>
            </footer>
        </div>
    );
}

// Separate component to properly attach MediaStream to video element
function RemoteVideo({ stream, name }: { stream: MediaStream; name: string }) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const [hasVideo, setHasVideo] = useState(false);

    useEffect(() => {
        const video = videoRef.current;
        if (video && stream) {
            video.srcObject = stream;
            video.play().catch(err => {
                console.warn('[Video] Autoplay blocked:', err);
            });

            // Check if stream has video tracks
            const videoTracks = stream.getVideoTracks();
            setHasVideo(videoTracks.length > 0 && videoTracks[0].enabled);

            // Listen for track additions (video might arrive later)
            const handleTrack = () => {
                const tracks = stream.getVideoTracks();
                setHasVideo(tracks.length > 0 && tracks[0].enabled);
            };
            stream.addEventListener('addtrack', handleTrack);
            stream.addEventListener('removetrack', handleTrack);

            return () => {
                stream.removeEventListener('addtrack', handleTrack);
                stream.removeEventListener('removetrack', handleTrack);
                if (video) video.srcObject = null;
            };
        }
    }, [stream]);

    return (
        <>
            <video
                ref={videoRef}
                autoPlay
                playsInline
                className={`w-full h-full object-cover ${hasVideo ? '' : 'hidden'}`}
            />
            {!hasVideo && (
                <div className="absolute inset-0 flex items-center justify-center bg-gray-800">
                    <span className="text-3xl font-bold bg-indigo-600/30 w-24 h-24 flex items-center justify-center rounded-full text-white border-2 border-indigo-500/30">
                        {name.charAt(0).toUpperCase()}
                    </span>
                </div>
            )}
        </>
    );
}
