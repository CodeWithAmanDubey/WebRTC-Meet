import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { io, Socket } from 'socket.io-client';
import { Mic, MicOff, Video as VideoIcon, VideoOff, PhoneOff, Monitor } from 'lucide-react';
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

export default function Room() {
    const { roomId } = useParams<{ roomId: string }>();
    const { user, token } = useAuth();
    const navigate = useNavigate();

    const [isMuted, setIsMuted] = useState(false);
    const [isVideoOff, setIsVideoOff] = useState(false);
    const [peers, setPeers] = useState<PeerData[]>([]);

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

            // 3. NOW join the room (after all handlers are set up)
            socket.emit('join-room', { roomId, userId: user?.id, name: user?.name });
            console.log(`[Signal] Joined room ${roomId} as ${user?.name}`);
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

            <main className={`flex-grow grid ${gridCols} gap-4 mb-20 relative auto-rows-fr`}>
                {/* Local Video */}
                <div className="bg-gray-900 rounded-2xl overflow-hidden relative border border-gray-800 shadow-xl h-full min-h-[250px]">
                    <video
                        ref={localVideoRef}
                        autoPlay
                        playsInline
                        muted
                        className={`w-full h-full object-cover -scale-x-100 ${isVideoOff ? 'hidden' : ''}`}
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

            <footer className="fixed bottom-0 left-0 right-0 h-20 bg-gray-900/90 backdrop-blur-md border-t border-gray-800 flex justify-center items-center gap-4 px-4 shadow-2xl">
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
