/**
 * Offline Sync Service
 * Phase 4: Mobile App - Data Synchronization
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { mobileApi } from './api';

// Storage keys
const STORAGE_KEYS = {
  LAST_SYNC: 'uttag_last_sync',
  PENDING_TASKS: 'uttag_pending_tasks',
  PENDING_SCANS: 'uttag_pending_scans',
  OFFLINE_TAGS: 'uttag_offline_tags',
  OFFLINE_ALERTS: 'uttag_offline_alerts',
};

// Pending change types
export interface PendingTaskChange {
  id: string;
  server_id?: string;
  action: 'create' | 'update' | 'delete';
  data: any;
  created_at: string;
}

export interface PendingScan {
  mac: string;
  scanned_at: string;
  latitude?: number;
  longitude?: number;
}

export interface SyncResult {
  success: boolean;
  timestamp: string;
  changes: {
    tags: { created: number; updated: number; deleted: number };
    tasks: { created: number; updated: number; deleted: number };
    alerts: { created: number };
  };
  conflicts: number;
  error?: string;
}

// Network state
let isOnline = true;
let syncInProgress = false;

/**
 * Initialize sync service
 */
export async function initializeSyncService(): Promise<void> {
  // Subscribe to network state changes
  NetInfo.addEventListener((state) => {
    const wasOffline = !isOnline;
    isOnline = state.isConnected === true && state.isInternetReachable === true;

    // Auto-sync when coming back online
    if (wasOffline && isOnline) {
      console.log('[Sync] Back online, starting sync...');
      performSync();
    }
  });

  // Get initial network state
  const state = await NetInfo.fetch();
  isOnline = state.isConnected === true && state.isInternetReachable === true;
}

/**
 * Check if device is online
 */
export function getIsOnline(): boolean {
  return isOnline;
}

/**
 * Get last sync timestamp
 */
export async function getLastSyncTime(): Promise<string | null> {
  return AsyncStorage.getItem(STORAGE_KEYS.LAST_SYNC);
}

/**
 * Set last sync timestamp
 */
async function setLastSyncTime(timestamp: string): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEYS.LAST_SYNC, timestamp);
}

/**
 * Queue a task change for sync
 */
export async function queueTaskChange(change: PendingTaskChange): Promise<void> {
  const pending = await getPendingTaskChanges();
  pending.push(change);
  await AsyncStorage.setItem(STORAGE_KEYS.PENDING_TASKS, JSON.stringify(pending));
}

/**
 * Get pending task changes
 */
async function getPendingTaskChanges(): Promise<PendingTaskChange[]> {
  const data = await AsyncStorage.getItem(STORAGE_KEYS.PENDING_TASKS);
  return data ? JSON.parse(data) : [];
}

/**
 * Clear pending task changes
 */
async function clearPendingTaskChanges(): Promise<void> {
  await AsyncStorage.removeItem(STORAGE_KEYS.PENDING_TASKS);
}

/**
 * Queue a scan for sync
 */
export async function queueScan(scan: PendingScan): Promise<void> {
  const pending = await getPendingScans();
  pending.push(scan);
  await AsyncStorage.setItem(STORAGE_KEYS.PENDING_SCANS, JSON.stringify(pending));
}

/**
 * Get pending scans
 */
async function getPendingScans(): Promise<PendingScan[]> {
  const data = await AsyncStorage.getItem(STORAGE_KEYS.PENDING_SCANS);
  return data ? JSON.parse(data) : [];
}

/**
 * Clear pending scans
 */
async function clearPendingScans(): Promise<void> {
  await AsyncStorage.removeItem(STORAGE_KEYS.PENDING_SCANS);
}

/**
 * Save data for offline access
 */
export async function saveOfflineData(key: 'tags' | 'alerts', data: any[]): Promise<void> {
  const storageKey = key === 'tags' ? STORAGE_KEYS.OFFLINE_TAGS : STORAGE_KEYS.OFFLINE_ALERTS;
  await AsyncStorage.setItem(storageKey, JSON.stringify(data));
}

/**
 * Get offline data
 */
export async function getOfflineData<T>(key: 'tags' | 'alerts'): Promise<T[]> {
  const storageKey = key === 'tags' ? STORAGE_KEYS.OFFLINE_TAGS : STORAGE_KEYS.OFFLINE_ALERTS;
  const data = await AsyncStorage.getItem(storageKey);
  return data ? JSON.parse(data) : [];
}

/**
 * Perform full sync
 */
