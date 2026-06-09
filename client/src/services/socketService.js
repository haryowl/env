import { io } from 'socket.io-client';
import { WS_BASE_URL } from '../config/api';

const SOCKET_DEBUG = import.meta.env.DEV && import.meta.env.VITE_SOCKET_DEBUG === 'true';

export class SocketService {
  constructor() {
    this.socket = null;
    this.listeners = new Map();
  }

  connect(token) {
    try {
      console.log('SocketService: Attempting to connect to WebSocket...', WS_BASE_URL);
      // Connect to Socket.IO server
      this.socket = io(WS_BASE_URL, {
        auth: {
          token: token
        },
        transports: ['websocket', 'polling']
      });

      this.socket.on('connect', () => {
        console.log('SocketService: WebSocket connected successfully. Socket ID:', this.socket.id);
      });

      this.socket.on('disconnect', (reason) => {
        console.log('SocketService: WebSocket disconnected. Reason:', reason);
      });

      this.socket.on('connect_error', (error) => {
        console.error('SocketService: WebSocket connection error:', error);
      });

      this.socket.on('error', (error) => {
        console.error('SocketService: WebSocket error:', error);
      });

      // Handle incoming messages
      this.socket.on('message', (data) => {
        console.log('SocketService: Received message:', data);
        this.handleMessage(data);
      });

      this.socket.on('device_data', (data) => {
        if (SOCKET_DEBUG) console.log('SocketService: Received device_data:', data);
        this.handleMessage({ type: 'device_data', payload: data });
      });

      this.socket.on('listener_data', (data) => {
        if (SOCKET_DEBUG) console.log('SocketService: Received listener_data:', data);
        this.handleMessage({ type: 'listener_data', payload: data });
      });

      this.socket.on('new_alert_log', (data) => {
        if (SOCKET_DEBUG) console.log('SocketService: Received new_alert_log:', data);
        this.handleMessage({ type: 'new_alert_log', payload: data });
      });

    } catch (error) {
      console.error('SocketService: Failed to connect WebSocket:', error);
    }
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }

  handleMessage(data) {
    const { type, payload } = data;

    if (this.listeners.has(type)) {
      this.listeners.get(type).forEach((callback) => {
        callback(payload);
      });
    }
  }

  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event).push(callback);
  }

  off(event, callback) {
    if (this.listeners.has(event)) {
      const callbacks = this.listeners.get(event);
      const index = callbacks.indexOf(callback);
      if (index > -1) {
        callbacks.splice(index, 1);
      }
    }
  }

  emit(event, data) {
    if (this.socket && this.socket.connected) {
      this.socket.emit(event, data);
    }
  }

  // Subscribe to device data
  subscribeDevice(deviceId) {
    this.emit('subscribe_device', deviceId);
  }

  // Unsubscribe from device data
  unsubscribeDevice(deviceId) {
    this.emit('unsubscribe_device', deviceId);
  }

  subscribeListenersFeed() {
    this.emit('subscribe_listeners_feed');
  }

  unsubscribeListenersFeed() {
    this.emit('unsubscribe_listeners_feed');
  }

  // Get latest data for a device
  getLatestData(deviceId) {
    this.emit('get_latest_data', deviceId);
  }
} 