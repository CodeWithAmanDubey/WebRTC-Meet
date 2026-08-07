import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { LogIn, UserPlus, Mail, Key, Sparkles, Video, Shield, Zap } from 'lucide-react';
import { BACKEND_URL } from '../config';
import { motion, AnimatePresence } from 'framer-motion';

export default function AuthPage() {
    const [isLogin, setIsLogin] = useState(true);
    const [signupStep, setSignupStep] = useState(1);

    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [name, setName] = useState('');
    const [otp, setOtp] = useState('');
    const [error, setError] = useState('');

    const { login } = useAuth();
    const navigate = useNavigate();

    const handleLoginSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        try {
            const res = await fetch(`${BACKEND_URL}/api/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Authentication failed');

            login(data.token, data.user);
            navigate('/');
        } catch (err: any) {
            setError(err.message);
        }
    };

    const handleSendOtp = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        try {
            const res = await fetch(`${BACKEND_URL}/api/auth/send-otp`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed to send OTP');

            setSignupStep(2);
        } catch (err: any) {
            setError(err.message);
        }
    };

    const handleVerifyOtp = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        try {
            const res = await fetch(`${BACKEND_URL}/api/auth/verify-otp`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, code: otp })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Invalid OTP');

            setSignupStep(3);
        } catch (err: any) {
            setError(err.message);
        }
    };

    const handleRegisterSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        try {
            const res = await fetch(`${BACKEND_URL}/api/auth/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, email, password })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Registration failed');

            login(data.token, data.user);
            navigate('/');
        } catch (err: any) {
            setError(err.message);
        }
    };

    const panelVariants = {
        hidden: { opacity: 0, x: -20 },
        visible: { opacity: 1, x: 0, transition: { duration: 0.4, ease: "easeOut" } },
        exit: { opacity: 0, x: 20, transition: { duration: 0.3 } }
    };

    return (
        <div className="min-h-screen w-full flex bg-white font-sans overflow-hidden selection:bg-neutral-900 selection:text-white">

            {/* Left Promotional Banner - Monochrome */}
            <div className="hidden lg:flex w-1/2 relative overflow-hidden items-center justify-center p-12 lg:p-20 bg-gradient-to-br from-neutral-900 to-black">
                {/* Animated Background Elements */}
                <motion.div
                    animate={{ rotate: 360, scale: [1, 1.1, 1] }}
                    transition={{ duration: 25, repeat: Infinity, ease: "linear" }}
                    className="absolute top-[-20%] left-[-10%] w-[140%] h-[140%] bg-white/5 blur-[100px] rounded-full pointer-events-none"
                />
                <motion.div
                    animate={{ y: [0, -30, 0] }}
                    transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
                    className="absolute bottom-10 right-10 w-96 h-96 bg-white/5 blur-[80px] rounded-full pointer-events-none"
                />

                <div className="relative z-10 w-full max-w-lg text-[#FFFFFF]">
                    <motion.div
                        initial={{ opacity: 0, y: 30 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.2, duration: 0.8 }}
                    >
                        <div className="flex items-center gap-3 mb-8">
                            <div className="p-3 bg-white/10 backdrop-blur-md rounded-2xl border border-white/10">
                                <Video className="w-10 h-10 text-white" />
                            </div>
                            <h1 className="text-4xl font-black tracking-tight text-white">Zoom<span className="text-neutral-400 font-medium">Clone</span></h1>
                        </div>

                        <h2 className="text-5xl font-extrabold mb-6 leading-tight text-white">
                            Connect from anywhere, with <span className="text-transparent bg-clip-text bg-gradient-to-r from-neutral-300 to-white">raw simplicity.</span>
                        </h2>
                        <p className="text-lg text-neutral-400 mb-12 leading-relaxed font-medium">
                            Experience the next generation of seamless WebRTC video conferencing. No downloads required, just share a link and collaborate securely.
                        </p>

                        <div className="space-y-6">
                            <div className="flex items-center gap-4">
                                <div className="p-2 bg-white/5 border border-white/10 rounded-lg"><Zap className="w-6 h-6 text-white" /></div>
                                <p className="text-white font-medium">Ultra-low latency streaming</p>
                            </div>
                            <div className="flex items-center gap-4">
                                <div className="p-2 bg-white/5 border border-white/10 rounded-lg"><Shield className="w-6 h-6 text-white" /></div>
                                <p className="text-white font-medium">End-to-end encryption</p>
                            </div>
                            <div className="flex items-center gap-4">
                                <div className="p-2 bg-white/5 border border-white/10 rounded-lg"><Sparkles className="w-6 h-6 text-white" /></div>
                                <p className="text-white font-medium">AI-powered noise cancellation</p>
                            </div>
                        </div>
                    </motion.div>
                </div>
            </div>

            {/* Right Authentication Form Pane */}
            <div className="w-full lg:w-1/2 flex items-center justify-center p-6 sm:p-12 relative bg-white">

                {/* Subtle mobile background glow */}
                <div className="absolute top-0 right-0 p-12 bg-neutral-100 rounded-full blur-[100px] pointer-events-none lg:hidden"></div>

                <div className="w-full max-w-md">

                    {/* Header Tabs (Sign In / Sign Up) */}
                    <div className="flex bg-neutral-100 p-1.5 rounded-xl mb-8 relative border border-neutral-200">
                        {/* Animated slider background */}
                        <motion.div
                            className="absolute top-1.5 bottom-1.5 w-[calc(50%-6px)] bg-neutral-900 rounded-lg shadow-md pointer-events-none"
                            initial={false}
                            animate={{ x: isLogin ? 0 : '100%' }}
                            transition={{ type: "spring", stiffness: 400, damping: 30 }}
                        />
                        <button
                            onClick={() => { setIsLogin(true); setError(''); }}
                            className={`flex-1 py-2.5 text-sm font-bold z-10 transition-colors ${isLogin ? 'text-white' : 'text-neutral-500 hover:text-neutral-900'}`}
                        >
                            Sign In
                        </button>
                        <button
                            onClick={() => { setIsLogin(false); setSignupStep(1); setError(''); }}
                            className={`flex-1 py-2.5 text-sm font-bold z-10 transition-colors ${!isLogin ? 'text-white' : 'text-neutral-500 hover:text-neutral-900'}`}
                        >
                            Sign Up
                        </button>
                    </div>

                    <div className="mb-8">
                        <h2 className="text-3xl font-black text-neutral-900 mb-2 tracking-tight">
                            {isLogin ? 'Welcome back' : 'Create an account'}
                        </h2>
                        <p className="text-neutral-500 font-medium">
                            {isLogin ? 'Enter your details to access your account' : 'Start your journey with ZoomClone today'}
                        </p>
                    </div>

                    {/* Error Banner */}
                    <AnimatePresence>
                        {error && (
                            <motion.div
                                initial={{ opacity: 0, y: -10, height: 0 }}
                                animate={{ opacity: 1, y: 0, height: 'auto' }}
                                exit={{ opacity: 0, y: -10, height: 0 }}
                                className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-xl text-sm mb-6 flex items-center shadow-sm overflow-hidden"
                            >
                                <Shield className="w-5 h-5 mr-3 flex-shrink-0" />
                                <span className="font-medium">{error}</span>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {/* Form Container with Animated Panels */}
                    <div className="relative">
                        <AnimatePresence mode="wait">
                            {isLogin ? (
                                /* LOGIN FORM */
                                <motion.form
                                    key="login-form"
                                    variants={panelVariants}
                                    initial="hidden" animate="visible" exit="exit"
                                    onSubmit={handleLoginSubmit}
                                    className="space-y-5"
                                >
                                    <div>
                                        <label className="block text-sm font-bold text-neutral-700 mb-1.5 ml-1">Email address</label>
                                        <input
                                            type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
                                            className="w-full bg-neutral-50 border-2 border-neutral-200 rounded-xl px-4 py-3.5 text-neutral-900 placeholder-neutral-400 focus:outline-none focus:border-neutral-900 focus:ring-4 focus:ring-neutral-900/10 transition-all font-medium"
                                            placeholder="Enter your email"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-bold text-neutral-700 mb-1.5 ml-1">Password</label>
                                        <input
                                            type="password" required value={password} onChange={(e) => setPassword(e.target.value)}
                                            className="w-full bg-neutral-50 border-2 border-neutral-200 rounded-xl px-4 py-3.5 text-neutral-900 placeholder-neutral-400 focus:outline-none focus:border-neutral-900 focus:ring-4 focus:ring-neutral-900/10 transition-all font-medium"
                                            placeholder="••••••••"
                                        />
                                    </div>
                                    <button type="submit" className="w-full bg-neutral-900 hover:bg-black text-white font-bold py-3.5 px-4 rounded-xl transition-all hover:shadow-[0_4px_20px_rgba(0,0,0,0.15)] active:scale-[0.98] mt-4 flex justify-center items-center gap-2">
                                        <LogIn className="w-5 h-5" /> Sign In
                                    </button>
                                </motion.form>
                            ) : (
                                /* SIGNUP WIZARD */
                                <motion.div key="signup-flow" variants={panelVariants} initial="hidden" animate="visible" exit="exit">
                                    <AnimatePresence mode="wait">

                                        {signupStep === 1 && (
                                            <motion.form key="step1" variants={panelVariants} initial="hidden" animate="visible" exit="exit" onSubmit={handleSendOtp} className="space-y-5">
                                                <div>
                                                    <label className="block text-sm font-bold text-neutral-700 mb-1.5 ml-1">Full Name</label>
                                                    <input
                                                        type="text" required value={name} onChange={(e) => setName(e.target.value)}
                                                        className="w-full bg-neutral-50 border-2 border-neutral-200 rounded-xl px-4 py-3.5 text-neutral-900 placeholder-neutral-400 focus:outline-none focus:border-neutral-900 focus:ring-4 focus:ring-neutral-900/10 transition-all font-medium"
                                                        placeholder="John Doe"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="block text-sm font-bold text-neutral-700 mb-1.5 ml-1">Email address</label>
                                                    <input
                                                        type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
                                                        className="w-full bg-neutral-50 border-2 border-neutral-200 rounded-xl px-4 py-3.5 text-neutral-900 placeholder-neutral-400 focus:outline-none focus:border-neutral-900 focus:ring-4 focus:ring-neutral-900/10 transition-all font-medium"
                                                        placeholder="Enter your email"
                                                    />
                                                </div>
                                                <button type="submit" className="w-full bg-neutral-900 hover:bg-black text-white font-bold py-3.5 px-4 rounded-xl transition-all hover:shadow-[0_4px_20px_rgba(0,0,0,0.15)] active:scale-[0.98] mt-4 flex justify-center items-center gap-2">
                                                    <Mail className="w-5 h-5" /> Continue with Email
                                                </button>
                                            </motion.form>
                                        )}

                                        {signupStep === 2 && (
                                            <motion.form key="step2" variants={panelVariants} initial="hidden" animate="visible" exit="exit" onSubmit={handleVerifyOtp} className="space-y-5">
                                                <div className="bg-neutral-100 border border-neutral-200 rounded-xl p-4 mb-2">
                                                    <p className="text-sm text-neutral-600 font-medium">
                                                        We sent a 6-digit verification code to <br /><span className="text-neutral-900 font-bold">{email}</span>
                                                    </p>
                                                </div>
                                                <div>
                                                    <input
                                                        type="text" required maxLength={6} value={otp} onChange={(e) => setOtp(e.target.value.replace(/[^0-9]/g, ''))}
                                                        className="w-full bg-neutral-50 border-2 border-neutral-200 rounded-xl px-4 py-4 text-neutral-900 text-center text-2xl tracking-[0.5em] font-mono focus:outline-none focus:border-neutral-900 focus:ring-4 focus:ring-neutral-900/10 transition-all font-bold"
                                                        placeholder="••••••"
                                                    />
                                                </div>
                                                <div className="flex gap-3 mt-2">
                                                    <button type="button" onClick={() => setSignupStep(1)} className="w-1/3 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 font-bold py-3.5 px-4 rounded-xl transition-colors border border-neutral-200">
                                                        Back
                                                    </button>
                                                    <button type="submit" className="w-2/3 bg-neutral-900 hover:bg-black text-white font-bold py-3.5 px-4 rounded-xl transition-all hover:shadow-[0_4px_20px_rgba(0,0,0,0.15)] active:scale-[0.98] flex justify-center items-center gap-2">
                                                        <Key className="w-5 h-5" /> Verify
                                                    </button>
                                                </div>
                                            </motion.form>
                                        )}

                                        {signupStep === 3 && (
                                            <motion.form key="step3" variants={panelVariants} initial="hidden" animate="visible" exit="exit" onSubmit={handleRegisterSubmit} className="space-y-5">
                                                <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 px-4 py-3 rounded-xl text-sm mb-4 flex items-center shadow-sm">
                                                    <Sparkles className="w-5 h-5 mr-3 flex-shrink-0 text-emerald-600" />
                                                    <span className="font-medium">Email verified completely! Just one last step.</span>
                                                </div>
                                                <div>
                                                    <label className="block text-sm font-bold text-neutral-700 mb-1.5 ml-1">Create Password</label>
                                                    <input
                                                        type="password" required value={password} onChange={(e) => setPassword(e.target.value)}
                                                        className="w-full bg-neutral-50 border-2 border-neutral-200 rounded-xl px-4 py-3.5 text-neutral-900 placeholder-neutral-400 focus:outline-none focus:border-neutral-900 focus:ring-4 focus:ring-neutral-900/10 transition-all font-medium"
                                                        placeholder="••••••••"
                                                    />
                                                </div>
                                                <button type="submit" className="w-full bg-neutral-900 hover:bg-black text-white font-bold py-3.5 px-4 rounded-xl transition-all hover:shadow-[0_4px_20px_rgba(0,0,0,0.15)] active:scale-[0.98] mt-4 flex justify-center items-center gap-2">
                                                    <UserPlus className="w-5 h-5" /> Secure Account
                                                </button>
                                            </motion.form>
                                        )}

                                    </AnimatePresence>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                </div>
            </div>

        </div>
    );
}
