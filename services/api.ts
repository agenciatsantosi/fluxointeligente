import axios from 'axios';

const api = axios.create({
    baseURL: '/api' + '',
    headers: {
        'Content-Type': 'application/json'
    }
});

api.interceptors.request.use((config) => {
    const token = localStorage.getItem('authToken');
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

api.interceptors.response.use(
    (response) => response,
    async (error) => {
        const config = error.config;
        
        // Setup global retry config for GET requests or transient errors
        if (config) {
            config.retry = config.retry || 10;
            config.retryDelay = config.retryDelay || 2000;
            config.__retryCount = config.__retryCount || 0;

            const isTransient = !error.response || (error.response.status >= 500 && error.response.status <= 599);

            // Only auto-retry GET requests or if explicitly allowed, to prevent double POSTs
            const isGetRequest = config.method?.toLowerCase() === 'get';

            if (isTransient && isGetRequest && config.__retryCount < config.retry) {
                config.__retryCount += 1;
                console.warn(`[API AUTO-RETRY] Connection issue detected. Retrying request (${config.__retryCount}/${config.retry}) to ${config.url}...`);
                
                // Wait before retrying
                await new Promise(resolve => setTimeout(resolve, config.retryDelay));
                
                // Retry the request
                return api(config);
            }
        }

        if (error.response && error.response.status === 401) {
            console.warn('[API AUTH] 401 Unauthorized detected.');

            // Only clear and redirect if we are NOT on the login page
            if (!window.location.pathname.includes('/login')) {
                console.error('[API AUTH] Persistent 401. Clearing session.');
                localStorage.removeItem('authToken');
                localStorage.removeItem('user');
                window.location.href = '/login';
            }
        }
        return Promise.reject(error);
    }
);

export default api;


