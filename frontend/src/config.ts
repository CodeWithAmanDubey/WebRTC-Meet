// Backend URL configuration
// In production, use the environment variable set at build time
// In development, dynamically use the current hostname for LAN access
export const BACKEND_URL =
    import.meta.env.VITE_BACKEND_URL ||
    `http://${window.location.hostname}:8000`;
