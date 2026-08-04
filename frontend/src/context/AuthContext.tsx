import React, { createContext, useContext, useState, useEffect } from 'react';
import { BACKEND_URL } from '../config';

interface User {
    id: string;
    name: string;
    email: string;
}

interface AuthContextType {
    user: User | null;
    token: string | null;
    login: (token: string, user: User) => void;
    logout: () => void;
    isAuthenticated: boolean;
    isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [user, setUser] = useState<User | null>(null);
    const [token, setToken] = useState<string | null>(localStorage.getItem('token'));
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        // Check if token exists and fetch user profile
        const fetchMe = async () => {
            if (!token) {
                setIsLoading(false);
                return;
            }

            try {
                const res = await fetch(`${BACKEND_URL}/api/auth/me`, {
                    headers: {
                        Authorization: `Bearer ${token}`
                    }
                });
                if (res.ok) {
                    const data = await res.json();
                    setUser(data.user);
                } else {
                    localStorage.removeItem('token');
                    setToken(null);
                }
            } catch (err) {
                console.error('Failed to fetch user', err);
            } finally {
                setIsLoading(false);
            }
        };
        fetchMe();
    }, [token]);

    const login = (newToken: string, newUser: User) => {
        localStorage.setItem('token', newToken);
        setToken(newToken);
        setUser(newUser);
    };

    const logout = () => {
        localStorage.removeItem('token');
        setToken(null);
        setUser(null);
    };

    return (
        <AuthContext.Provider value={{ user, token, login, logout, isAuthenticated: !!user, isLoading }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (!context) throw new Error('useAuth must be used within an AuthProvider');
    return context;
};
