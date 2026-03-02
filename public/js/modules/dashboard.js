class DashboardModule {
    constructor(app) {
        this.app = app;
        this.data = null;
        this.updateInterval = null;
    }

    render() {
        return `
            <div class="dashboard-container">
                <div class="dashboard-header">
                    <h1>🔌 IoT Monitoring Dashboard</h1>
                    <div class="user-info">
                        <span>Welcome, <span id="userName">${this.app.currentUser?.username || 'User'}</span></span>
                        <button id="logoutBtn" class="btn btn-danger">Logout</button>
                    </div>
                </div>

                <div class="dashboard-nav">
                    <button class="nav-item active" data-section="dashboard">Dashboard</button>
                    <button class="nav-item" data-section="devices">Devices</button>
                    <button class="nav-item" data-section="users">Users</button>
                    <button class="nav-item" data-section="mapper">Device Mapper</button>
                    <button class="nav-item" data-section="data">Data</button>
                    <button class="nav-item" data-section="settings">Settings</button>
                </div>

                <div id="dashboard-section" class="dashboard-content">
                    <div class="stats-grid">
                        <div class="stat-card">
                            <h3>Total Devices</h3>
                            <div class="stat-value" id="totalDevices">-</div>
                        </div>
                        <div class="stat-card">
                            <h3>Online Devices</h3>
                            <div class="stat-value" id="onlineDevices">-</div>
                        </div>
                        <div class="stat-card">
                            <h3>Total Users</h3>
                            <div class="stat-value" id="totalUsers">-</div>
                        </div>
                        <div class="stat-card">
                            <h3>Data Points</h3>
                            <div class="stat-value" id="totalData">-</div>
                        </div>
                    </div>

                    <div class="dashboard-grid">
                        <div class="dashboard-card">
                            <h3>Device Status</h3>
                            <div id="deviceStatusList" class="device-status-list">
                                <div class="loading">Loading devices...</div>
                            </div>
                        </div>

                        <div class="dashboard-card">
                            <h3>Recent Activity</h3>
                            <div id="recentActivity" class="activity-list">
                                <div class="loading">Loading activity...</div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Other sections will be loaded dynamically -->
                <div id="devices-section" class="dashboard-content" style="display: none;"></div>
                <div id="users-section" class="dashboard-content" style="display: none;"></div>
                <div id="mapper-section" class="dashboard-content" style="display: none;"></div>
                <div id="data-section" class="dashboard-content" style="display: none;"></div>
                <div id="settings-section" class="dashboard-content" style="display: none;"></div>
            </div>
        `;
    }

    attachEventListeners() {
        // Logout button
        document.getElementById('logoutBtn').addEventListener('click', () => {
            this.app.logout();
        });

        // Navigation
        document.querySelectorAll('.nav-item').forEach(item => {
            item.addEventListener('click', (e) => {
                const section = e.target.dataset.section;
                this.app.navigateTo(section);
            });
        });
    }

    async loadData() {
        try {
            // Load overview data
            const overview = await this.app.apiRequest('/dashboard/overview');
            if (overview) {
                this.updateStats(overview);
            }

            // Load device status
            const devices = await this.app.apiRequest('/devices');
            if (devices) {
                this.updateDeviceStatus(devices.devices);
            }

            // Load recent activity
            const activity = await this.app.apiRequest('/data/recent');
            if (activity) {
                this.updateRecentActivity(activity.data);
            }

            // Start real-time updates
            this.startRealTimeUpdates();

        } catch (error) {
            console.error('Failed to load dashboard data:', error);
        }
    }

    updateStats(data) {
        const { overview, deviceStatus } = data;
        
        document.getElementById('totalDevices').textContent = overview.totalDevices;
        document.getElementById('onlineDevices').textContent = 
            deviceStatus.find(s => s.status === 'online')?.count || 0;
        document.getElementById('totalUsers').textContent = overview.totalUsers;
        document.getElementById('totalData').textContent = 
            overview.totalSensorData + overview.totalGpsData;
    }

    updateDeviceStatus(devices) {
        const container = document.getElementById('deviceStatusList');
        
        if (devices.length === 0) {
            container.innerHTML = '<div class="empty-state">No devices found</div>';
            return;
        }

        container.innerHTML = devices.map(device => `
            <div class="device-status-item">
                <div class="device-info">
                    <strong>${device.name}</strong>
                    <small>${device.device_id} • ${device.protocol}</small>
                </div>
                <span class="status-badge status-${device.status}">${device.status}</span>
            </div>
        `).join('');
    }

    updateRecentActivity(activities) {
        const container = document.getElementById('recentActivity');
        
        if (activities.length === 0) {
            container.innerHTML = '<div class="empty-state">No recent activity</div>';
            return;
        }

        container.innerHTML = activities.map(activity => `
            <div class="activity-item">
                <div class="activity-icon">📊</div>
                <div class="activity-content">
                    <div class="activity-title">${activity.device_name}</div>
                    <div class="activity-desc">${activity.description}</div>
                    <div class="activity-time">${new Date(activity.timestamp).toLocaleString()}</div>
                </div>
            </div>
        `).join('');
    }

    startRealTimeUpdates() {
        // Clear existing interval
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
        }

        // Update every 30 seconds
        this.updateInterval = setInterval(() => {
            this.loadData();
        }, 30000);
    }

    destroy() {
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
        }
    }
} 