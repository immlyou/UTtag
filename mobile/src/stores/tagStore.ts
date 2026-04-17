/**
 * Tag Store
 * Phase 4: Mobile App - Tag State Management
 */

import { create } from 'zustand';
import { api } from '../services/api';

// Shape of a device object returned by the REST API
interface DeviceResponse {
  mac: string;
  label?: string;
  latitude?: number;
  longitude?: number;
  temperature?: number;
  humidity?: number;
  battery?: number;
  last_seen_at?: string;
}

export interface Tag {
  mac: string;
  name: string;
  label?: string;
  latitude?: number;
  longitude?: number;
  temperature?: number;
  humidity?: number;
  battery?: number;
  status: 'online' | 'offline' | 'alert';
  last_seen_at?: string;
  distance_m?: number;
}

export interface TagFilters {
  status?: 'all' | 'online' | 'offline' | 'alert';
  search?: string;
  sortBy?: 'name' | 'temperature' | 'last_seen' | 'distance';
  sortOrder?: 'asc' | 'desc';
}

export interface TagState {
  // State
  tags: Tag[];
  selectedTag: Tag | null;
  filters: TagFilters;
  isLoading: boolean;
  lastSyncAt: Date | null;
  error: string | null;

  // Actions
  fetchTags: () => Promise<void>;
  selectTag: (mac: string | null) => void;
  setFilters: (filters: Partial<TagFilters>) => void;
  clearFilters: () => void;
  refreshTag: (mac: string) => Promise<void>;
  getFilteredTags: () => Tag[];
  syncOfflineTags: () => Promise<void>;
}

const defaultFilters: TagFilters = {
  status: 'all',
  search: '',
  sortBy: 'name',
  sortOrder: 'asc',
};

export const useTagStore = create<TagState>((set, get) => ({
  // Initial state
  tags: [],
  selectedTag: null,
  filters: { ...defaultFilters },
  isLoading: false,
  lastSyncAt: null,
  error: null,

  // Fetch all tags from server
  fetchTags: async () => {
    set({ isLoading: true, error: null });
    try {
      const response = await api.get('/api/tenant/devices');
      const { devices } = response.data;

      const tags: Tag[] = (devices || []).map((device: DeviceResponse) => ({
        mac: device.mac,
        name: device.label || device.mac,
        label: device.label,
        latitude: device.latitude,
        longitude: device.longitude,
        temperature: device.temperature,
        humidity: device.humidity,
        battery: device.battery,
        status: getTagStatus(device),
        last_seen_at: device.last_seen_at,
      }));

      set({
        tags,
        isLoading: false,
        lastSyncAt: new Date(),
      });
    } catch (error: unknown) {
      set({
        isLoading: false,
        error: error instanceof Error ? error.message : 'Failed to fetch tags',
      });
      throw error;
    }
  },

  // Select a tag
  selectTag: (mac: string | null) => {
    if (!mac) {
      set({ selectedTag: null });
      return;
    }
    const tag = get().tags.find((t) => t.mac === mac) || null;
    set({ selectedTag: tag });
  },

  // Update filters
  setFilters: (filters: Partial<TagFilters>) => {
    set((state) => ({
      filters: { ...state.filters, ...filters },
    }));
  },

  // Clear all filters
  clearFilters: () => {
    set({ filters: { ...defaultFilters } });
  },

  // Refresh a single tag
  refreshTag: async (mac: string) => {
    try {
      const response = await api.get(`/api/tenant/devices/${mac}`);
      const { device } = response.data;

      if (device) {
        const updatedTag: Tag = {
          mac: device.mac,
          name: device.label || device.mac,
          label: device.label,
          latitude: device.latitude,
          longitude: device.longitude,
          temperature: device.temperature,
          humidity: device.humidity,
          battery: device.battery,
          status: getTagStatus(device),
          last_seen_at: device.last_seen_at,
        };

        set((state) => ({
          tags: state.tags.map((t) =>
            t.mac === mac ? updatedTag : t
          ),
          selectedTag:
            state.selectedTag?.mac === mac
              ? updatedTag
              : state.selectedTag,
        }));
      }
    } catch (error) {
      console.error('Failed to refresh tag:', error);
    }
  },

  // Get filtered and sorted tags
  getFilteredTags: () => {
    const { tags, filters } = get();
    let result = [...tags];

    // Filter by status
    if (filters.status && filters.status !== 'all') {
      result = result.filter((t) => t.status === filters.status);
    }

    // Filter by search
    if (filters.search) {
      const search = filters.search.toLowerCase();
      result = result.filter(
        (t) =>
          t.name.toLowerCase().includes(search) ||
          t.mac.toLowerCase().includes(search)
      );
    }

    // Sort
    if (filters.sortBy) {
      result.sort((a, b) => {
        let comparison = 0;
        switch (filters.sortBy) {
          case 'name':
            comparison = a.name.localeCompare(b.name);
            break;
          case 'temperature':
            comparison = (a.temperature ?? 0) - (b.temperature ?? 0);
            break;
          case 'last_seen':
            comparison =
              new Date(a.last_seen_at || 0).getTime() -
              new Date(b.last_seen_at || 0).getTime();
            break;
          case 'distance':
            comparison = (a.distance_m ?? Infinity) - (b.distance_m ?? Infinity);
            break;
        }
        return filters.sortOrder === 'desc' ? -comparison : comparison;
      });
    }

    return result;
  },

  // Sync offline changes
  syncOfflineTags: async () => {
    // This will be called by the sync service
    // Placeholder for offline sync logic
    console.log('Syncing offline tags...');
  },
}));

// Helper function to determine tag status
function getTagStatus(device: DeviceResponse): 'online' | 'offline' | 'alert' {
  // Check for alerts first
  if (device.temperature !== undefined && device.temperature !== null) {
    const temp = device.temperature;
    if (temp > 8 || temp < -25) {
      return 'alert';
    }
  }

  // Check last seen time
  if (device.last_seen_at) {
    const lastSeen = new Date(device.last_seen_at);
    const now = new Date();
    const diffMs = now.getTime() - lastSeen.getTime();
    const diffHours = diffMs / (1000 * 60 * 60);

    if (diffHours > 1) {
      return 'offline';
    }
  }

  return 'online';
}
