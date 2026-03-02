class UserModule {
    constructor(app) {
        this.app = app;
        this.users = [];
    }

    render() {
        return `
            <div class="users-container">
                <div class="section-header">
                    <h2>User Management</h2>
                    <button id="addUserBtn" class="btn btn-primary">Add User</button>
                </div>

                <div class="users-grid">
                    <div class="users-list">
                        <div class="list-header">
                            <h3>Users</h3>
                            <div class="list-actions">
                                <input type="text" id="userSearch" placeholder="Search users..." class="search-input">
                            </div>
                        </div>
                        <div id="usersList" class="users-table">
                            <div class="loading">Loading users...</div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Add/Edit User Modal -->
            <div id="userModal" class="modal" style="display: none;">
                <div class="modal-content">
                    <div class="modal-header">
                        <h3 id="userModalTitle">Add User</h3>
                        <button id="closeUserModal" class="modal-close">&times;</button>
                    </div>
                    <form id="userForm">
                        <div class="form-row">
                            <div class="form-group">
                                <label for="userUsername">Username</label>
                                <input type="text" id="userUsername" name="username" required>
                            </div>
                            <div class="form-group">
                                <label for="userEmail">Email</label>
                                <input type="email" id="userEmail" name="email" required>
                            </div>
                        </div>
                        <div class="form-row">
                            <div class="form-group">
                                <label for="userPassword">Password</label>
                                <input type="password" id="userPassword" name="password">
                                <small>Leave blank to keep existing password when editing</small>
                            </div>
                            <div class="form-group">
                                <label for="userRole">Role</label>
                                <select id="userRole" name="role" required>
                                    <option value="">Select Role</option>
                                    <option value="admin">Admin</option>
                                    <option value="operator">Operator</option>
                                    <option value="viewer">Viewer</option>
                                </select>
                            </div>
                        </div>
                        <div class="form-group">
                            <label for="userTimezone">Timezone</label>
                            <select id="userTimezone" name="timezone" required>
                                <option value="">Select Timezone</option>
                                <option value="UTC">UTC</option>
                                <option value="America/New_York">Eastern Time</option>
                                <option value="America/Chicago">Central Time</option>
                                <option value="America/Denver">Mountain Time</option>
                                <option value="America/Los_Angeles">Pacific Time</option>
                                <option value="Europe/London">London</option>
                                <option value="Europe/Paris">Paris</option>
                                <option value="Asia/Tokyo">Tokyo</option>
                                <option value="Asia/Shanghai">Shanghai</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label>
                                <input type="checkbox" id="userActive" name="is_active" checked>
                                Active User
                            </label>
                        </div>
                        <div class="form-actions">
                            <button type="button" id="cancelUserBtn" class="btn btn-secondary">Cancel</button>
                            <button type="submit" id="saveUserBtn" class="btn btn-primary">Save User</button>
                        </div>
                    </form>
                </div>
            </div>
        `;
    }

    attachEventListeners() {
        // Add user button
        document.getElementById('addUserBtn').addEventListener('click', () => {
            this.showModal();
        });

        // Modal close button
        document.getElementById('closeUserModal').addEventListener('click', () => {
            this.hideModal();
        });

        // Cancel button
        document.getElementById('cancelUserBtn').addEventListener('click', () => {
            this.hideModal();
        });

        // User form submission
        document.getElementById('userForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.saveUser();
        });

        // Search functionality
        document.getElementById('userSearch').addEventListener('input', (e) => {
            this.filterUsers(e.target.value);
        });
    }

    async loadUsers() {
        try {
            const response = await this.app.apiRequest('/users');
            if (response) {
                this.users = response.users;
                this.renderUsers();
            }
        } catch (error) {
            console.error('Failed to load users:', error);
        }
    }

    renderUsers() {
        const container = document.getElementById('usersList');
        
        if (this.users.length === 0) {
            container.innerHTML = '<div class="empty-state">No users found.</div>';
            return;
        }

        container.innerHTML = `
            <table class="data-table">
                <thead>
                    <tr>
                        <th>Username</th>
                        <th>Email</th>
                        <th>Role</th>
                        <th>Timezone</th>
                        <th>Status</th>
                        <th>Last Login</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    ${this.users.map(user => `
                        <tr>
                            <td>
                                <div class="user-name">
                                    <strong>${user.username}</strong>
                                    ${user.id === this.app.currentUser.id ? '<br><small>(You)</small>' : ''}
                                </div>
                            </td>
                            <td>${user.email}</td>
                            <td><span class="badge badge-${user.role}">${user.role}</span></td>
                            <td>${user.timezone}</td>
                            <td>
                                <span class="status-badge status-${user.is_active ? 'active' : 'inactive'}">
                                    ${user.is_active ? 'Active' : 'Inactive'}
                                </span>
                            </td>
                            <td>${user.last_login ? new Date(user.last_login).toLocaleString() : 'Never'}</td>
                            <td>
                                <div class="action-buttons">
                                    <button class="btn btn-sm btn-secondary" onclick="app.users.editUser('${user.id}')">Edit</button>
                                    ${user.id !== this.app.currentUser.id ? 
                                        `<button class="btn btn-sm btn-danger" onclick="app.users.deleteUser('${user.id}')">Delete</button>` : 
                                        ''
                                    }
                                </div>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
    }

    filterUsers(searchTerm) {
        const filtered = this.users.filter(user => 
            user.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
            user.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
            user.role.toLowerCase().includes(searchTerm.toLowerCase())
        );
        this.renderFilteredUsers(filtered);
    }

    renderFilteredUsers(users) {
        const container = document.getElementById('usersList');
        
        if (users.length === 0) {
            container.innerHTML = '<div class="empty-state">No users match your search.</div>';
            return;
        }

        // Reuse the same table structure as renderUsers but with filtered data
        container.innerHTML = `
            <table class="data-table">
                <thead>
                    <tr>
                        <th>Username</th>
                        <th>Email</th>
                        <th>Role</th>
                        <th>Timezone</th>
                        <th>Status</th>
                        <th>Last Login</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    ${users.map(user => `
                        <tr>
                            <td>
                                <div class="user-name">
                                    <strong>${user.username}</strong>
                                    ${user.id === this.app.currentUser.id ? '<br><small>(You)</small>' : ''}
                                </div>
                            </td>
                            <td>${user.email}</td>
                            <td><span class="badge badge-${user.role}">${user.role}</span></td>
                            <td>${user.timezone}</td>
                            <td>
                                <span class="status-badge status-${user.is_active ? 'active' : 'inactive'}">
                                    ${user.is_active ? 'Active' : 'Inactive'}
                                </span>
                            </td>
                            <td>${user.last_login ? new Date(user.last_login).toLocaleString() : 'Never'}</td>
                            <td>
                                <div class="action-buttons">
                                    <button class="btn btn-sm btn-secondary" onclick="app.users.editUser('${user.id}')">Edit</button>
                                    ${user.id !== this.app.currentUser.id ? 
                                        `<button class="btn btn-sm btn-danger" onclick="app.users.deleteUser('${user.id}')">Delete</button>` : 
                                        ''
                                    }
                                </div>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
    }

    showModal(user = null) {
        const modal = document.getElementById('userModal');
        const title = document.getElementById('userModalTitle');
        const form = document.getElementById('userForm');

        if (user) {
            title.textContent = 'Edit User';
            form.dataset.userId = user.id;
            // Populate form fields
            document.getElementById('userUsername').value = user.username;
            document.getElementById('userEmail').value = user.email;
            document.getElementById('userPassword').value = ''; // Don't populate password
            document.getElementById('userRole').value = user.role;
            document.getElementById('userTimezone').value = user.timezone;
            document.getElementById('userActive').checked = user.is_active;
        } else {
            title.textContent = 'Add User';
            delete form.dataset.userId;
            form.reset();
            document.getElementById('userActive').checked = true;
        }

        modal.style.display = 'block';
    }

    hideModal() {
        document.getElementById('userModal').style.display = 'none';
    }

    async saveUser() {
        const form = document.getElementById('userForm');
        const userId = form.dataset.userId;
        const formData = new FormData(form);
        const userData = Object.fromEntries(formData.entries());
        
        // Handle checkbox
        userData.is_active = formData.has('is_active');

        try {
            const endpoint = userId ? `/users/${userId}` : '/users';
            const method = userId ? 'PUT' : 'POST';
            
            const response = await this.app.apiRequest(endpoint, {
                method,
                body: JSON.stringify(userData)
            });

            if (response) {
                this.hideModal();
                this.loadUsers();
                this.app.showMessage('User saved successfully!', 'success');
            }
        } catch (error) {
            console.error('Failed to save user:', error);
        }
    }

    async editUser(userId) {
        const user = this.users.find(u => u.id === userId);
        if (user) {
            this.showModal(user);
        }
    }

    async deleteUser(userId) {
        if (confirm('Are you sure you want to delete this user?')) {
            try {
                const response = await this.app.apiRequest(`/users/${userId}`, {
                    method: 'DELETE'
                });

                if (response) {
                    this.loadUsers();
                    this.app.showMessage('User deleted successfully!', 'success');
                }
            } catch (error) {
                console.error('Failed to delete user:', error);
            }
        }
    }
} 