/**
 * Tags Screen
 * Phase 4: Mobile App - Tag List View
 */

import React, { useEffect, useCallback, useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { useTagStore, Tag, TagFilters } from '../stores/tagStore';

// Status filter options
const STATUS_FILTERS: Array<{ label: string; value: TagFilters['status'] }> = [
  { label: 'All', value: 'all' },
  { label: 'Online', value: 'online' },
  { label: 'Offline', value: 'offline' },
  { label: 'Alert', value: 'alert' },
];

export default function TagsScreen() {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeStatus, setActiveStatus] = useState<TagFilters['status']>('all');

  const { fetchTags, setFilters, getFilteredTags, isLoading, lastSyncAt, error } =
    useTagStore();

  // Fetch tags on mount
  useEffect(() => {
    fetchTags();
  }, [fetchTags]);

  // Update filters when search or status changes
  useEffect(() => {
    setFilters({ search: searchQuery, status: activeStatus });
  }, [searchQuery, activeStatus, setFilters]);

  // Handle refresh
  const handleRefresh = useCallback(() => {
    fetchTags();
  }, [fetchTags]);

  // Get filtered tags
  const filteredTags = getFilteredTags();

  // Render tag item
  const renderTagItem = useCallback(({ item }: { item: Tag }) => {
    return <TagCard tag={item} />;
  }, []);

  // Key extractor
  const keyExtractor = useCallback((item: Tag) => item.mac, []);

  return (
    <View style={styles.container}>
      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search tags..."
          value={searchQuery}
          onChangeText={setSearchQuery}
          clearButtonMode="while-editing"
        />
      </View>

      {/* Status Filters */}
      <View style={styles.filterContainer}>
        {STATUS_FILTERS.map((filter) => (
          <TouchableOpacity
            key={filter.value}
            style={[
              styles.filterButton,
              activeStatus === filter.value && styles.filterButtonActive,
            ]}
            onPress={() => setActiveStatus(filter.value)}
          >
            <Text
              style={[
                styles.filterText,
                activeStatus === filter.value && styles.filterTextActive,
              ]}
            >
              {filter.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Error Message */}
      {error && (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity onPress={handleRefresh}>
            <Text style={styles.retryText}>Tap to retry</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Tag List */}
      <FlatList
        data={filteredTags}
        renderItem={renderTagItem}
        keyExtractor={keyExtractor}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={isLoading} onRefresh={handleRefresh} />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            {isLoading ? (
              <ActivityIndicator size="large" color="#3B82F6" />
            ) : (
              <>
                <Text style={styles.emptyIcon}>🏷️</Text>
                <Text style={styles.emptyText}>No tags found</Text>
                <Text style={styles.emptySubtext}>
                  {searchQuery
                    ? 'Try a different search term'
                    : 'Pull down to refresh'}
                </Text>
              </>
            )}
          </View>
        }
      />

      {/* Last Sync Info */}
      {lastSyncAt && (
        <View style={styles.syncInfo}>
          <Text style={styles.syncText}>
            Last updated: {lastSyncAt.toLocaleTimeString()}
          </Text>
        </View>
      )}
    </View>
  );
}

// Tag Card Component
function TagCard({ tag }: { tag: Tag }) {
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

  return (
    <TouchableOpacity style={styles.tagCard}>
      <View style={styles.tagHeader}>
        <View style={[styles.statusIndicator, { backgroundColor: getStatusColor() }]} />
        <View style={styles.tagTitleContainer}>
          <Text style={styles.tagName} numberOfLines={1}>
            {tag.name}
          </Text>
          <Text style={styles.tagMac}>{tag.mac}</Text>
        </View>
        <View style={styles.tagStatus}>
          <Text style={[styles.statusText, { color: getStatusColor() }]}>
            {tag.status.charAt(0).toUpperCase() + tag.status.slice(1)}
          </Text>
        </View>
      </View>

      <View style={styles.tagMetrics}>
        {/* Temperature */}
        {tag.temperature !== undefined && (
          <View style={styles.metricItem}>
            <Text style={styles.metricIcon}>🌡️</Text>
            <Text
              style={[
                styles.metricValue,
                tag.temperature > 8 && styles.alertValue,
                tag.temperature < -25 && styles.alertValue,
              ]}
            >
              {tag.temperature.toFixed(1)}C
            </Text>
          </View>
        )}

        {/* Humidity */}
        {tag.humidity !== undefined && (
          <View style={styles.metricItem}>
            <Text style={styles.metricIcon}>💧</Text>
            <Text style={styles.metricValue}>{tag.humidity.toFixed(0)}%</Text>
          </View>
        )}

        {/* Battery */}
        {tag.battery !== undefined && (
          <View style={styles.metricItem}>
            <Text style={styles.metricIcon}>🔋</Text>
            <Text
              style={[
                styles.metricValue,
                tag.battery < 20 && styles.warningValue,
              ]}
            >
              {tag.battery}%
            </Text>
          </View>
        )}

        {/* Distance */}
        {tag.distance_m !== undefined && (
          <View style={styles.metricItem}>
            <Text style={styles.metricIcon}>📍</Text>
            <Text style={styles.metricValue}>
              {tag.distance_m < 1000
                ? `${tag.distance_m}m`
                : `${(tag.distance_m / 1000).toFixed(1)}km`}
            </Text>
          </View>
        )}
      </View>

      {/* Last Seen */}
      {tag.last_seen_at && (
        <Text style={styles.lastSeen}>
          Last seen: {formatLastSeen(tag.last_seen_at)}
        </Text>
      )}
    </TouchableOpacity>
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
  container: {
    flex: 1,
    backgroundColor: '#F3F4F6',
  },
  searchContainer: {
    padding: 16,
    paddingBottom: 8,
    backgroundColor: '#FFFFFF',
  },
  searchInput: {
    backgroundColor: '#F3F4F6',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: '#1F2937',
  },
  filterContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingBottom: 16,
    backgroundColor: '#FFFFFF',
    gap: 8,
  },
  filterButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#F3F4F6',
  },
  filterButtonActive: {
    backgroundColor: '#3B82F6',
  },
  filterText: {
    fontSize: 14,
    color: '#6B7280',
    fontWeight: '500',
  },
  filterTextActive: {
    color: '#FFFFFF',
  },
  errorContainer: {
    padding: 16,
    backgroundColor: '#FEE2E2',
    marginHorizontal: 16,
    marginTop: 8,
    borderRadius: 12,
    alignItems: 'center',
  },
  errorText: {
    color: '#DC2626',
    fontSize: 14,
    marginBottom: 4,
  },
  retryText: {
    color: '#3B82F6',
    fontSize: 14,
    fontWeight: '500',
  },
  listContent: {
    padding: 16,
    paddingTop: 8,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 48,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 4,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#6B7280',
  },
  tagCard: {
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
  tagHeader: {
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
  tagTitleContainer: {
    flex: 1,
  },
  tagName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
  },
  tagMac: {
    fontSize: 12,
    color: '#9CA3AF',
    fontFamily: 'monospace',
    marginTop: 2,
  },
  tagStatus: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: '#F3F4F6',
  },
  statusText: {
    fontSize: 12,
    fontWeight: '500',
  },
  tagMetrics: {
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
  alertValue: {
    color: '#EF4444',
  },
  warningValue: {
    color: '#F59E0B',
  },
  lastSeen: {
    fontSize: 12,
    color: '#9CA3AF',
  },
  syncInfo: {
    padding: 12,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  syncText: {
    fontSize: 12,
    color: '#9CA3AF',
  },
});