export async function performSync(): Promise<SyncResult> {
  if (syncInProgress) {
    return {
      success: false,
      timestamp: new Date().toISOString(),
      changes: { tags: { created: 0, updated: 0, deleted: 0 }, tasks: { created: 0, updated: 0, deleted: 0 }, alerts: { created: 0 } },
      conflicts: 0,
      error: 'Sync already in progress',
    };
  }

  if (!isOnline) {
    return {
      success: false,
      timestamp: new Date().toISOString(),
      changes: { tags: { created: 0, updated: 0, deleted: 0 }, tasks: { created: 0, updated: 0, deleted: 0 }, alerts: { created: 0 } },
      conflicts: 0,
      error: 'Device is offline',
    };
  }

  syncInProgress = true;

  try {
    const lastSyncAt = await getLastSyncTime();
    const pendingTasks = await getPendingTaskChanges();
    const pendingScans = await getPendingScans();

    // Call sync API
    const response = await mobileApi.sync({
      last_sync_at: lastSyncAt || undefined,
      pending_changes: {
        tasks: pendingTasks.length > 0 ? pendingTasks : undefined,
        scans: pendingScans.length > 0 ? pendingScans : undefined,
      },
    });

    const { sync_timestamp, changes, conflicts } = response.data;

    // Clear pending changes on successful sync
    if (pendingTasks.length > 0) {
      await clearPendingTaskChanges();
    }
    if (pendingScans.length > 0) {
      await clearPendingScans();
    }

    // Save sync timestamp
    await setLastSyncTime(sync_timestamp);

    // Save received data for offline access
    if (changes.tags?.updated?.length > 0) {
      const existingTags = await getOfflineData<any>('tags');
      const updatedTags = mergeData(existingTags, changes.tags.updated, 'mac');
      await saveOfflineData('tags', updatedTags);
    }

    if (changes.alerts?.created?.length > 0) {
      const existingAlerts = await getOfflineData<any>('alerts');
      const mergedAlerts = [...changes.alerts.created, ...existingAlerts].slice(0, 200);
      await saveOfflineData('alerts', mergedAlerts);
    }

    return {
      success: true,
      timestamp: sync_timestamp,
      changes: {
        tags: {
          created: changes.tags?.created?.length || 0,
          updated: changes.tags?.updated?.length || 0,
          deleted: changes.tags?.deleted?.length || 0,
        },
        tasks: {
          created: changes.tasks?.created?.length || 0,
          updated: changes.tasks?.updated?.length || 0,
          deleted: changes.tasks?.deleted?.length || 0,
        },
        alerts: {
          created: changes.alerts?.created?.length || 0,
        },
      },
      conflicts: conflicts?.length || 0,
    };
  } catch (error: any) {
    console.error('[Sync] Error:', error);
    return {
      success: false,
      timestamp: new Date().toISOString(),
      changes: { tags: { created: 0, updated: 0, deleted: 0 }, tasks: { created: 0, updated: 0, deleted: 0 }, alerts: { created: 0 } },
      conflicts: 0,
      error: error.message || 'Sync failed',
    };
  } finally {
    syncInProgress = false;
  }
}

/**
 * Get sync status
 */
export async function getSyncStatus(): Promise<{
  lastSyncAt: string | null;
  pendingTasks: number;
  pendingScans: number;
  isOnline: boolean;
  isSyncing: boolean;
}> {
  const lastSyncAt = await getLastSyncTime();
  const pendingTasks = await getPendingTaskChanges();
  const pendingScans = await getPendingScans();

  return {
    lastSyncAt,
    pendingTasks: pendingTasks.length,
    pendingScans: pendingScans.length,
    isOnline,
    isSyncing: syncInProgress,
  };
}

/**
 * Merge arrays by key
 */
function mergeData<T extends Record<string, any>>(
  existing: T[],
  updates: T[],
  key: keyof T
): T[] {
  const map = new Map<any, T>();

  // Add existing items
  for (const item of existing) {
    map.set(item[key], item);
  }

  // Override with updates
  for (const item of updates) {
    map.set(item[key], item);
  }

  return Array.from(map.values());
}

/**
 * Clear all sync data
 */
export async function clearSyncData(): Promise<void> {
  await Promise.all([
    AsyncStorage.removeItem(STORAGE_KEYS.LAST_SYNC),
    AsyncStorage.removeItem(STORAGE_KEYS.PENDING_TASKS),
    AsyncStorage.removeItem(STORAGE_KEYS.PENDING_SCANS),
    AsyncStorage.removeItem(STORAGE_KEYS.OFFLINE_TAGS),
    AsyncStorage.removeItem(STORAGE_KEYS.OFFLINE_ALERTS),
  ]);
}
