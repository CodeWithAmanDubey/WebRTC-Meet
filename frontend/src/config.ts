// Backend URL configuration
// In production, use VITE_BACKEND_URL or default to the Render backend URL
// In development, dynamically use the current hostname for LAN access
export const BACKEND_URL =
    import.meta.env.VITE_BACKEND_URL ||
    (import.meta.env.PROD
        ? "https://webrtc-meet-backend.onrender.com"
        : `http://${window.location.hostname}:8000`);
