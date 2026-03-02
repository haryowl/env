class DeviceMapperModule {
    constructor(app) {
        this.app = app;
        this.mappers = [];
    }

    render() {
        return `
            <div class="mapper-container">
                <div class="section-header">
                    <h2>Device Mapper</h2>
                    <button id="addMapperBtn" class="btn btn-primary">Add Mapper</button>
                </div>

                <div class="mapper-grid">
                    <div class="mapper-list">
                        <div class="list-header">
                            <h3>Field Mappers</h3>
                            <div class="list-actions">
                                <input type="text" id="mapperSearch" placeholder="Search mappers..." class="search-input">
                            </div>
                        </div>
                        <div id="mapperList" class="mapper-table">
                            <div class="loading">Loading mappers...</div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Add/Edit Mapper Modal -->
            <div id="mapperModal" class="modal" style="display: none;">
                <div class="modal-content">
                    <div class="modal-header">
                        <h3 id="mapperModalTitle">Add Field Mapper</h3>
                        <button id="closeMapperModal" class="modal-close">&times;</button>
                    </div>
                    <form id="mapperForm">
                        <div class="form-row">
                            <div class="form-group">
                                <label for="mapperName">Mapper Name</label>
                                <input type="text" id="mapperName" name="name" required>
                            </div>
                            <div class="form-group">
                                <label for="mapperDevice">Device</label>
                                <select id="mapperDevice" name="device_id" required>
                                    <option value="">Select Device</option>
                                </select>
                            </div>
                        </div>
                        <div class="form-group">
                            <label for="mapperDescription">Description</label>
                            <textarea id="mapperDescription" name="description" rows="3"></textarea>
                        </div>
                        
                        <div class="mapping-fields">
                            <h4>Field Mappings</h4>
                            <div id="mappingFields">
                                <div class="mapping-field">
                                    <div class="form-row">
                                        <div class="form-group">
                                            <label>Source Field</label>
                                            <input type="text" name="source_fields[]" placeholder="e.g., temp, humidity" required>
                                        </div>
                                        <div class="form-group">
                                            <label>Target Field</label>
                                            <input type="text" name="target_fields[]" placeholder="e.g., temperature, humidity" required>
                                        </div>
                                        <div class="form-group">
                                            <label>Data Type</label>
                                            <select name="data_types[]" required>
                                                <option value="">Select Type</option>
                                                <option value="number">Number</option>
                                                <option value="string">String</option>
                                                <option value="boolean">Boolean</option>
                                                <option value="timestamp">Timestamp</option>
                                            </select>
                                        </div>
                                        <button type="button" class="btn btn-sm btn-danger remove-field">Remove</button>
                                    </div>
                                </div>
                            </div>
                            <button type="button" id="addFieldBtn" class="btn btn-secondary">Add Field</button>
                        </div>

                        <div class="form-actions">
                            <button type="button" id="cancelMapperBtn" class="btn btn-secondary">Cancel</button>
                            <button type="submit" id="saveMapperBtn" class="btn btn-primary">Save Mapper</button>
                        </div>
                    </form>
                </div>
            </div>
        `;
    }

    attachEventListeners() {
        // Add mapper button
        document.getElementById('addMapperBtn').addEventListener('click', () => {
            this.showModal();
        });

        // Modal close button
        document.getElementById('closeMapperModal').addEventListener('click', () => {
            this.hideModal();
        });

        // Cancel button
        document.getElementById('cancelMapperBtn').addEventListener('click', () => {
            this.hideModal();
        });

        // Mapper form submission
        document.getElementById('mapperForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.saveMapper();
        });

        // Search functionality
        document.getElementById('mapperSearch').addEventListener('input', (e) => {
            this.filterMappers(e.target.value);
        });

        // Add field button
        document.getElementById('addFieldBtn').addEventListener('click', () => {
            this.addMappingField();
        });

        // Remove field buttons (delegated)
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('remove-field')) {
                e.target.closest('.mapping-field').remove();
            }
        });
    }

    async loadMappers() {
        try {
            const response = await this.app.apiRequest('/device-mapper');
            if (response) {
                this.mappers = response.mappers;
                this.renderMappers();
            }
        } catch (error) {
            console.error('Failed to load mappers:', error);
        }
    }

    async loadDevices() {
        try {
            const response = await this.app.apiRequest('/devices');
            if (response) {
                const deviceSelect = document.getElementById('mapperDevice');
                deviceSelect.innerHTML = '<option value="">Select Device</option>';
                
                response.devices.forEach(device => {
                    const option = document.createElement('option');
                    option.value = device.id;
                    option.textContent = `${device.name} (${device.device_id})`;
                    deviceSelect.appendChild(option);
                });
            }
        } catch (error) {
            console.error('Failed to load devices:', error);
        }
    }

    renderMappers() {
        const container = document.getElementById('mapperList');
        
        if (this.mappers.length === 0) {
            container.innerHTML = '<div class="empty-state">No mappers found. Add your first mapper to get started!</div>';
            return;
        }

        container.innerHTML = `
            <table class="data-table">
                <thead>
                    <tr>
                        <th>Name</th>
                        <th>Device</th>
                        <th>Description</th>
                        <th>Fields</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    ${this.mappers.map(mapper => `
                        <tr>
                            <td>
                                <div class="mapper-name">
                                    <strong>${mapper.name}</strong>
                                </div>
                            </td>
                            <td>${mapper.device_name}</td>
                            <td>${mapper.description || '-'}</td>
                            <td>
                                <div class="field-mappings">
                                    ${mapper.mappings.map(mapping => 
                                        `<span class="mapping-badge">${mapping.source_field} → ${mapping.target_field}</span>`
                                    ).join('')}
                                </div>
                            </td>
                            <td>
                                <div class="action-buttons">
                                    <button class="btn btn-sm btn-secondary" onclick="app.mapper.editMapper('${mapper.id}')">Edit</button>
                                    <button class="btn btn-sm btn-danger" onclick="app.mapper.deleteMapper('${mapper.id}')">Delete</button>
                                </div>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
    }

    filterMappers(searchTerm) {
        const filtered = this.mappers.filter(mapper => 
            mapper.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            mapper.device_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            (mapper.description && mapper.description.toLowerCase().includes(searchTerm.toLowerCase()))
        );
        this.renderFilteredMappers(filtered);
    }

    renderFilteredMappers(mappers) {
        const container = document.getElementById('mapperList');
        
        if (mappers.length === 0) {
            container.innerHTML = '<div class="empty-state">No mappers match your search.</div>';
            return;
        }

        // Reuse the same table structure as renderMappers but with filtered data
        container.innerHTML = `
            <table class="data-table">
                <thead>
                    <tr>
                        <th>Name</th>
                        <th>Device</th>
                        <th>Description</th>
                        <th>Fields</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    ${mappers.map(mapper => `
                        <tr>
                            <td>
                                <div class="mapper-name">
                                    <strong>${mapper.name}</strong>
                                </div>
                            </td>
                            <td>${mapper.device_name}</td>
                            <td>${mapper.description || '-'}</td>
                            <td>
                                <div class="field-mappings">
                                    ${mapper.mappings.map(mapping => 
                                        `<span class="mapping-badge">${mapping.source_field} → ${mapping.target_field}</span>`
                                    ).join('')}
                                </div>
                            </td>
                            <td>
                                <div class="action-buttons">
                                    <button class="btn btn-sm btn-secondary" onclick="app.mapper.editMapper('${mapper.id}')">Edit</button>
                                    <button class="btn btn-sm btn-danger" onclick="app.mapper.deleteMapper('${mapper.id}')">Delete</button>
                                </div>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
    }

    addMappingField() {
        const container = document.getElementById('mappingFields');
        const fieldDiv = document.createElement('div');
        fieldDiv.className = 'mapping-field';
        fieldDiv.innerHTML = `
            <div class="form-row">
                <div class="form-group">
                    <label>Source Field</label>
                    <input type="text" name="source_fields[]" placeholder="e.g., temp, humidity" required>
                </div>
                <div class="form-group">
                    <label>Target Field</label>
                    <input type="text" name="target_fields[]" placeholder="e.g., temperature, humidity" required>
                </div>
                <div class="form-group">
                    <label>Data Type</label>
                    <select name="data_types[]" required>
                        <option value="">Select Type</option>
                        <option value="number">Number</option>
                        <option value="string">String</option>
                        <option value="boolean">Boolean</option>
                        <option value="timestamp">Timestamp</option>
                    </select>
                </div>
                <button type="button" class="btn btn-sm btn-danger remove-field">Remove</button>
            </div>
        `;
        container.appendChild(fieldDiv);
    }

    showModal(mapper = null) {
        const modal = document.getElementById('mapperModal');
        const title = document.getElementById('mapperModalTitle');
        const form = document.getElementById('mapperForm');

        // Load devices for dropdown
        this.loadDevices();

        if (mapper) {
            title.textContent = 'Edit Field Mapper';
            form.dataset.mapperId = mapper.id;
            // Populate form fields
            document.getElementById('mapperName').value = mapper.name;
            document.getElementById('mapperDescription').value = mapper.description || '';
            
            // Clear existing mapping fields
            document.getElementById('mappingFields').innerHTML = '';
            
            // Add mapping fields
            mapper.mappings.forEach(mapping => {
                this.addMappingField();
                const fields = document.querySelectorAll('.mapping-field');
                const lastField = fields[fields.length - 1];
                lastField.querySelector('input[name="source_fields[]"]').value = mapping.source_field;
                lastField.querySelector('input[name="target_fields[]"]').value = mapping.target_field;
                lastField.querySelector('select[name="data_types[]"]').value = mapping.data_type;
            });
        } else {
            title.textContent = 'Add Field Mapper';
            delete form.dataset.mapperId;
            form.reset();
            // Clear mapping fields and add one default
            document.getElementById('mappingFields').innerHTML = '';
            this.addMappingField();
        }

        modal.style.display = 'block';
    }

    hideModal() {
        document.getElementById('mapperModal').style.display = 'none';
    }

    async saveMapper() {
        const form = document.getElementById('mapperForm');
        const mapperId = form.dataset.mapperId;
        const formData = new FormData(form);
        
        // Build mappings array
        const sourceFields = formData.getAll('source_fields[]');
        const targetFields = formData.getAll('target_fields[]');
        const dataTypes = formData.getAll('data_types[]');
        
        const mappings = sourceFields.map((source, index) => ({
            source_field: source,
            target_field: targetFields[index],
            data_type: dataTypes[index]
        }));

        const mapperData = {
            name: formData.get('name'),
            device_id: formData.get('device_id'),
            description: formData.get('description'),
            mappings: mappings
        };

        try {
            const endpoint = mapperId ? `/device-mapper/${mapperId}` : '/device-mapper';
            const method = mapperId ? 'PUT' : 'POST';
            
            const response = await this.app.apiRequest(endpoint, {
                method,
                body: JSON.stringify(mapperData)
            });

            if (response) {
                this.hideModal();
                this.loadMappers();
                this.app.showMessage('Mapper saved successfully!', 'success');
            }
        } catch (error) {
            console.error('Failed to save mapper:', error);
        }
    }

    async editMapper(mapperId) {
        const mapper = this.mappers.find(m => m.id === mapperId);
        if (mapper) {
            this.showModal(mapper);
        }
    }

    async deleteMapper(mapperId) {
        if (confirm('Are you sure you want to delete this mapper?')) {
            try {
                const response = await this.app.apiRequest(`/device-mapper/${mapperId}`, {
                    method: 'DELETE'
                });

                if (response) {
                    this.loadMappers();
                    this.app.showMessage('Mapper deleted successfully!', 'success');
                }
            } catch (error) {
                console.error('Failed to delete mapper:', error);
            }
        }
    }
} 