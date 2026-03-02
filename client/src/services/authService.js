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
        await fetch(`${API_BASE_URL}/auth/logout`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        });
      }
    } catch (error) {
      console.error('Logout error:', error);
    }
  }

  getToken() {
    return localStorage.getItem('iot_token');
  }

  isAuthenticated() {
    return !!this.getToken();
  }
} 