import { API_BASE_URL } from '../config/api';

export class AuthService {
  async login(credentials) {
    try {
      const response = await fetch(`${API_BASE_URL}/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(credentials),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Login failed');
      }

      return data;
    } catch (error) {
      throw new Error(error.message || 'Network error');
    }
  }

  async logout() {
    try {
      const token = localStorage.getItem('iot_token');
      if (token) {
        const response = await fetch(`${API_BASE_URL}/auth/logout`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        });
        const data = await response.json().catch(() => ({}));
        return data.redirectUrl || null;
      }
    } catch (error) {
      console.error('Logout error:', error);
    }
    return null;
  }

  getToken() {
    return localStorage.getItem('iot_token');
  }

  isAuthenticated() {
    return !!this.getToken();
  }
} 