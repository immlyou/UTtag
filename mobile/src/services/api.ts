/**
 * API Service
 * Phase 4: Mobile App - Axios HTTP Client
 */

import axios, { AxiosInstance, AxiosError, InternalAxiosRequestConfig } from 'axios';
import type { TaskPayload } from '../types/task';
import * as SecureStore from 'expo-secure-store';
import Constants from 'expo-constants';

// Configuration
const API_BASE_URL = Constants.expoConfig?.extra?.apiUrl || 'https://uttag.api.uttec.com.tw';
const TOKEN_KEY = 'uttag_auth_token';

// Create axios instance
export const api: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor - add auth token
api.interceptors.request.use(
  async (config: InternalAxiosRequestConfig) => {
    try {
      const token = await SecureStore.getItemAsync(TOKEN_KEY);
      if (token && config.headers) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    } catch (error) {
      console.error('Error getting token:', error);
    }
    return config;
  },
  (error: AxiosError) => {
    return Promise.reject(error);
  }
);

// Response interceptor - handle errors
api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

    // Handle 401 Unauthorized
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      try {
        // Try to refresh token
        const refreshResponse = await api.post('/api/tenant/auth/refresh');
        const { token } = refreshResponse.data;

        if (token) {
          await SecureStore.setItemAsync(TOKEN_KEY, token);
          if (originalRequest.headers) {
            originalRequest.headers.Authorization = `Bearer ${token}`;
          }
          return api(originalRequest);
        }
      } catch (refreshError) {
        // Refresh failed, clear token and redirect to login
        await SecureStore.deleteItemAsync(TOKEN_KEY);
        // The auth store will handle the redirect
      }
    }

    // Format error message
    let message = 'An error occurred';
    if (error.response?.data && typeof error.response.data === 'object') {
      const data = error.response.data as { error?: string; message?: string };
      message = data.error || data.message || message;
    } else if (error.message) {
      message = error.message;
    }

    return Promise.reject(new Error(message));
  }
);

// API helper functions
export const authApi = {
  login: (email: string, password: string) =>
    api.post('/api/tenant/auth/login', { email, password }),

  logout: () => api.post('/api/tenant/auth/logout'),

  refresh: () => api.post('/api/tenant/auth/refresh'),

  getProfile: () => api.get('/api/tenant/auth/profile'),
};

export const tagsApi = {
  list: () => api.get('/api/tenant/devices'),

  get: (mac: string) => api.get(`/api/tenant/devices/${mac}`),

  getHistory: (mac: string, params?: { limit?: number; since?: string }) =>
    api.get(`/api/sensors/history/${mac}`, { params }),

  getNearby: (latitude: number, longitude: number, radius?: number) =>
    api.get('/api/mobile/location/nearby', {
      params: { latitude, longitude, radius },
    }),
};

export const mobileApi = {
  // Device registration
  registerDevice: (data: {
    fcm_token: string;
    device_id: string;
    device_type: 'ios' | 'android';
    device_name?: string;
    os_version?: string;
    app_version?: string;
  }) => api.post('/api/mobile/register-device', data),

  unregisterDevice: (device_id: string) =>
    api.delete('/api/mobile/register-device', { data: { device_id } }),

  // Location
  updateLocation: (data: {
    latitude: number;
    longitude: number;
    accuracy?: number;
    speed?: number;
    heading?: number;
    timestamp?: string;
  }) => api.put('/api/mobile/location', data),

  getLocationHistory: (params?: { limit?: number; since?: string }) =>
    api.get('/api/mobile/location/history', { params }),

  // Sync
  sync: (data: {
    last_sync_at?: string;
    pending_changes?: {
      tasks?: Array<{
        id: string;
        server_id?: string;
        action: 'create' | 'update' | 'delete';
        data: TaskPayload;
      }>;
      scans?: Array<{
        mac: string;
        scanned_at: string;
        latitude?: number;
        longitude?: number;
      }>;
    };
  }) => api.post('/api/mobile/sync', data),

  getSyncStatus: () => api.get('/api/mobile/sync/status'),

  // Notifications
  getNotificationPrefs: () => api.get('/api/mobile/notifications'),

  updateNotificationPrefs: (prefs: Partial<{
    push_enabled: boolean;
    sos_enabled: boolean;
    temperature_enabled: boolean;
    geofence_enabled: boolean;
    battery_enabled: boolean;
    offline_enabled: boolean;
    task_enabled: boolean;
    quiet_hours_enabled: boolean;
    quiet_start: string;
    quiet_end: string;
    assigned_tags_only: boolean;
  }>) => api.put('/api/mobile/notifications', prefs),

  getNotificationHistory: (params?: { limit?: number; offset?: number; type?: string }) =>
    api.get('/api/mobile/notifications/history', { params }),

  markNotificationRead: (id: string) =>
    api.post(`/api/mobile/notifications/${id}/read`),

  markAllNotificationsRead: () =>
    api.post('/api/mobile/notifications/read-all'),
};

export default api;
