class DataModule {
    constructor(app) {
        this.app = app;
        this.data = [];
        this.devices = [];
        this.selectedDevice = null;
        this.timeRange = '24h';
        this.charts = {};
    }

    render() {
        return `
            <div class="data-container">
                <div class="section-header">
                    <h2>Data Visualization</h2>
                    <div class="data-controls">
                        <select id="deviceSelect" class="form-control">
                            <option value="">Select Device</option>
                        </select>
                        <select id="timeRangeSelect" class="form-control">
                            <option value="1h">Last Hour</option>
                            <option value="24h" selected>Last 24 Hours</option>
                            <option value="7d">Last 7 Days</option>
                            <option value="30d">Last 30 Days</option>
                            <option value="custom">Custom Range</option>
                        </select>
                        <button id="refreshDataBtn" class="btn btn-primary">Refresh</button>
                    </div>
                </div>

                <div id="customDateRange" class="custom-date-range" style="display: none;">
                    <div class="form-row">
                        <div class="form-group">
                            <label for="startDate">Start Date</label>
                            <input type="datetime-local" id="startDate" class="form-control">
                        </div>
                        <div class="form-group">
                            <label for="endDate">End Date</label>
                            <input type="datetime-local" id="endDate" class="form-control">
                        </div>
                        <div class="form-group">
                            <button id="applyDateRange" class="btn btn-secondary">Apply</button>
                        </div>
                    </div>
                </div>

                <div class="data-grid">
                    <div class="data-card">
                        <h3>Sensor Data</h3>
                        <div id="sensorChart" class="chart-container">
                            <div class="loading">Loading sensor data...</div>
                        </div>
                    </div>

                    <div class="data-card">
                        <h3>GPS Data</h3>
                        <div id="gpsChart" class="chart-container">
                            <div class="loading">Loading GPS data...</div>
                        </div>
                    </div>
                </div>

                <div class="data-table-section">
                    <h3>Raw Data</h3>
                    <div id="dataTable" class="data-table-container">
                        <div class="loading">Select a device to view data</div>
                    </div>
                </div>
            </div>
        `;
    }

    attachEventListeners() {
        // Device selection
        document.getElementById('deviceSelect').addEventListener('change', (e) => {
            this.selectedDevice = e.target.value;
            if (this.selectedDevice) {
                this.loadData();
            }
        });

        // Time range selection
        document.getElementById('timeRangeSelect').addEventListener('change', (e) => {
            this.timeRange = e.target.value;
            if (e.target.value === 'custom') {
                document.getElementById('customDateRange').style.display = 'block';
            } else {
                document.getElementById('customDateRange').style.display = 'none';
                if (this.selectedDevice) {
                    this.loadData();
                }
            }
        });

        // Custom date range
        document.getElementById('applyDateRange').addEventListener('click', () => {
            if (this.selectedDevice) {
                this.loadData();
            }
        });

        // Refresh button
        document.getElementById('refreshDataBtn').addEventListener('click', () => {
            if (this.selectedDevice) {
                this.loadData();
            }
        });
    }

    async loadDevices() {
        try {
            const response = await this.app.apiRequest('/devices');
            if (response) {
                this.devices = response.devices;
                this.populateDeviceSelect();
            }
        } catch (error) {
            console.error('Failed to load devices:', error);
        }
    }

    populateDeviceSelect() {
        const select = document.getElementById('deviceSelect');
        select.innerHTML = '<option value="">Select Device</option>';
        
        this.devices.forEach(device => {
            const option = document.createElement('option');
            option.value = device.id;
            option.textContent = `${device.name} (${device.device_id})`;
            select.appendChild(option);
        });
    }

    async loadData() {
        if (!this.selectedDevice) return;

        try {
            const params = new URLSearchParams({
                device_id: this.selectedDevice,
                time_range: this.timeRange
            });

            if (this.timeRange === 'custom') {
                const startDate = document.getElementById('startDate').value;
                const endDate = document.getElementById('endDate').value;
                if (startDate && endDate) {
                    params.append('start_date', startDate);
                    params.append('end_date', endDate);
                }
            }

            const response = await this.app.apiRequest(`/data?${params.toString()}`);
            if (response) {
                this.data = response.data;
                this.renderCharts();
                this.renderDataTable();
            }
        } catch (error) {
            console.error('Failed to load data:', error);
        }
    }

    renderCharts() {
        this.renderSensorChart();
        this.renderGpsChart();
    }

