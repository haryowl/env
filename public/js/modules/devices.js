class DeviceModule {
    constructor(app) {
        this.app = app;
        this.devices = [];
    }

    render() {
        return `
            <div class="devices-container">
                <div class="section-header">
                    <h2>Device Management</h2>
                    <button id="addDeviceBtn" class="btn btn-primary">Add Device</button>
                </div>

                <div class="devices-grid">
                    <div class="devices-list">
                        <div class="list-header">
                            <h3>Devices</h3>
                            <div class="list-actions">
                                <input type="text" id="deviceSearch" placeholder="Search devices..." class="search-input">
                            </div>
                        </div>
                        <div id="devicesList" class="devices-table">
                            <div class="loading">Loading devices...</div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Add/Edit Device Modal -->
            <div id="deviceModal" class="modal" style="display: none;">
                <div class="modal-content">
                    <div class="modal-header">
                        <h3 id="modalTitle">Add Device</h3>
                        <button id="closeModal" class="modal-close">&times;</button>
                    </div>
                    <form id="deviceForm">
                        <div class="form-row">
                            <div class="form-group">
                                <label for="deviceName">Device Name</label>
                                <input type="text" id="deviceName" name="name" required>
                            </div>
                            <div class="form-group">
                                <label for="deviceId">Device ID</label>
                                <input type="text" id="deviceId" name="device_id" required>
                            </div>
                        </div>
                        <div class="form-row">
                            <div class="form-group">
                                <label for="deviceProtocol">Protocol</label>
                                <select id="deviceProtocol" name="protocol" required>
                                    <option value="">Select Protocol</option>
                                    <option value="mqtt">MQTT</option>
                                    <option value="http">HTTP</option>
                                    <option value="tcp">TCP</option>
                                    <option value="udp">UDP</option>
                                </select>
                            </div>
                            <div class="form-group">
                                <label for="deviceType">Device Type</label>
                                <select id="deviceType" name="device_type" required>
                                    <option value="">Select Type</option>
                                    <option value="sensor">Sensor</option>
                                    <option value="gps">GPS</option>
                                    <option value="controller">Controller</option>
                                </select>
                            </div>
                        </div>
                        <div class="form-group">
                            <label for="deviceDescription">Description</label>
                            <textarea id="deviceDescription" name="description" rows="3"></textarea>
                        </div>
                        <div class="form-group">
                            <label for="deviceLocation">Location</label>
                            <input type="text" id="deviceLocation" name="location">
                        </div>
                        <div class="form-actions">
                            <button type="button" id="cancelBtn" class="btn btn-secondary">Cancel</button>
                            <button type="submit" id="saveDeviceBtn" class="btn btn-primary">Save Device</button>
                        </div>
                    </form>
                </div>
            </div>
        `;
    }

    attachEventListeners() {
        // Add device button
        document.getElementById('addDeviceBtn').addEventListener('click', () => {
            this.showModal();
        });

        // Modal close button
        document.getElementById('closeModal').addEventListener('click', () => {
            this.hideModal();
        });

        // Cancel button
        document.getElementById('cancelBtn').addEventListener('click', () => {
            this.hideModal();
        });

        // Device form submission
        document.getElementById('deviceForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.saveDevice();
        });

        // Search functionality
        document.getElementById('deviceSearch').addEventListener('input', (e) => {
            this.filterDevices(e.target.value);
        });
    }

    async loadDevices() {
        try {
            const response = await this.app.apiRequest('/devices');
            if (response) {
                this.devices = response.devices;
                this.renderDevices();
            }
        } catch (error) {
            console.error('Failed to load devices:', error);
        }
    }

    renderDevices() {
        const container = document.getElementById('devicesList');
        
        if (this.devices.length === 0) {
            container.innerHTML = '<div class="empty-state">No devices found. Add your first device to get started!</div>';
            return;
        }

        container.innerHTML = `
            <table class="data-table">
                <thead>
                    <tr>
                        <th>Name</th>
                        <th>Device ID</th>
                        <th>Protocol</th>
                        <th>Type</th>
                        <th>Status</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    ${this.devices.map(device => `
                        <tr>
                            <td>
                                <div class="device-name">
                                    <strong>${device.name}</strong>
                                    ${device.description ? `<br><small>${device.description}</small>` : ''}
                                </div>
                            </td>
                            <td><code>${device.device_id}</code></td>
                            <td><span class="badge badge-${device.protocol}">${device.protocol.toUpperCase()}</span></td>
                            <td><span class="badge badge-${device.device_type}">${device.device_type}</span></td>
                            <td><span class="status-badge status-${device.status}">${device.status}</span></td>
                            <td>
                                <div class="action-buttons">
                                    <button class="btn btn-sm btn-secondary" onclick="app.devices.editDevice('${device.id}')">Edit</button>
                                    <button class="btn btn-sm btn-danger" onclick="app.devices.deleteDevice('${device.id}')">Delete</button>
                                </div>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
    }

    filterDevices(searchTerm) {
        const filtered = this.devices.filter(device => 
            device.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            device.device_id.toLowerCase().includes(searchTerm.toLowerCase()) ||
            device.protocol.toLowerCase().includes(searchTerm.toLowerCase())
        );
        this.renderFilteredDevices(filtered);
    }

    renderFilteredDevices(devices) {
        const container = document.getElementById('devicesList');
        
        if (devices.length === 0) {
            container.innerHTML = '<div class="empty-state">No devices match your search.</div>';
            return;
        }

        // Reuse the same table structure as renderDevices but with filtered data
        container.innerHTML = `
            <table class="data-table">
                <thead>
                    <tr>
                        <th>Name</th>
                        <th>Device ID</th>
                        <th>Protocol</th>
                        <th>Type</th>
                        <th>Status</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    ${devices.map(device => `
                        <tr>
                            <td>
                                <div class="device-name">
                                    <strong>${device.name}</strong>
                                    ${device.description ? `<br><small>${device.description}</small>` : ''}
                                </div>
                            </td>
                            <td><code>${device.device_id}</code></td>
                            <td><span class="badge badge-${device.protocol}">${device.protocol.toUpperCase()}</span></td>
                            <td><span class="badge badge-${device.device_type}">${device.device_type}</span></td>
                            <td><span class="status-badge status-${device.status}">${device.status}</span></td>
                            <td>
                                <div class="action-buttons">
                                    <button class="btn btn-sm btn-secondary" onclick="app.devices.editDevice('${device.id}')">Edit</button>
                                    <button class="btn btn-sm btn-danger" onclick="app.devices.deleteDevice('${device.id}')">Delete</button>
                                </div>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
    }

    showModal(device = null) {
        const modal = document.getElementById('deviceModal');
        const title = document.getElementById('modalTitle');
        const form = document.getElementById('deviceForm');

        if (device) {
            title.textContent = 'Edit Device';
            form.dataset.deviceId = device.id;
            // Populate form fields
            document.getElementById('deviceName').value = device.name;
            document.getElementById('deviceId').value = device.device_id;
            document.getElementById('deviceProtocol').value = device.protocol;
            document.getElementById('deviceType').value = device.device_type;
            document.getElementById('deviceDescription').value = device.description || '';
            document.getElementById('deviceLocation').value = device.location || '';
        } else {
            title.textContent = 'Add Device';
            delete form.dataset.deviceId;
            form.reset();
        }

        modal.style.display = 'block';
    }

    hideModal() {
        document.getElementById('deviceModal').style.display = 'none';
    }

    async saveDevice() {
        const form = document.getElementById('deviceForm');
        const deviceId = form.dataset.deviceId;
        const formData = new FormData(form);
        const deviceData = Object.fromEntries(formData.entries());

        try {
            const endpoint = deviceId ? `/devices/${deviceId}` : '/devices';
            const method = deviceId ? 'PUT' : 'POST';
            
            const response = await this.app.apiRequest(endpoint, {
                method,
                body: JSON.stringify(deviceData)
            });

            if (response) {
                this.hideModal();
                this.loadDevices();
                this.app.showMessage('Device saved successfully!', 'success');
            }
        } catch (error) {
            console.error('Failed to save device:', error);
        }
    }

    async editDevice(deviceId) {
        const device = this.devices.find(d => d.id === deviceId);
        if (device) {
            this.showModal(device);
        }
    }

    async deleteDevice(deviceId) {
        if (confirm('Are you sure you want to delete this device?')) {
            try {
                const response = await this.app.apiRequest(`/devices/${deviceId}`, {
                    method: 'DELETE'
                });

                if (response) {
                    this.loadDevices();
                    this.app.showMessage('Device deleted successfully!', 'success');
                }
            } catch (error) {
                console.error('Failed to delete device:', error);
            }
        }
    }
} 