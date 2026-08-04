import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { io, Socket } from 'socket.io-client';
import { Mic, MicOff, Video as VideoIcon, VideoOff, PhoneOff, MessageSquare, Send, MonitorUp, Users, CheckCircle, XCircle, Copy, X, Power } from 'lucide-react';
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
    const [showMeetingDetails, setShowMeetingDetails] = useState(false);

    // Chat states
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [chatInput, setChatInput] = useState('');
    const [isChatOpen, setIsChatOpen] = useState(false);
    const [isScreenSharing, setIsScreenSharing] = useState(false);
    const [toastMessage, setToastMessage] = useState<{ sender: string, text: string } | null>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const originalVideoTrackRef = useRef<MediaStreamTrack | null>(null);

    const isChatOpenRef = useRef(isChatOpen);
    useEffect(() => {
        isChatOpenRef.current = isChatOpen;
    }, [isChatOpen]);

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
                if (!isChatOpenRef.current) {
                    setToastMessage({ sender: data.senderName, text: data.message });
                    setTimeout(() => setToastMessage(null), 4500);
                }
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

            socket.on('meeting-ended', () => {
                alert('The host has ended this meeting for all participants.');
                navigate('/');
            });

            socket.on('invalid-meeting', () => {
                alert('Invalid Meeting ID. This room does not exist.');
                navigate('/');
            });

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

    // Force bind the video element when the waiting screen unmounts and the video element mounts
    useEffect(() => {
        if (waitingStatus === 'accepted' && localVideoRef.current && localStreamRef.current) {
            localVideoRef.current.srcObject = localStreamRef.current;
        }
    }, [waitingStatus]);

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

    const handleEndMeeting = () => {
        if (window.confirm("Are you sure you want to end this meeting for everyone? The meeting code will permanently expire.")) {
            socketRef.current?.emit('end-meeting', { roomId });
            // We wait for the 'meeting-ended' socket event to arrive from the server 
            // before navigating away so the socket stays open long enough to transmit.
        }
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
                if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
                    alert("Screen sharing is not natively supported by your current browser or mobile device. Please use a desktop web browser to share your screen.");
                    return;
                }
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

    // Helper to get avatar gradient class based on name
    const getAvatarGradient = (name: string) => {
        const gradients = ['avatar-gradient-1', 'avatar-gradient-2', 'avatar-gradient-3', 'avatar-gradient-4', 'avatar-gradient-5'];
        const idx = name.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0) % gradients.length;
        return gradients[idx];
    };

    // Right panel tab state
    const [activeTab, setActiveTab] = useState<'participants' | 'chat'>('participants');

    // Click-to-pin: which video is the main speaker ('local' or a peer id)
    const [pinnedId, setPinnedId] = useState<string>('local');

    if (waitingStatus === 'idle') {
        return (
            <div className="h-screen bg-gradient-to-br from-slate-50 to-gray-100 flex items-center justify-center">
                <div className="flex flex-col items-center gap-4 animate-fadeIn">
                    <div className="w-12 h-12 rounded-full border-4 border-indigo-200 border-t-indigo-600 animate-spin"></div>
                    <p className="text-gray-600 font-medium text-lg">Connecting to secure room...</p>
                </div>
            </div>
        );
    }

    if (waitingStatus === 'waiting') {
        return (
            <div className="h-screen bg-gradient-to-br from-slate-50 to-gray-100 flex items-center justify-center">
                <div className="flex flex-col items-center gap-6 animate-slideUp bg-white p-10 rounded-3xl shadow-xl border border-gray-100">
                    <div className="w-16 h-16 rounded-full border-4 border-indigo-200 border-t-indigo-600 animate-spin"></div>
                    <h2 className="text-xl font-semibold text-gray-800">Waiting for the host to let you in...</h2>
                    <p className="text-gray-400 text-sm">Please hold on, you'll be admitted shortly.</p>
                </div>
            </div>
        );
    }

    if (waitingStatus === 'rejected') {
        return (
            <div className="h-screen bg-gradient-to-br from-slate-50 to-gray-100 flex flex-col items-center justify-center gap-6">
                <div className="animate-scaleIn bg-white p-10 rounded-3xl shadow-xl border border-gray-100 flex flex-col items-center gap-4">
                    <div className="w-16 h-16 rounded-full bg-red-50 flex items-center justify-center">
                        <XCircle className="w-8 h-8 text-red-500" />
                    </div>
                    <h2 className="text-xl font-bold text-gray-800">The host declined your request to join.</h2>
                    <button onClick={() => navigate('/')} className="px-6 py-2.5 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-all font-medium shadow-lg shadow-indigo-200">
                        Return Home
                    </button>
                </div>
            </div>
        );
    }

    // Calculate grid columns based on participant count
    const totalParticipants = 1 + peers.length;

    return (
        <div className="h-screen bg-gradient-to-br from-slate-50 via-gray-50 to-indigo-50/30 flex flex-col overflow-hidden">
            {/* ===== Top Header Bar ===== */}
            <header className="flex justify-between items-center px-6 py-3 bg-white/80 backdrop-blur-md border-b border-gray-200/60 z-40 animate-fadeIn">
                <div className="flex items-center gap-4">
                    <button onClick={() => navigate('/')} className="p-2 hover:bg-gray-100 rounded-xl transition-colors" title="Back to Home">
                        <svg className="w-5 h-5 text-gray-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
                    </button>
                    <div>
                        <h1 className="text-lg font-bold text-gray-800 tracking-tight">Meeting Room</h1>
                        <p className="text-xs text-gray-400 font-mono">ID: {roomId}</p>
                    </div>
                    <button
                        onClick={() => { navigator.clipboard.writeText(roomId || ''); alert('Meeting ID copied!'); }}
                        className="ml-1 p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all"
                        title="Copy Meeting ID"
                    >
                        <Copy className="w-4 h-4" />
                    </button>
                </div>
                <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2 bg-indigo-50 text-indigo-600 px-3 py-1.5 rounded-full text-sm font-semibold border border-indigo-100">
                        <Users className="w-4 h-4" />
                        {totalParticipants}
                    </div>
                    {isScreenSharing && (
                        <span className="flex items-center gap-1.5 bg-green-50 text-green-600 px-3 py-1.5 rounded-full text-xs font-semibold border border-green-100 animate-pulseGlow">
                            <MonitorUp className="w-3.5 h-3.5" /> Sharing Screen
                        </span>
                    )}
                </div>
            </header>

            {/* ===== Main Content Area ===== */}
            <div className="flex flex-1 min-h-0 p-4 gap-4">

                {/* ===== Left: Video Area ===== */}
                <div className="flex-1 flex flex-col gap-3 min-w-0 animate-slideUp pb-16">
                    {/* Main / Pinned Video */}
                    <div className="flex-1 video-tile bg-white border border-gray-200/80 shadow-lg min-h-0 cursor-pointer" onClick={() => setPinnedId(pinnedId === 'local' ? 'local' : pinnedId)}>
                        {pinnedId === 'local' ? (
                            <>
                                <video
                                    ref={localVideoRef}
                                    autoPlay
                                    playsInline
                                    muted
                                    className={`w-full h-full object-cover ${isScreenSharing ? '' : '-scale-x-100'} ${isVideoOff ? 'hidden' : ''}`}
                                />
                                {isVideoOff && (
                                    <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-gray-100 to-gray-200">
                                        <div className={`w-24 h-24 rounded-full flex items-center justify-center text-white text-3xl font-bold shadow-lg animate-float ${getAvatarGradient(user?.name || 'U')}`}>
                                            {user?.name?.charAt(0).toUpperCase()}
                                        </div>
                                    </div>
                                )}
                                <div className="absolute bottom-4 left-4 bg-white/90 backdrop-blur-sm px-4 py-1.5 rounded-full text-sm text-gray-700 font-medium shadow-md flex items-center gap-2 border border-gray-200/50">
                                    <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse"></span>
                                    {user?.name} (You)
                                    {isMuted && <MicOff className="w-3.5 h-3.5 text-red-500" />}
                                </div>
                            </>
                        ) : (
                            <>
                                {peers.filter(p => p.id === pinnedId).map(peer => (
                                    <React.Fragment key={peer.id}>
                                        <RemoteVideo stream={peer.stream} name={peer.name} />
                                        <div className="absolute bottom-4 left-4 bg-white/90 backdrop-blur-sm px-4 py-1.5 rounded-full text-sm text-gray-700 font-medium shadow-md flex items-center gap-2 border border-gray-200/50">
                                            <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse"></span>
                                            {peer.name}
                                        </div>
                                    </React.Fragment>
                                ))}
                            </>
                        )}
                        {peers.length === 0 && (
                            <div className="absolute top-4 right-4 bg-white/90 backdrop-blur-sm px-3 py-1.5 rounded-full text-xs text-gray-400 font-medium shadow border border-gray-100">
                                Waiting for others to join...
                            </div>
                        )}
                    </div>

                    {/* Thumbnail Strip */}
                    {peers.length > 0 && (
                        <div className="flex gap-3 overflow-x-auto pb-1 meeting-scroll animate-slideUp stagger-2">
                            {/* Local thumbnail (when not pinned) */}
                            {pinnedId !== 'local' && (
                                <div
                                    className={`video-tile bg-white border-2 shadow-md shrink-0 w-48 h-32 cursor-pointer transition-all hover:scale-105 ${pinnedId === 'local' ? 'border-indigo-500 ring-2 ring-indigo-200' : 'border-gray-200/80'}`}
                                    onClick={() => setPinnedId('local')}
                                >
                                    <video
                                        ref={localVideoRef}
                                        autoPlay
                                        playsInline
                                        muted
                                        className={`w-full h-full object-cover ${isScreenSharing ? '' : '-scale-x-100'} ${isVideoOff ? 'hidden' : ''}`}
                                    />
                                    {isVideoOff && (
                                        <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-gray-100 to-gray-200">
                                            <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold ${getAvatarGradient(user?.name || 'U')}`}>
                                                {user?.name?.charAt(0).toUpperCase()}
                                            </div>
                                        </div>
                                    )}
                                    <div className="absolute bottom-2 left-2 bg-white/90 backdrop-blur-sm px-3 py-1 rounded-full text-xs text-gray-600 font-medium shadow-sm flex items-center gap-1.5 border border-gray-200/50">
                                        <span className="w-1.5 h-1.5 rounded-full bg-green-400"></span>
                                        You
                                    </div>
                                </div>
                            )}
                            {/* Remote thumbnails (skip the pinned one) */}
                            {peers.filter(p => p.id !== pinnedId).map((peer, i) => (
                                <div
                                    key={peer.id}
                                    className={`video-tile bg-white border-2 shadow-md shrink-0 w-48 h-32 cursor-pointer transition-all hover:scale-105 ${pinnedId === peer.id ? 'border-indigo-500 ring-2 ring-indigo-200' : 'border-gray-200/80'} stagger-${i + 1}`}
                                    onClick={() => setPinnedId(peer.id)}
                                >
                                    <RemoteVideo stream={peer.stream} name={peer.name} />
                                    <div className="absolute bottom-2 left-2 bg-white/90 backdrop-blur-sm px-3 py-1 rounded-full text-xs text-gray-600 font-medium shadow-sm flex items-center gap-1.5 border border-gray-200/50">
                                        <span className="w-1.5 h-1.5 rounded-full bg-green-400"></span>
                                        {peer.name}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* ===== Right: Combined Panel (Participants + Chat) ===== */}
                <aside className="w-80 shrink-0 bg-white rounded-2xl border border-gray-200/80 shadow-lg flex flex-col overflow-hidden animate-slideInRight hidden md:flex">
                    {/* Tab Headers */}
                    <div className="flex border-b border-gray-100 bg-gray-50/50">
                        <button
                            onClick={() => setActiveTab('participants')}
                            className={`flex-1 py-3 text-sm font-semibold transition-all relative ${activeTab === 'participants' ? 'text-indigo-600' : 'text-gray-400 hover:text-gray-600'}`}
                        >
                            Participants
                            <span className="ml-1.5 text-xs bg-indigo-100 text-indigo-600 px-1.5 py-0.5 rounded-full">{totalParticipants}</span>
                            {activeTab === 'participants' && <span className="absolute bottom-0 left-1/4 right-1/4 h-0.5 bg-indigo-600 rounded-full"></span>}
                        </button>
                        <button
                            onClick={() => { setActiveTab('chat'); setIsChatOpen(true); }}
                            className={`flex-1 py-3 text-sm font-semibold transition-all relative ${activeTab === 'chat' ? 'text-indigo-600' : 'text-gray-400 hover:text-gray-600'}`}
                        >
                            Chat
                            {messages.length > 0 && activeTab !== 'chat' && (
                                <span className="ml-1.5 w-2 h-2 bg-red-500 rounded-full inline-block animate-pulse"></span>
                            )}
                            {activeTab === 'chat' && <span className="absolute bottom-0 left-1/4 right-1/4 h-0.5 bg-indigo-600 rounded-full"></span>}
                        </button>
                    </div>

                    {/* Tab Content */}
                    {activeTab === 'participants' ? (
                        <div className="flex-1 overflow-y-auto p-4 space-y-4 meeting-scroll">
                            {/* Pending Users (Host Only) */}
                            {isHost && pendingUsers.length > 0 && (
                                <div className="animate-fadeIn">
                                    <h3 className="text-xs text-amber-600 font-bold uppercase mb-2 tracking-wider flex items-center gap-1.5">
                                        <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse"></span>
                                        Waiting ({pendingUsers.length})
                                    </h3>
                                    <div className="space-y-2">
                                        {pendingUsers.map(u => (
                                            <div key={u.socketId} className="flex items-center justify-between bg-amber-50 p-3 rounded-xl border border-amber-200/50 animate-slideInMsg">
                                                <div className="flex items-center gap-2.5">
                                                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold ${getAvatarGradient(u.name)}`}>
                                                        {u.name?.charAt(0).toUpperCase()}
                                                    </div>
                                                    <span className="text-sm font-medium text-gray-700">{u.name}</span>
                                                </div>
                                                <div className="flex gap-1.5">
                                                    <button onClick={() => admitUser(u.socketId)} className="p-1.5 bg-green-100 hover:bg-green-200 text-green-600 rounded-lg transition-colors">
                                                        <CheckCircle className="w-4 h-4" />
                                                    </button>
                                                    <button onClick={() => denyUser(u.socketId)} className="p-1.5 bg-red-100 hover:bg-red-200 text-red-600 rounded-lg transition-colors">
                                                        <XCircle className="w-4 h-4" />
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Active Participants */}
                            <div>
                                <h3 className="text-xs text-gray-400 font-bold uppercase mb-2 tracking-wider">In Meeting</h3>
                                <div className="space-y-1.5">
                                    {/* Self */}
                                    <div className="flex items-center justify-between p-2.5 rounded-xl hover:bg-gray-50 transition-colors group">
                                        <div className="flex items-center gap-2.5">
                                            <div className={`w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-bold shadow-sm ${getAvatarGradient(user?.name || 'U')}`}>
                                                {user?.name?.charAt(0).toUpperCase()}
                                            </div>
                                            <div>
                                                <span className="text-sm font-semibold text-gray-700">{user?.name}</span>
                                                <span className="text-xs text-gray-400 ml-1">(You{isHost ? ', Host' : ''})</span>
                                            </div>
                                        </div>
                                        <div className="flex gap-1.5">
                                            {isMuted && <MicOff className="w-4 h-4 text-red-400" />}
                                            {isVideoOff && <VideoOff className="w-4 h-4 text-red-400" />}
                                        </div>
                                    </div>

                                    {/* Remote peers */}
                                    {peers.map(peer => (
                                        <div key={peer.id} className="flex items-center justify-between p-2.5 rounded-xl hover:bg-gray-50 transition-colors group">
                                            <div className="flex items-center gap-2.5">
                                                <div className={`w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-bold shadow-sm ${getAvatarGradient(peer.name)}`}>
                                                    {peer.name?.charAt(0).toUpperCase()}
                                                </div>
                                                <span className="text-sm font-medium text-gray-700">{peer.name}</span>
                                            </div>
                                            {isHost && (
                                                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <button onClick={() => handleForceMute(peer.id)} title="Force Mute" className="p-1.5 hover:bg-red-50 rounded-lg text-gray-400 hover:text-red-500 transition-colors">
                                                        <MicOff className="w-3.5 h-3.5" />
                                                    </button>
                                                    <button onClick={() => handleForceVideoOff(peer.id)} title="Stop Video" className="p-1.5 hover:bg-red-50 rounded-lg text-gray-400 hover:text-red-500 transition-colors">
                                                        <VideoOff className="w-3.5 h-3.5" />
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    ) : (
                        /* Chat Tab */
                        <>
                            <div className="flex-1 overflow-y-auto p-4 space-y-3 meeting-scroll">
                                {messages.length === 0 && (
                                    <div className="h-full flex flex-col items-center justify-center text-gray-300">
                                        <MessageSquare className="w-10 h-10 mb-2 opacity-30" />
                                        <p className="text-sm text-gray-400">No messages yet</p>
                                    </div>
                                )}
                                {messages.map((msg, idx) => (
                                    <div key={msg.id || idx} className={`flex flex-col ${msg.isLocal ? 'items-end' : 'items-start'} animate-slideInMsg`}>
                                        <div className="flex items-center gap-1.5 mb-1">
                                            {!msg.isLocal && (
                                                <div className={`w-5 h-5 rounded-full flex items-center justify-center text-white text-[9px] font-bold ${getAvatarGradient(msg.senderName)}`}>
                                                    {msg.senderName?.charAt(0).toUpperCase()}
                                                </div>
                                            )}
                                            <span className="text-[11px] text-gray-400 font-medium">{msg.isLocal ? 'You' : msg.senderName}</span>
                                        </div>
                                        <div className={`px-4 py-2.5 rounded-2xl text-sm max-w-[85%] break-words leading-relaxed ${msg.isLocal
                                            ? 'bg-indigo-600 text-white rounded-br-sm shadow-md shadow-indigo-200/50'
                                            : 'bg-gray-100 text-gray-700 rounded-bl-sm'}`}
                                        >
                                            {msg.message}
                                        </div>
                                    </div>
                                ))}
                                <div ref={messagesEndRef} />
                            </div>
                            <form onSubmit={sendMessage} className="p-3 bg-gray-50/80 border-t border-gray-100 flex gap-2">
                                <input
                                    type="text"
                                    value={chatInput}
                                    onChange={(e) => setChatInput(e.target.value)}
                                    placeholder="Type a message..."
                                    className="flex-1 bg-white text-gray-700 rounded-full px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200 border border-gray-200 placeholder-gray-400 min-w-0 transition-all"
                                />
                                <button type="submit" disabled={!chatInput.trim()} className="p-2.5 bg-indigo-600 text-white rounded-full hover:bg-indigo-700 hover:scale-105 disabled:opacity-40 disabled:cursor-not-allowed transition-all shrink-0 shadow-md shadow-indigo-200/50">
                                    <Send className="w-4 h-4" />
                                </button>
                            </form>
                        </>
                    )}
                </aside>
            </div>

            {/* ===== Toast Notification ===== */}
            {toastMessage && (
                <div
                    onClick={() => { setActiveTab('chat'); setIsChatOpen(true); setToastMessage(null); }}
                    className="fixed bottom-28 right-6 bg-white border border-gray-200 rounded-2xl shadow-2xl p-4 z-50 animate-slideUp max-w-xs flex items-start gap-3 cursor-pointer hover:shadow-xl transition-all"
                >
                    <div className="w-9 h-9 rounded-full bg-indigo-100 flex items-center justify-center shrink-0">
                        <MessageSquare className="w-4 h-4 text-indigo-600" />
                    </div>
                    <div className="flex flex-col overflow-hidden flex-1">
                        <span className="text-sm font-semibold text-gray-800 truncate">{toastMessage.sender}</span>
                        <span className="text-sm text-gray-500 truncate">{toastMessage.text}</span>
                    </div>
                    <button
                        onClick={(e) => { e.stopPropagation(); setToastMessage(null); }}
                        className="text-gray-300 hover:text-gray-600 shrink-0"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>
            )}

            {/* ===== Bottom Control Bar ===== */}
            <footer className="fixed bottom-5 inset-x-0 z-50 flex justify-center pointer-events-none animate-slideUp stagger-4">
                <div className="bg-white/90 backdrop-blur-xl border border-gray-200/60 rounded-full shadow-2xl px-6 py-3 flex items-center gap-3 pointer-events-auto">
                    <button
                        onClick={toggleMute}
                        className={`control-btn ${isMuted ? 'bg-red-100 text-red-600 shadow-md shadow-red-100' : 'bg-gray-100 hover:bg-gray-200 text-gray-600'}`}
                        title={isMuted ? 'Unmute' : 'Mute'}
                    >
                        {isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                    </button>
                    <button
                        onClick={toggleVideo}
                        className={`control-btn ${isVideoOff ? 'bg-red-100 text-red-600 shadow-md shadow-red-100' : 'bg-gray-100 hover:bg-gray-200 text-gray-600'}`}
                        title={isVideoOff ? 'Turn on camera' : 'Turn off camera'}
                    >
                        {isVideoOff ? <VideoOff className="w-5 h-5" /> : <VideoIcon className="w-5 h-5" />}
                    </button>
                    <button
                        onClick={toggleScreenShare}
                        className={`control-btn hidden md:block ${isScreenSharing ? 'bg-indigo-100 text-indigo-600 shadow-md shadow-indigo-100' : 'bg-gray-100 hover:bg-gray-200 text-gray-600'}`}
                        title="Share Screen"
                    >
                        <MonitorUp className="w-5 h-5" />
                    </button>

                    {/* Divider */}
                    <div className="w-px h-8 bg-gray-200 mx-1"></div>

                    <button
                        onClick={handleLeave}
                        className="control-btn bg-red-500 hover:bg-red-600 text-white shadow-lg shadow-red-200/50 flex items-center gap-2 px-5"
                        title="Leave Meeting"
                    >
                        <PhoneOff className="w-5 h-5" />
                        <span className="text-sm font-semibold hidden sm:inline">End</span>
                    </button>
                    {isHost && (
                        <button
                            onClick={handleEndMeeting}
                            className="control-btn bg-red-700 hover:bg-red-800 text-white shadow-lg shadow-red-300/50 px-4 flex items-center gap-2"
                            title="End Meeting for All"
                        >
                            <Power className="w-4 h-4" />
                            <span className="text-xs font-semibold hidden sm:inline">End All</span>
                        </button>
                    )}
                </div>
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
