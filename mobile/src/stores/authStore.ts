/**
 * Authentication Store
 * Phase 4: Mobile App - Zustand State Management
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import * as LocalAuthentication from 'expo-local-authentication';
import { api } from '../services/api';

export interface TenantUser {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'operator' | 'user';
  client_id: string;
  avatar_url?: string;
  phone?: string;
}

export interface AuthState {
  // State
  token: string | null;
  user: TenantUser | null;
  permissions: string[];
  isAuthenticated: boolean;
  isLoading: boolean;
  biometricEnabled: boolean;

  // Actions
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshToken: () => Promise<void>;
  checkBiometric: () => Promise<boolean>;
  enableBiometric: (enable: boolean) => Promise<void>;
  authenticateWithBiometric: () => Promise<boolean>;
  setUser: (user: TenantUser) => void;
  setToken: (token: string) => void;
  clearAuth: () => void;
}

const TOKEN_KEY = 'uttag_auth_token';
const BIOMETRIC_KEY = 'uttag_biometric_enabled';

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      // Initial state
      token: null,
      user: null,
      permissions: [],
      isAuthenticated: false,
      isLoading: false,
      biometricEnabled: false,

      // Login with email and password
      login: async (email: string, password: string) => {
        set({ isLoading: true });
        try {
          const response = await api.post('/api/tenant/auth/login', {
            email,
            password,
          });

          const { token, user, permissions } = response.data;

          // Store token securely
          await SecureStore.setItemAsync(TOKEN_KEY, token);

          set({
            token,
            user,
            permissions: permissions || [],
            isAuthenticated: true,
            isLoading: false,
          });
        } catch (error) {
          set({ isLoading: false });
          throw error;
        }
      },

      // Logout
      logout: async () => {
        try {
          // Call server logout endpoint
          await api.post('/api/tenant/auth/logout').catch(() => {});

          // Clear secure storage
          await SecureStore.deleteItemAsync(TOKEN_KEY);

          // Clear state
          set({
            token: null,
            user: null,
            permissions: [],
            isAuthenticated: false,
          });
        } catch (error) {
          console.error('Logout error:', error);
          // Still clear local state even if server call fails
          set({
            token: null,
            user: null,
            permissions: [],
            isAuthenticated: false,
          });
        }
      },

      // Refresh token
      refreshToken: async () => {
        const { token } = get();
        if (!token) return;

        try {
          const response = await api.post('/api/tenant/auth/refresh');
          const { token: newToken } = response.data;

          await SecureStore.setItemAsync(TOKEN_KEY, newToken);
          set({ token: newToken });
        } catch (error) {
          // If refresh fails, logout
          await get().logout();
        }
      },

      // Check if biometric authentication is available
      checkBiometric: async () => {
        try {
          const hasHardware = await LocalAuthentication.hasHardwareAsync();
          const isEnrolled = await LocalAuthentication.isEnrolledAsync();
          return hasHardware && isEnrolled;
        } catch {
          return false;
        }
      },

      // Enable/disable biometric authentication
      enableBiometric: async (enable: boolean) => {
        await SecureStore.setItemAsync(BIOMETRIC_KEY, enable ? 'true' : 'false');
        set({ biometricEnabled: enable });
      },

      // Authenticate using biometrics
      authenticateWithBiometric: async () => {
        try {
          const result = await LocalAuthentication.authenticateAsync({
            promptMessage: 'Authenticate to login',
            fallbackLabel: 'Use password',
            disableDeviceFallback: false,
          });

          if (result.success) {
            // Retrieve stored token
            const storedToken = await SecureStore.getItemAsync(TOKEN_KEY);
            if (storedToken) {
              set({ token: storedToken, isAuthenticated: true });
              // Refresh user data
              await get().refreshToken();
              return true;
            }
          }
          return false;
        } catch {
          return false;
        }
      },

      // Set user data
      setUser: (user: TenantUser) => {
        set({ user });
      },

      // Set token
      setToken: (token: string) => {
        set({ token, isAuthenticated: true });
      },

      // Clear authentication
      clearAuth: () => {
        set({
          token: null,
          user: null,
          permissions: [],
          isAuthenticated: false,
        });
      },
    }),
    {
      name: 'auth-storage',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        biometricEnabled: state.biometricEnabled,
      }),
    }
  )
);

// Initialize auth state from secure storage
export async function initializeAuth(): Promise<boolean> {
  try {
    const token = await SecureStore.getItemAsync(TOKEN_KEY);
    const biometricEnabled = await SecureStore.getItemAsync(BIOMETRIC_KEY);

    if (token) {
      useAuthStore.setState({
        token,
        isAuthenticated: true,
        biometricEnabled: biometricEnabled === 'true',
      });

      // Refresh token to validate and get user data
      await useAuthStore.getState().refreshToken();
      return true;
    }

    useAuthStore.setState({
      biometricEnabled: biometricEnabled === 'true',
    });
    return false;
  } catch {
    return false;
  }
}
