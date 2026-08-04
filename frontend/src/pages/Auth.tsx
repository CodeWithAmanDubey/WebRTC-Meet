import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { LogIn, UserPlus } from 'lucide-react';
import { BACKEND_URL } from '../config';

export default function AuthPage() {
    const [isLogin, setIsLogin] = useState(true);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [name, setName] = useState('');
    const [error, setError] = useState('');

    const { login } = useAuth();
    const navigate = useNavigate();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        const endpoint = isLogin ? '/api/auth/login' : '/api/auth/register';
        const payload = isLogin ? { email, password } : { name, email, password };

        try {
            const res = await fetch(`${BACKEND_URL}${endpoint}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error || 'Authentication failed');
            }

            login(data.token, data.user);
            navigate('/');
        } catch (err: any) {
            setError(err.message);
        }
    };

    return (
        <div className="min-h-screen bg-gray-900 flex flex-col items-center justify-center p-4">
            <div className="w-full max-w-md bg-gray-800/80 backdrop-blur-md rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.12)] border border-gray-700 p-8 overflow-hidden relative">
                {/* Glow effect */}
                <div className="absolute top-0 right-0 p-12 bg-indigo-500 rounded-full blur-[80px] opacity-20 -mr-10 -mt-10 pointer-events-none"></div>
                <div className="absolute bottom-0 left-0 p-12 bg-purple-500 rounded-full blur-[80px] opacity-20 -ml-10 -mb-10 pointer-events-none"></div>

                <div className="relative z-10 text-center mb-8">
                    <h1 className="text-3xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-purple-400 mb-2">
                        {isLogin ? 'Welcome Back' : 'Create Account'}
                    </h1>
                    <p className="text-gray-400">
                        {isLogin ? 'Sign in to jump into your meetings' : 'Sign up to start hosting WebRTC meetings'}
                    </p>
                </div>

                {error && (
                    <div className="bg-red-500/10 border border-red-500/50 text-red-400 px-4 py-3 rounded-lg text-sm mb-6 relative z-10 flex items-center">
                        <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                        </svg>
                        {error}
                    </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-5 relative z-10">
                    {!isLogin && (
                        <div>
                            <label className="block text-sm font-medium text-gray-300 mb-1">Display Name</label>
                            <input
                                type="text"
                                required={!isLogin}
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                className="w-full bg-gray-900/50 border border-gray-700 rounded-lg px-4 py-3 text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                                placeholder="Jane Doe"
                            />
                        </div>
                    )}
                    <div>
                        <label className="block text-sm font-medium text-gray-300 mb-1">Email Address</label>
                        <input
                            type="email"
                            required
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className="w-full bg-gray-900/50 border border-gray-700 rounded-lg px-4 py-3 text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                            placeholder="jane@example.com"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-300 mb-1">Password</label>
                        <input
                            type="password"
                            required
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="w-full bg-gray-900/50 border border-gray-700 rounded-lg px-4 py-3 text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                            placeholder="••••••••"
                        />
                    </div>
                    <button
                        type="submit"
                        className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-3 px-4 rounded-lg transition-colors flex items-center justify-center gap-2 mt-4 shadow-lg shadow-indigo-600/30"
                    >
                        {isLogin ? <LogIn className="w-5 h-5" /> : <UserPlus className="w-5 h-5" />}
                        {isLogin ? 'Sign In' : 'Create Account'}
                    </button>
                </form>

                <div className="mt-8 text-center relative z-10 border-t border-gray-700 pt-6">
                    <p className="text-gray-400 text-sm">
                        {isLogin ? "Don't have an account?" : "Already have an account?"}
                        <button
                            type="button"
                            onClick={() => setIsLogin(!isLogin)}
                            className="ml-2 text-indigo-400 hover:text-indigo-300 font-medium transition-colors"
                        >
                            {isLogin ? 'Sign up' : 'Sign in'}
                        </button>
                    </p>
                </div>
            </div>
        </div>
    );
}
