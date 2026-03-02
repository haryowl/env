class AuthModule {
    constructor(app) {
        this.app = app;
    }

    render() {
        return `
            <div class="auth-container">
                <div class="auth-card">
                    <div class="auth-header">
                        <h1>🔌 IoT Monitor</h1>
                        <p>Industrial IoT Monitoring System</p>
                    </div>
                    
                    <div class="auth-message" id="authMessage"></div>
                    
                    <form id="loginForm" class="auth-form">
                        <div class="form-group">
                            <label for="username">Username</label>
                            <input type="text" id="username" name="username" required>
                        </div>
                        
                        <div class="form-group">
                            <label for="password">Password</label>
                            <input type="password" id="password" name="password" required>
                        </div>
                        
                        <button type="submit" id="loginBtn" class="btn btn-primary">
                            <span class="btn-text">Login</span>
                            <span class="btn-loading" style="display: none;">Logging in...</span>
                        </button>
                    </form>
                </div>
            </div>
        `;
    }

    attachEventListeners() {
        const form = document.getElementById('loginForm');
        const loginBtn = document.getElementById('loginBtn');
        const btnText = loginBtn.querySelector('.btn-text');
        const btnLoading = loginBtn.querySelector('.btn-loading');

        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const username = document.getElementById('username').value;
            const password = document.getElementById('password').value;
            
            // Show loading state
            loginBtn.disabled = true;
            btnText.style.display = 'none';
            btnLoading.style.display = 'inline';
            
            try {
                const data = await this.app.apiRequest('/auth/login', {
                    method: 'POST',
                    body: JSON.stringify({ username, password })
                });
                
                if (data) {
                    this.app.token = data.token;
                    this.app.currentUser = data.user;
                    
                    localStorage.setItem('iot_token', data.token);
                    localStorage.setItem('iot_user', JSON.stringify(data.user));
                    
                    this.showMessage('Login successful!', 'success');
                    setTimeout(() => this.app.showDashboard(), 1000);
                }
            } catch (error) {
                this.showMessage('Login failed. Please check your credentials.', 'error');
            } finally {
                // Reset button state
                loginBtn.disabled = false;
                btnText.style.display = 'inline';
                btnLoading.style.display = 'none';
            }
        });
    }

    showMessage(message, type) {
        const messageDiv = document.getElementById('authMessage');
        messageDiv.textContent = message;
        messageDiv.className = `auth-message ${type}`;
        messageDiv.style.display = 'block';
    }
} 