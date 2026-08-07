import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { io, Socket } from 'socket.io-client';
import { Mic, MicOff, Video as VideoIcon, VideoOff, PhoneOff, MessageSquare, Send, MonitorUp, Users, CheckCircle, XCircle, Copy, X, Power, Home, FileText, Bell, Settings, LogOut, MoreVertical, Sparkles, Smile, UserPlus, Clock } from 'lucide-react';
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

    const [isMuted, setIsMuted] = useState(true);
    const [isVideoOff, setIsVideoOff] = useState(true);
    const [peers, setPeers] = useState<PeerData[]>([]);

    // Phase 11: Host Controls & Waiting Room states
    const [isHost, setIsHost] = useState(false);
    const [waitingStatus, setWaitingStatus] = useState<'idle' | 'waiting' | 'accepted' | 'rejected'>('idle');
    const [pendingUsers, setPendingUsers] = useState<any[]>([]);
    const [isParticipantsOpen, setIsParticipantsOpen] = useState(false);
    const [showMeetingDetails, setShowMeetingDetails] = useState(false);

    // Control bar visibility (auto-hide on idle)
    const [isControlBarVisible, setIsControlBarVisible] = useState(true);
    const idleTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        const handleMouseMove = () => {
            setIsControlBarVisible(true);
            if (idleTimeoutRef.current) clearTimeout(idleTimeoutRef.current);
            idleTimeoutRef.current = setTimeout(() => {
                setIsControlBarVisible(false);
            }, 3000);
        };

        window.addEventListener('mousemove', handleMouseMove);
        handleMouseMove(); // Start timer immediately

        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            if (idleTimeoutRef.current) clearTimeout(idleTimeoutRef.current);
        };
    }, []);

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

            // Turn off camera and mic tracks by default
            const originalVideo = localStream.getVideoTracks()[0];
            if (originalVideo) {
                originalVideoTrackRef.current = originalVideo;
                originalVideo.enabled = false;
            }

            const originalAudio = localStream.getAudioTracks()[0];
            if (originalAudio) {
                originalAudio.enabled = false;
            }

            if (localVideoRef.current) {
                localVideoRef.current.srcObject = localStream;
            }

            // Auto-detect if we have no video track at all
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

    // Click-to-pin: which video is the main speaker ('local' or a peer id)
    const [pinnedId, setPinnedId] = useState<string>('local');

    // Right panel tab state
    const [activeTab, setActiveTab] = useState<'participants' | 'chat' | 'info' | null>(null);

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

    return (
        <div className="h-screen bg-[#F4F6F8] flex overflow-hidden font-sans text-gray-900">
            {/* Left Sidebar */}
            <aside className="w-[88px] bg-white flex flex-col items-center py-6 shadow-[2px_0_15px_rgba(0,0,0,0.03)] border-r border-gray-100 flex-shrink-0 z-20 h-full justify-between">
                <div>
                    <div className="relative mb-14 cursor-pointer hover:scale-105 transition-transform">
                        <img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${user?.name || 'A'}`} alt="Avatar" className="w-[46px] h-[46px] rounded-full border border-gray-200 bg-gray-50 object-cover" />
                        <div className="absolute bottom-0 right-0 w-3 h-3 bg-[#10b981] rounded-full border-[2.5px] border-white"></div>
                    </div>

                    <div className="flex flex-col gap-[34px] items-center">
                        <button className="text-gray-400 hover:text-black transition-colors"><Home strokeWidth={2} size={24} /></button>
                        <button className="bg-[#3B5BFF] text-white p-3.5 rounded-full shadow-[0_8px_20px_rgba(59,91,255,0.35)] hover:scale-105 transition-all"><VideoIcon size={24} strokeWidth={2.5} /></button>
                        <button className="text-gray-400 hover:text-black transition-colors"><FileText strokeWidth={2} size={24} /></button>
                        <button className="text-gray-400 hover:text-black transition-colors"><MessageSquare strokeWidth={2} size={24} /></button>
                        <button className="text-gray-400 hover:text-black transition-colors relative">
                            <Bell strokeWidth={2} size={24} />
                        </button>
                    </div>
                </div>

                <div className="flex flex-col gap-8 items-center">
                    <button className="text-gray-400 hover:text-black transition-colors"><Settings strokeWidth={2} size={24} /></button>
                    <button onClick={handleLeave} className="text-gray-400 hover:text-red-500 transition-colors"><LogOut strokeWidth={2} size={24} /></button>
                </div>
            </aside>

            {/* Main Content Area */}
            <main className="flex-1 flex flex-col min-w-0 px-8 py-8 z-10 max-h-screen overflow-hidden">
                {/* Header */}
                <header className="flex justify-between items-center mb-6 pl-2 shrink-0">
                    <div>
                        <div className="text-[13px] text-gray-500 font-semibold mb-1 tracking-wide">09:50 AM, 16 June, 2025</div>
                        <h1 className="text-[28px] font-bold text-gray-900 tracking-tight">Rebranding</h1>
                    </div>
                    <button className="w-10 h-10 rounded-full border-2 border-gray-200 text-gray-700 flex flex-col items-center justify-center hover:bg-gray-100 transition-colors shrink-0">
                        <MoreVertical size={20} strokeWidth={2.5} />
                    </button>
                </header>

                {/* Video Grid */}
                <div className="flex-1 flex flex-col gap-6 min-h-0 pl-2 shrink-[2]">
                    {/* Top Row (Thumbnails) */}
                    <div className="h-[210px] flex gap-5 shrink-0">
                        {peers.slice(0, 3).map((peer, i) => (
                            <div key={peer.id} className="flex-1 rounded-[2rem] overflow-hidden relative group bg-gray-900 shadow-sm border border-gray-200">
                                <RemoteVideo stream={peer.stream} name={peer.name} />
                                <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent pointer-events-none"></div>
                                <div className="absolute bottom-4 left-4 right-4 flex justify-between items-center bg-white/20 backdrop-blur-xl rounded-[1rem] pl-2.5 py-[7px] pr-[9px] border border-white/20 shadow-xl">
                                    <div className="flex items-center gap-2.5 text-white font-medium text-sm">
                                        <div className="w-[26px] h-[26px] rounded-full bg-white/20 flex items-center justify-center border border-white/30 text-[11px] backdrop-blur-md font-bold">
                                            {peer.name.charAt(0)}
                                        </div>
                                        <span className="tracking-wide text-[13px] font-semibold">{peer.name.split(' ')[0]}</span>
                                    </div>
                                    <div className="w-[26px] h-[26px] flex items-center justify-center rounded-full">
                                        <MicOff size={14} className="text-white/80 shrink-0" strokeWidth={2.5} />
                                    </div>
                                </div>
                            </div>
                        ))}
                        {/* Fill empty spots if peers < 3 */}
                        {[...Array(Math.max(0, 3 - peers.length))].map((_, i) => (
                            <div key={`empty-${i}`} className="flex-1 rounded-[2rem] overflow-hidden relative bg-white border border-gray-200 shadow-sm flex items-center justify-center">
                                <span className="text-gray-400 font-bold text-sm">Waiting...</span>
                            </div>
                        ))}
                    </div>

                    {/* Bottom Main Video */}
                    <div className="flex-1 rounded-[2rem] overflow-hidden relative bg-gray-900 shadow-sm border border-gray-200 min-h-0">
                        <video ref={localVideoRef} autoPlay playsInline muted className={`w-full h-full object-cover ${isScreenSharing ? '' : '-scale-x-100'} ${isVideoOff ? 'hidden' : ''}`} />
                        {isVideoOff && (
                            <div className="absolute inset-0 flex items-center justify-center bg-gray-100">
                                <div className="w-28 h-28 rounded-full bg-[#3B5BFF] flex items-center justify-center text-white text-[40px] font-bold shadow-xl border-4 border-white">
                                    {user?.name?.charAt(0).toUpperCase()}
                                </div>
                            </div>
                        )}
                        <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent pointer-events-none"></div>
                        <div className="absolute bottom-6 left-6 bg-white/20 backdrop-blur-xl rounded-[1rem] pl-3 py-2 pr-4 flex items-center gap-3 border border-white/20 text-white shadow-xl">
                            <div className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center border border-white/30 text-xs backdrop-blur-md font-bold">
                                {user?.name?.charAt(0).toUpperCase()}
                            </div>
                            <span className="tracking-wide text-sm font-semibold">{user?.name?.split(' ')[0] || 'Me'}</span>
                        </div>
                    </div>
                </div>

                {/* Bottom Control Bar */}
                <div className="mt-8 flex items-center justify-between shrink-0 pl-2 pr-1">
                    <div className="flex items-center gap-2.5 bg-white px-[22px] py-3.5 rounded-[1.25rem] shadow-[0_2px_10px_rgba(0,0,0,0.02)] text-gray-800 font-semibold text-sm border border-gray-100 tracking-wide">
                        <Clock size={18} className="text-gray-900" strokeWidth={2.5} />
                        58:12:19
                    </div>

                    <div className="flex items-center gap-4">
                        <button onClick={toggleMute} className={`w-14 h-14 flex items-center justify-center rounded-full shadow-[0_4px_15px_rgba(0,0,0,0.04)] transition-transform hover:scale-105 border border-gray-100 ${isMuted ? 'bg-gray-100 text-[#ff4b4b]' : 'bg-white text-gray-800'}`}>
                            {isMuted ? <MicOff size={22} strokeWidth={2} /> : <Mic size={22} strokeWidth={2} />}
                        </button>
                        <button onClick={toggleVideo} className={`w-14 h-14 flex items-center justify-center rounded-full transition-transform hover:scale-105 ${isVideoOff ? 'bg-[#ff4b4b] text-white shadow-[0_8px_20px_rgba(255,75,75,0.3)]' : 'bg-[#3B5BFF] text-white shadow-[0_8px_20px_rgba(59,91,255,0.3)]'}`}>
                            {isVideoOff ? <VideoOff size={22} strokeWidth={2} /> : <VideoIcon size={22} strokeWidth={2.5} />}
                        </button>
                        <button className="w-14 h-14 flex items-center justify-center rounded-full shadow-[0_4px_15px_rgba(0,0,0,0.04)] transition-transform hover:scale-105 border border-gray-100 bg-white text-gray-800">
                            <Smile size={22} strokeWidth={2} />
                        </button>
                        <button onClick={handleLeave} className="w-14 h-14 flex items-center justify-center rounded-full shadow-[0_8px_20px_rgba(255,75,75,0.3)] transition-transform hover:scale-105 bg-[#ff4b4b] text-white border-2 border-red-400/20">
                            <PhoneOff size={22} strokeWidth={2} />
                        </button>
                    </div>

                    <div className="flex items-center gap-3 bg-white px-5 py-3 rounded-[1.25rem] shadow-[0_2px_10px_rgba(0,0,0,0.02)] text-gray-800 font-semibold border text-sm border-gray-100 tracking-wide cursor-pointer hover:bg-gray-50 transition-colors" onClick={() => { navigator.clipboard.writeText(roomId || ''); alert('Copied ID!'); }}>
                        <Copy size={18} className="text-gray-900" strokeWidth={2.5} />
                        conf-123
                    </div>
                </div>
            </main>

            {/* Right Sidebar */}
            <aside className="w-[380px] bg-transparent pt-8 pb-8 pr-8 flex flex-col gap-6 z-10 h-full overflow-y-auto shrink-0 hide-scrollbar">
                {/* Settings Card */}
                <div className="bg-white rounded-[2rem] p-7 shadow-[0_4px_20px_rgba(0,0,0,0.03)] border border-gray-100/50">
                    <h3 className="font-bold text-gray-900 mb-5 text-[17px] tracking-tight">Settings</h3>
                    <div className="space-y-4">
                        {['Noise suppression', 'Video stabilization', 'Automatic subtitles'].map((setting, i) => (
                            <div key={i} className="flex items-center justify-between group">
                                <div className="flex items-center gap-3.5 text-[14px] font-semibold text-gray-700">
                                    <Sparkles size={18} className="text-[#a855f7]" strokeWidth={2} />
                                    {setting}
                                </div>
                                <div className="w-[42px] h-[24px] bg-[#EEF2FF] rounded-full p-[3px] cursor-pointer flex justify-end border border-blue-100">
                                    <div className="w-[16px] h-[16px] bg-[#3B5BFF] rounded-full shadow-sm"></div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* AI Summary Card */}
                <div className="bg-white rounded-[2rem] p-7 shadow-[0_4px_20px_rgba(0,0,0,0.03)] border border-gray-100/50">
                    <h3 className="font-bold text-gray-900 mb-[14px] text-[17px] tracking-tight">AI Summary</h3>
                    <p className="text-[14px] font-bold text-gray-900 mb-2">Key points:</p>
                    <ul className="text-[13px] space-y-[9px] mb-7 ml-[18px] list-disc text-[#888] font-medium tracking-wide">
                        <li className="text-gray-900 leading-snug">Discussed changing the communication tone</li>
                        <li className="text-gray-900 leading-snug">Visual inspiration examples: Apple, Figma</li>
                        <li className="leading-snug">Design phase budget approved</li>
                    </ul>
                    <button className="w-full bg-[#3B5BFF] hover:bg-[#2e47db] transition-colors text-white font-bold py-[15px] rounded-full shadow-[0_8px_20px_rgba(59,91,255,0.25)] text-sm tracking-wide">
                        Send by email
                    </button>
                </div>

                {/* Participants Card */}
                <div className="bg-white rounded-[2rem] p-7 shadow-[0_4px_20px_rgba(0,0,0,0.03)] border border-gray-100/50 flex-1 flex flex-col min-h-[300px]">
                    <div className="flex bg-white rounded-full p-1.5 mb-6 border-2 border-gray-100/80 shadow-inner max-w-full">
                        <button className="flex-1 bg-black text-white text-[13px] font-bold py-[11px] rounded-full shadow-md text-center tracking-wide">
                            Participants (7)
                        </button>
                        <button className="flex-1 bg-transparent text-gray-500 hover:text-gray-900 transition-colors text-[13px] font-bold py-[11px] rounded-full text-center tracking-wide">
                            Chat
                        </button>
                    </div>

                    <div className="flex-1 overflow-y-auto space-y-[18px] mb-6 pr-1 custom-scrollbar">
                        {/* Tony Ware example */}
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-[14px]">
                                <img src="https://api.dicebear.com/7.x/avataaars/svg?seed=Tony" className="w-[42px] h-[42px] rounded-full bg-gray-100 border border-gray-200/60 object-cover" />
                                <div>
                                    <div className="text-[14.5px] font-bold text-gray-900 leading-tight">Tony Ware</div>
                                    <div className="text-[13px] text-gray-400 font-semibold tracking-wide">@tonyware</div>
                                </div>
                            </div>
                            <div className="flex gap-[14px] text-gray-400">
                                <Mic size={20} strokeWidth={2.5} className="text-gray-600" />
                                <VideoIcon size={20} strokeWidth={2.5} className="text-gray-600" />
                            </div>
                        </div>

                        {/* Cara Carr example */}
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-[14px]">
                                <img src="https://api.dicebear.com/7.x/avataaars/svg?seed=Cara" className="w-[42px] h-[42px] rounded-full bg-gray-100 border border-gray-200/60 object-cover" />
                                <div>
                                    <div className="text-[14.5px] font-bold text-gray-900 leading-tight">Cara Carr</div>
                                    <div className="text-[13px] text-gray-400 font-semibold tracking-wide">@caracarrrrr</div>
                                </div>
                            </div>
                            <div className="flex gap-[14px] text-gray-400">
                                <MicOff size={20} strokeWidth={2.5} className="text-gray-700" />
                                <VideoIcon size={20} strokeWidth={2.5} className="text-gray-700" />
                            </div>
                        </div>

                        {/* Anisa Whitehead example */}
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-[14px]">
                                <img src="https://api.dicebear.com/7.x/avataaars/svg?seed=Anisa" className="w-[42px] h-[42px] rounded-full bg-gray-100 border border-gray-200/60 object-cover" />
                                <div>
                                    <div className="text-[14.5px] font-bold text-gray-900 leading-tight">Anisa Whitehead</div>
                                    <div className="text-[13px] text-gray-400 font-semibold tracking-wide">@anisawhite</div>
                                </div>
                            </div>
                            <div className="flex gap-[14px] text-gray-400">
                                <MicOff size={20} strokeWidth={2.5} className="text-gray-700" />
                                <VideoIcon size={20} strokeWidth={2.5} className="text-gray-700" />
                            </div>
                        </div>

                        {/* Martina Doherty example */}
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-[14px]">
                                <img src="https://api.dicebear.com/7.x/avataaars/svg?seed=Martina" className="w-[42px] h-[42px] rounded-full bg-gray-100 border border-gray-200/60 object-cover" />
                                <div>
                                    <div className="text-[14.5px] font-bold text-gray-900 leading-tight">Martina Doherty</div>
                                    <div className="text-[13px] text-gray-400 font-semibold tracking-wide">@martinado</div>
                                </div>
                            </div>
                            <div className="flex gap-[14px] text-gray-400">
                                <MicOff size={20} strokeWidth={2.5} className="text-gray-700" />
                                <VideoIcon size={20} strokeWidth={2.5} className="text-gray-700" />
                            </div>
                        </div>

                        {/* Fake self (Floyd as faded) */}
                        <div className="flex items-center justify-between opacity-30 mt-2 border-t pt-4">
                            <div className="flex items-center gap-[14px]">
                                <img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${user?.name}`} className="w-[42px] h-[42px] rounded-full bg-gray-100 border border-gray-200/60 object-cover" />
                                <div>
                                    <div className="text-[14.5px] font-bold text-gray-900 leading-tight">Floyd Bolton</div>
                                    <div className="text-[13px] text-gray-400 font-semibold tracking-wide">@floydb</div>
                                </div>
                            </div>
                        </div>

                    </div>

                    <button className="w-full bg-[#3B5BFF] hover:bg-[#2e47db] transition-colors text-white font-bold py-[15px] rounded-full flex justify-center items-center gap-2.5 shadow-[0_8px_20px_rgba(59,91,255,0.25)] mt-auto shrink-0 text-sm tracking-wide border-t border-transparent">
                        <UserPlus size={18} strokeWidth={2.5} />
                        Invite people
                    </button>
                </div>
            </aside>
            <style>{`
            .hide-scrollbar::-webkit-scrollbar { display: none; }
            .hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
            .custom-scrollbar::-webkit-scrollbar { width: 4px; }
            .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
            .custom-scrollbar::-webkit-scrollbar-thumb { background: #E5E7EB; border-radius: 4px; }
            `}</style>
        </div>
    );
}

// Separate component to properly attach MediaStream to video element
function RemoteVideo({ stream, name, isMain = false }: { stream: MediaStream; name: string; isMain?: boolean }) {
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
        <div className={`w-full h-full relative overflow-hidden ${isMain ? 'rounded-2xl bg-gray-900 border-none' : 'rounded-xl bg-gray-100'}`}>
            <video
                ref={videoRef}
                autoPlay
                playsInline
                className={`w-full h-full ${hasVideo ? '' : 'hidden'} ${isMain ? 'object-contain' : 'object-cover'}`}
            />
            {!hasVideo && (
                <div className={`absolute inset-0 flex items-center justify-center ${isMain ? 'bg-gray-900' : 'bg-gray-800'}`}>
                    <span className={`font-bold flex items-center justify-center rounded-full text-white ${isMain ? 'text-5xl w-32 h-32 bg-indigo-600 border-4' : 'text-3xl w-24 h-24 bg-indigo-600/30 border-2'} border-indigo-500/30`}>
                        {name.charAt(0).toUpperCase()}
                    </span>
                </div>
            )}
        </div>
    );
}
