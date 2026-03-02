// Main Application Class
class IoTMonitoringApp {
    constructor() {
        this.currentUser = null;
        this.token = localStorage.getItem('iot_token');
        this.apiBase = '/api';
        this.init();
    }

    async init() {
        try {
            // Initialize modules
            this.auth = new AuthModule(this);
            this.dashboard = new DashboardModule(this);
            this.devices = new DeviceModule(this);
            this.users = new UserModule(this);
            this.mapper = new DeviceMapperModule(this);
            this.data = new DataModule(this);
            this.settings = new SettingsModule(this);
            this.socket = new SocketModule(this);

            // Check authentication
            if (this.token) {
                const user = JSON.parse(localStorage.getItem('iot_user') || '{}');
                if (user.username) {
                    this.currentUser = user;
                    this.showDashboard();
                } else {
                    this.showLogin();
                }
            } else {
                this.showLogin();
            }

            // Initialize socket connection
            this.socket.connect();

        } catch (error) {
            console.error('Failed to initialize app:', error);
            this.showError('Failed to initialize application');
        }
    }

    showLogin() {
        document.getElementById('app').innerHTML = this.auth.render();
        this.auth.attachEventListeners();
    }

    showDashboard() {
        document.getElementById('app').innerHTML = this.dashboard.render();
        this.dashboard.attachEventListeners();
        this.dashboard.loadData();
    }

    showError(message) {
        const errorDiv = document.createElement('div');
        errorDiv.className = 'error-message';
        errorDiv.textContent = message;
        document.body.appendChild(errorDiv);
        setTimeout(() => errorDiv.remove(), 5000);
    }

    async apiRequest(endpoint, options = {}) {
        const url = `${this.apiBase}${endpoint}`;
        const config = {
            headers: {
                'Content-Type': 'application/json',
                ...(this.token && { 'Authorization': `Bearer ${this.token}` }),
                ...options.headers
            },
            ...options
        };

        try {
            const response = await fetch(url, config);
            const data = await response.json();

            if (!response.ok) {
                if (response.status === 401) {
                    this.logout();
                    return null;
                }
                throw new Error(data.error || 'API request failed');
            }

            return data;
        } catch (error) {
            console.error('API request failed:', error);
            this.showError(error.message);
            return null;
        }
    }

    logout() {
        localStorage.removeItem('iot_token');
        localStorage.removeItem('iot_user');
        this.token = null;
        this.currentUser = null;
        this.socket.disconnect();
        this.showLogin();
    }

    navigateTo(section) {
        const sections = ['dashboard', 'devices', 'users', 'mapper', 'data', 'settings'];
        sections.forEach(s => {
            const element = document.getElementById(`${s}-section`);
            if (element) element.style.display = s === section ? 'block' : 'none';
        });

        // Update active navigation
        document.querySelectorAll('.nav-item').forEach(item => {
            item.classList.remove('active');
        });
        document.querySelector(`[data-section="${section}"]`).classList.add('active');

        // Load section data
        switch (section) {
            case 'dashboard':
                this.dashboard.loadData();
                break;
            case 'devices':
                this.devices.loadDevices();
                break;
            case 'users':
                this.users.loadUsers();
                break;
            case 'mapper':
                this.mapper.loadMappers();
                break;
            case 'data':
                this.data.loadData();
                break;
            case 'settings':
                this.settings.loadSettings();
                break;
        }
    }
}

// Initialize app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.app = new IoTMonitoringApp();
}); 