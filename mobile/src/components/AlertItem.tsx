/**
 * Alert Item Component
 * Phase 4: Mobile App - Alert Notification Display
 */

import React from 'react';
import { StyleSheet, View, Text, TouchableOpacity } from 'react-native';

export interface Alert {
  id: string;
  alert_type: 'sos' | 'temperature' | 'geofence' | 'battery' | 'offline' | 'task';
  severity: 'low' | 'medium' | 'high' | 'critical';
  tag_mac?: string;
  tag_name?: string;
  title: string;
  message: string;
  data?: Record<string, any>;
  is_read: boolean;
  created_at: string;
}

interface AlertItemProps {
  alert: Alert;
  onPress?: (alert: Alert) => void;
  onMarkRead?: (alert: Alert) => void;
}

// Alert type icons
const ALERT_ICONS: Record<Alert['alert_type'], string> = {
  sos: '🆘',
  temperature: '🌡️',
  geofence: '📍',
  battery: '🔋',
  offline: '📡',
  task: '📋',
};

// Severity colors
const SEVERITY_COLORS: Record<Alert['severity'], { bg: string; border: string }> = {
  low: { bg: '#F3F4F6', border: '#E5E7EB' },
  medium: { bg: '#FEF9C3', border: '#FDE047' },
  high: { bg: '#FEE2E2', border: '#FECACA' },
  critical: { bg: '#FEE2E2', border: '#EF4444' },
};

export default function AlertItem({ alert, onPress, onMarkRead }: AlertItemProps) {
  const handlePress = () => {
    if (onPress) {
      onPress(alert);
    }
  };

  const handleMarkRead = () => {
    if (onMarkRead && !alert.is_read) {
      onMarkRead(alert);
    }
  };

  const colors = SEVERITY_COLORS[alert.severity];
  const icon = ALERT_ICONS[alert.alert_type];

  return (
    <TouchableOpacity
      style={[
        styles.container,
        {
          backgroundColor: colors.bg,
          borderLeftColor: colors.border,
        },
        !alert.is_read && styles.unread,
      ]}
      onPress={handlePress}
      activeOpacity={onPress ? 0.7 : 1}
    >
      <View style={styles.iconContainer}>
        <Text style={styles.icon}>{icon}</Text>
      </View>

      <View style={styles.content}>
        <View style={styles.header}>
          <Text style={[styles.title, !alert.is_read && styles.unreadText]} numberOfLines={1}>
            {alert.title}
          </Text>
          <Text style={styles.time}>{formatTime(alert.created_at)}</Text>
        </View>

        <Text style={styles.message} numberOfLines={2}>
          {alert.message}
        </Text>

        {alert.tag_name && (
          <View style={styles.tagInfo}>
            <Text style={styles.tagName}>{alert.tag_name}</Text>
            {alert.tag_mac && <Text style={styles.tagMac}>{alert.tag_mac}</Text>}
          </View>
        )}

        {!alert.is_read && (
          <TouchableOpacity style={styles.markReadButton} onPress={handleMarkRead}>
            <Text style={styles.markReadText}>Mark as read</Text>
          </TouchableOpacity>
        )}
      </View>

      {!alert.is_read && <View style={styles.unreadDot} />}
    </TouchableOpacity>
  );
}

// Compact alert item for lists
export function AlertItemCompact({
  alert,
  onPress,
}: {
  alert: Alert;
  onPress?: (alert: Alert) => void;
}) {
  const icon = ALERT_ICONS[alert.alert_type];

  return (
    <TouchableOpacity
      style={[styles.compactContainer, !alert.is_read && styles.compactUnread]}
      onPress={() => onPress?.(alert)}
      activeOpacity={onPress ? 0.7 : 1}
    >
      <Text style={styles.compactIcon}>{icon}</Text>
      <View style={styles.compactContent}>
        <Text style={styles.compactTitle} numberOfLines={1}>
          {alert.title}
        </Text>
        <Text style={styles.compactTime}>{formatTime(alert.created_at)}</Text>
      </View>
      {!alert.is_read && <View style={styles.compactDot} />}
    </TouchableOpacity>
  );
}

// Format time for display
function formatTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m`;
  if (diffHours < 24) return `${diffHours}h`;
  if (diffDays < 7) return `${diffDays}d`;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    padding: 16,
    borderLeftWidth: 4,
    borderRadius: 12,
    marginBottom: 12,
    position: 'relative',
  },
  unread: {
    backgroundColor: '#FFFFFF',
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  icon: {
    fontSize: 20,
  },
  content: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 4,
  },
  title: {
    flex: 1,
    fontSize: 15,
    fontWeight: '500',
    color: '#1F2937',
    marginRight: 8,
  },
  unreadText: {
    fontWeight: '600',
  },
  time: {
    fontSize: 12,
    color: '#9CA3AF',
  },
  message: {
    fontSize: 14,
    color: '#6B7280',
    lineHeight: 20,
    marginBottom: 8,
  },
  tagInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  tagName: {
    fontSize: 12,
    fontWeight: '500',
    color: '#3B82F6',
  },
  tagMac: {
    fontSize: 11,
    color: '#9CA3AF',
    fontFamily: 'monospace',
  },
  markReadButton: {
    marginTop: 8,
    alignSelf: 'flex-start',
  },
  markReadText: {
    fontSize: 12,
    color: '#3B82F6',
    fontWeight: '500',
  },
  unreadDot: {
    position: 'absolute',
    top: 16,
    right: 16,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#3B82F6',
  },
  // Compact styles
  compactContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  compactUnread: {
    backgroundColor: '#EFF6FF',
  },
  compactIcon: {
    fontSize: 16,
    marginRight: 12,
  },
  compactContent: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  compactTitle: {
    flex: 1,
    fontSize: 14,
    color: '#1F2937',
    marginRight: 8,
  },
  compactTime: {
    fontSize: 12,
    color: '#9CA3AF',
  },
  compactDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#3B82F6',
    marginLeft: 8,
  },
});
