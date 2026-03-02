import axios from 'axios';
import { API_BASE_URL } from '../config/api';

class UserPreferencesService {
  constructor() {
    this.baseURL = `${API_BASE_URL}/api/auth`;
  }

  // Get user preferences from server
  async getUserPreferences() {
    try {
      const token = localStorage.getItem('token');
      if (!token) {
        console.warn('No authentication token found');
        return null;
      }

      const response = await axios.get(`${this.baseURL}/profile`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      return response.data.preferences || {};
    } catch (error) {
      console.error('Error fetching user preferences:', error);
      return null;
    }
  }

  // Save user preferences to server
  async saveUserPreferences(preferences) {
    try {
      const token = localStorage.getItem('token');
      if (!token) {
        console.warn('No authentication token found');
        return false;
      }

      const response = await axios.put(`${this.baseURL}/profile`, {
        preferences: preferences
      }, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      return response.status === 200;
    } catch (error) {
      console.error('Error saving user preferences:', error);
      return false;
    }
  }

  // Get theme preferences specifically
  async getThemePreferences() {
    const preferences = await this.getUserPreferences();
    if (!preferences) return null;

    return {
      theme: preferences.theme || 'light',
      customColors: preferences.customColors || null,
      fontColors: preferences.fontColors || null,
      fontSizes: preferences.fontSizes || null,
      parameterColors: preferences.parameterColors || null,
    };
  }

  // Save theme preferences specifically
  async saveThemePreferences(themeData) {
    const currentPreferences = await this.getUserPreferences() || {};
    
    const updatedPreferences = {
      ...currentPreferences,
      theme: themeData.theme,
      customColors: themeData.customColors,
      fontColors: themeData.fontColors,
      fontSizes: themeData.fontSizes,
      parameterColors: themeData.parameterColors,
    };

    return await this.saveUserPreferences(updatedPreferences);
  }

  // Sync localStorage with server preferences
  async syncWithServer() {
    try {
      const serverPreferences = await this.getThemePreferences();
      if (!serverPreferences) {
        console.warn('Could not fetch server preferences, using localStorage');
        return false;
      }

      // Update localStorage with server data
      if (serverPreferences.theme) {
        localStorage.setItem('aksadata-theme', serverPreferences.theme);
      }
      if (serverPreferences.customColors) {
        localStorage.setItem('kima_custom_colors', JSON.stringify(serverPreferences.customColors));
      }
      if (serverPreferences.fontColors) {
        localStorage.setItem('font_colors', JSON.stringify(serverPreferences.fontColors));
      }
      if (serverPreferences.fontSizes) {
        localStorage.setItem('font_sizes', JSON.stringify(serverPreferences.fontSizes));
      }
      if (serverPreferences.parameterColors) {
        localStorage.setItem('kima_parameter_colors', JSON.stringify(serverPreferences.parameterColors));
      }

      return true;
    } catch (error) {
      console.error('Error syncing with server:', error);
      return false;
    }
  }

  // Save current localStorage to server
  async saveCurrentToServer() {
    try {
      const themeData = {
        theme: localStorage.getItem('aksadata-theme') || 'light',
        customColors: JSON.parse(localStorage.getItem('kima_custom_colors') || 'null'),
        fontColors: JSON.parse(localStorage.getItem('font_colors') || 'null'),
        fontSizes: JSON.parse(localStorage.getItem('font_sizes') || 'null'),
        parameterColors: JSON.parse(localStorage.getItem('kima_parameter_colors') || 'null'),
      };

      return await this.saveThemePreferences(themeData);
    } catch (error) {
      console.error('Error saving current preferences to server:', error);
      return false;
    }
  }

  // Check if user is authenticated
  isAuthenticated() {
    return !!localStorage.getItem('token');
  }
}

export default new UserPreferencesService();



