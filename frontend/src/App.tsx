import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import AuthPage from './pages/Auth';
import Home from './pages/Home';
import Room from './pages/Room';

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
    const { isAuthenticated, isLoading } = useAuth();

    if (isLoading) {
        return <div className="min-h-screen bg-gray-900 flex items-center justify-center text-white">Loading...</div>;
    }

    return isAuthenticated ? <>{children}</> : <Navigate to="/auth" replace />;
};

function AppRoutes() {
    const { isAuthenticated } = useAuth();

    return (
        <Routes>
            <Route path="/auth" element={isAuthenticated ? <Navigate to="/" replace /> : <AuthPage />} />
            <Route path="/" element={<ProtectedRoute><Home /></ProtectedRoute>} />
            <Route path="/room/:roomId" element={<ProtectedRoute><Room /></ProtectedRoute>} />
        </Routes>
    );
}

function App() {
    return (
        <AuthProvider>
            <BrowserRouter>
                <AppRoutes />
            </BrowserRouter>
        </AuthProvider>
    );
}

export default App;
