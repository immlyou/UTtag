/**
 * Push Notification Service
 * Phase 4: Mobile App - FCM Integration
 */

import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { mobileApi } from './api';

// Notification channels for Android
const NOTIFICATION_CHANNELS = {
  emergency_alerts: {
    name: 'Emergency Alerts',
    importance: Notifications.AndroidImportance.MAX,
    sound: 'sos_alarm.wav',
    vibrationPattern: [0, 500, 200, 500, 200, 500],
    enableVibrate: true,
  },
  critical_alerts: {
    name: 'Critical Alerts',
    importance: Notifications.AndroidImportance.HIGH,
    sound: 'alert_high.wav',
    enableVibrate: true,
  },
  geofence_alerts: {
    name: 'Geofence Alerts',
    importance: Notifications.AndroidImportance.HIGH,
    sound: 'alert_medium.wav',
    enableVibrate: true,
  },
  device_alerts: {
    name: 'Device Alerts',
    importance: Notifications.AndroidImportance.DEFAULT,
    sound: 'notification.wav',
  },
  task_updates: {
    name: 'Task Updates',
    importance: Notifications.AndroidImportance.DEFAULT,
    sound: 'notification.wav',
  },
  default: {
    name: 'Default',
    importance: Notifications.AndroidImportance.DEFAULT,
    sound: 'default',
  },
};

// Configure notification handler
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

/**
 * Initialize push notifications
 */
export async function initializePushNotifications(): Promise<string | null> {
  // Check if physical device
  if (!Device.isDevice) {
    console.log('Push notifications require a physical device');
    return null;
  }

  // Request permissions
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    console.log('Push notification permission not granted');
    return null;
  }

  // Create notification channels for Android
  if (Platform.OS === 'android') {
    await createAndroidChannels();
  }

  // Get push token
  try {
    const projectId = Constants.expoConfig?.extra?.eas?.projectId;
    const token = await Notifications.getExpoPushTokenAsync({
      projectId,
    });

    return token.data;
  } catch (error) {
    console.error('Failed to get push token:', error);
    return null;
  }
}

/**
 * Create Android notification channels
 */
async function createAndroidChannels(): Promise<void> {
  for (const [channelId, config] of Object.entries(NOTIFICATION_CHANNELS)) {
    await Notifications.setNotificationChannelAsync(channelId, {
      name: config.name,
      importance: config.importance,
      sound: config.sound,
      vibrationPattern: config.vibrationPattern,
      enableVibrate: config.enableVibrate,
    });
  }
}

/**
 * Register device for push notifications
 */
export async function registerForPushNotifications(): Promise<boolean> {
  const token = await initializePushNotifications();
  if (!token) return false;

  try {
    const deviceId = Constants.deviceId || Device.modelId || 'unknown';
    const deviceName = Device.deviceName || Device.modelName || 'Unknown Device';
    const osVersion = `${Platform.OS} ${Platform.Version}`;
    const appVersion = Constants.expoConfig?.version || '1.0.0';

    await mobileApi.registerDevice({
      fcm_token: token,
      device_id: deviceId,
      device_type: Platform.OS as 'ios' | 'android',
      device_name: deviceName,
      os_version: osVersion,
      app_version: appVersion,
    });

    console.log('Device registered for push notifications');
    return true;
  } catch (error) {
    console.error('Failed to register device:', error);
    return false;
  }
}

/**
 * Unregister device from push notifications
 */
export async function unregisterFromPushNotifications(): Promise<void> {
  try {
    const deviceId = Constants.deviceId || Device.modelId || 'unknown';
    await mobileApi.unregisterDevice(deviceId);
    console.log('Device unregistered from push notifications');
  } catch (error) {
    console.error('Failed to unregister device:', error);
  }
}

/**
 * Handle notification received while app is in foreground
 */
export type NotificationHandler = (notification: Notifications.Notification) => void;

let foregroundHandler: NotificationHandler | null = null;

export function setForegroundNotificationHandler(handler: NotificationHandler): () => void {
  foregroundHandler = handler;

  const subscription = Notifications.addNotificationReceivedListener((notification) => {
    if (foregroundHandler) {
      foregroundHandler(notification);
    }
  });

  return () => {
    foregroundHandler = null;
    subscription.remove();
  };
}

/**
 * Handle notification tap
 */
export type NotificationResponseHandler = (response: Notifications.NotificationResponse) => void;

let responseHandler: NotificationResponseHandler | null = null;

export function setNotificationResponseHandler(handler: NotificationResponseHandler): () => void {
  responseHandler = handler;

  const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
    if (responseHandler) {
      responseHandler(response);
    }
  });

  return () => {
    responseHandler = null;
    subscription.remove();
  };
}

/**
 * Parse notification data
 */
export interface NotificationData {
  type: 'sos' | 'temperature' | 'geofence' | 'battery' | 'offline' | 'task';
  alert_id?: string;
  tag_mac?: string;
  tag_name?: string;
  task_id?: string;
  latitude?: string;
  longitude?: string;
  timestamp?: string;
  [key: string]: string | undefined;
}

export function parseNotificationData(
  notification: Notifications.Notification
): NotificationData | null {
  const data = notification.request.content.data;
  if (!data || typeof data.type !== 'string') {
    return null;
  }
  return data as NotificationData;
}

/**
 * Get notification badge count
 */
export async function getBadgeCount(): Promise<number> {
  return Notifications.getBadgeCountAsync();
}

/**
 * Set notification badge count
 */
export async function setBadgeCount(count: number): Promise<void> {
  await Notifications.setBadgeCountAsync(count);
}

/**
 * Clear all notifications
 */
export async function clearAllNotifications(): Promise<void> {
  await Notifications.dismissAllNotificationsAsync();
  await setBadgeCount(0);
}