    renderSensorChart() {
        const container = document.getElementById('sensorChart');
        const sensorData = this.data.filter(d => d.data_type === 'sensor');
        
        if (sensorData.length === 0) {
            container.innerHTML = '<div class="empty-state">No sensor data available</div>';
            return;
        }

        // Group data by field
        const fieldGroups = {};
        sensorData.forEach(record => {
            Object.keys(record.data).forEach(field => {
                if (!fieldGroups[field]) {
                    fieldGroups[field] = [];
                }
                fieldGroups[field].push({
                    timestamp: new Date(record.timestamp),
                    value: record.data[field]
                });
            });
        });

        // Create chart HTML
        let chartHtml = '<div class="sensor-charts">';
        Object.keys(fieldGroups).forEach(field => {
            const data = fieldGroups[field];
            const chartId = `chart-${field.replace(/[^a-zA-Z0-9]/g, '')}`;
            
            chartHtml += `
                <div class="chart-item">
                    <h4>${field}</h4>
                    <canvas id="${chartId}" width="400" height="200"></canvas>
                </div>
            `;
        });
        chartHtml += '</div>';
        
        container.innerHTML = chartHtml;

        // Initialize charts (simplified - in a real app you'd use Chart.js)
        Object.keys(fieldGroups).forEach(field => {
            const chartId = `chart-${field.replace(/[^a-zA-Z0-9]/g, '')}`;
            this.createSimpleChart(chartId, fieldGroups[field], field);
        });
    }

    renderGpsChart() {
        const container = document.getElementById('gpsChart');
        const gpsData = this.data.filter(d => d.data_type === 'gps');
        
        if (gpsData.length === 0) {
            container.innerHTML = '<div class="empty-state">No GPS data available</div>';
            return;
        }

        // Create a simple map visualization
        const coordinates = gpsData.map(record => ({
            lat: record.data.latitude,
            lng: record.data.longitude,
            timestamp: new Date(record.timestamp)
        }));

        container.innerHTML = `
            <div class="gps-map">
                <h4>GPS Track</h4>
                <div class="map-container">
                    <div class="coordinates-list">
                        ${coordinates.map(coord => `
                            <div class="coordinate-item">
                                <span class="coord">${coord.lat.toFixed(6)}, ${coord.lng.toFixed(6)}</span>
                                <span class="time">${coord.timestamp.toLocaleString()}</span>
                            </div>
                        `).join('')}
                    </div>
                </div>
            </div>
        `;
    }

    createSimpleChart(canvasId, data, fieldName) {
        const canvas = document.getElementById(canvasId);
        const ctx = canvas.getContext('2d');
        const width = canvas.width;
        const height = canvas.height;

        // Clear canvas
        ctx.clearRect(0, 0, width, height);

        if (data.length < 2) {
            ctx.fillStyle = '#666';
            ctx.font = '14px Arial';
            ctx.textAlign = 'center';
            ctx.fillText('Insufficient data', width / 2, height / 2);
            return;
        }

        // Find min/max values
        const values = data.map(d => d.value).filter(v => !isNaN(v));
        const minValue = Math.min(...values);
        const maxValue = Math.max(...values);
        const valueRange = maxValue - minValue;

        // Draw chart
        ctx.strokeStyle = '#667eea';
        ctx.lineWidth = 2;
        ctx.beginPath();

        data.forEach((point, index) => {
            const x = (index / (data.length - 1)) * width;
            const y = height - ((point.value - minValue) / valueRange) * height;
            
            if (index === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        });

        ctx.stroke();

        // Draw points
        ctx.fillStyle = '#667eea';
        data.forEach((point, index) => {
            const x = (index / (data.length - 1)) * width;
            const y = height - ((point.value - minValue) / valueRange) * height;
            
            ctx.beginPath();
            ctx.arc(x, y, 3, 0, 2 * Math.PI);
            ctx.fill();
        });
    }

    renderDataTable() {
        const container = document.getElementById('dataTable');
        
        if (this.data.length === 0) {
            container.innerHTML = '<div class="empty-state">No data available for the selected criteria</div>';
            return;
        }

        container.innerHTML = `
            <table class="data-table">
                <thead>
                    <tr>
                        <th>Timestamp</th>
                        <th>Device</th>
                        <th>Type</th>
                        <th>Data</th>
                    </tr>
                </thead>
                <tbody>
                    ${this.data.map(record => `
                        <tr>
                            <td>${new Date(record.timestamp).toLocaleString()}</td>
                            <td>${record.device_name}</td>
                            <td><span class="badge badge-${record.data_type}">${record.data_type}</span></td>
                            <td>
                                <pre class="data-json">${JSON.stringify(record.data, null, 2)}</pre>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
    }
} 