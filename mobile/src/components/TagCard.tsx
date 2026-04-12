/**
 * Tag Card Component
 * Phase 4: Mobile App - Reusable Tag Display Card
 */

import React from 'react';
import { StyleSheet, View, Text, TouchableOpacity } from 'react-native';
import { Tag } from '../stores/tagStore';

interface TagCardProps {
  tag: Tag;
  onPress?: (tag: Tag) => void;
  compact?: boolean;
}

export default function TagCard({ tag, onPress, compact = false }: TagCardProps) {
  const getStatusColor = () => {
    switch (tag.status) {
      case 'online':
        return '#22C55E';
      case 'offline':
        return '#6B7280';
      case 'alert':
        return '#EF4444';
      default:
        return '#6B7280';
    }
  };

  const handlePress = () => {
    if (onPress) {
      onPress(tag);
    }
  };

  if (compact) {
    return (
      <TouchableOpacity
        style={styles.compactCard}
        onPress={handlePress}
        activeOpacity={onPress ? 0.7 : 1}
      >
        <View style={[styles.statusDot, { backgroundColor: getStatusColor() }]} />
        <Text style={styles.compactName} numberOfLines={1}>
          {tag.name}
        </Text>
        {tag.temperature !== undefined && (
          <Text
            style={[
              styles.compactTemp,
              (tag.temperature > 8 || tag.temperature < -25) && styles.alertText,
            ]}
          >
            {tag.temperature.toFixed(1)}C
          </Text>
        )}
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={handlePress}
      activeOpacity={onPress ? 0.7 : 1}
    >
      <View style={styles.header}>
        <View style={[styles.statusIndicator, { backgroundColor: getStatusColor() }]} />
        <View style={styles.titleContainer}>
          <Text style={styles.name} numberOfLines={1}>
            {tag.name}
          </Text>
          <Text style={styles.mac}>{tag.mac}</Text>
        </View>
        <StatusBadge status={tag.status} />
      </View>

      <View style={styles.metrics}>
        {tag.temperature !== undefined && (
          <MetricItem
            icon="🌡️"
            value={`${tag.temperature.toFixed(1)}C`}
            alert={tag.temperature > 8 || tag.temperature < -25}
          />
        )}
        {tag.humidity !== undefined && (
          <MetricItem icon="💧" value={`${tag.humidity.toFixed(0)}%`} />
        )}
        {tag.battery !== undefined && (
          <MetricItem
            icon="🔋"
            value={`${tag.battery}%`}
            warning={tag.battery < 20}
          />
        )}
        {tag.distance_m !== undefined && (
          <MetricItem
            icon="📍"
            value={
              tag.distance_m < 1000
                ? `${tag.distance_m}m`
                : `${(tag.distance_m / 1000).toFixed(1)}km`
            }
          />
        )}
      </View>

      {tag.last_seen_at && (
        <Text style={styles.lastSeen}>
          Last seen: {formatLastSeen(tag.last_seen_at)}
        </Text>
      )}
    </TouchableOpacity>
  );
}

// Status Badge Component
function StatusBadge({ status }: { status: Tag['status'] }) {
  const getColor = () => {
    switch (status) {
      case 'online':
        return { bg: '#DCFCE7', text: '#22C55E' };
      case 'offline':
        return { bg: '#F3F4F6', text: '#6B7280' };
      case 'alert':
        return { bg: '#FEE2E2', text: '#EF4444' };
      default:
        return { bg: '#F3F4F6', text: '#6B7280' };
    }
  };

  const colors = getColor();

  return (
    <View style={[styles.badge, { backgroundColor: colors.bg }]}>
      <Text style={[styles.badgeText, { color: colors.text }]}>
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </Text>
    </View>
  );
}

// Metric Item Component
interface MetricItemProps {
  icon: string;
  value: string;
  alert?: boolean;
  warning?: boolean;
}

function MetricItem({ icon, value, alert, warning }: MetricItemProps) {
  return (
    <View style={styles.metricItem}>
      <Text style={styles.metricIcon}>{icon}</Text>
      <Text
        style={[
          styles.metricValue,
          alert && styles.alertText,
          warning && styles.warningText,
        ]}
      >
        {value}
      </Text>
    </View>
  );
}

// Format last seen time
function formatLastSeen(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  compactCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  statusIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 12,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 10,
  },
  titleContainer: {
    flex: 1,
  },
  name: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
  },
  compactName: {
    flex: 1,
    fontSize: 14,
    fontWeight: '500',
    color: '#1F2937',
  },
  mac: {
    fontSize: 12,
    color: '#9CA3AF',
    fontFamily: 'monospace',
    marginTop: 2,
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '500',
  },
  metrics: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
    marginBottom: 8,
  },
  metricItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metricIcon: {
    fontSize: 14,
  },
  metricValue: {
    fontSize: 14,
    fontWeight: '500',
    color: '#1F2937',
  },
  compactTemp: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1F2937',
  },
  alertText: {
    color: '#EF4444',
  },
  warningText: {
    color: '#F59E0B',
  },
  lastSeen: {
    fontSize: 12,
    color: '#9CA3AF',
  },
});
