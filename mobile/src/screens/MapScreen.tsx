/**
 * Map Screen
 * Phase 4: Mobile App - Main Map View with Tags
 */

import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import MapView, { Marker, Region, PROVIDER_GOOGLE } from 'react-native-maps';
import * as Location from 'expo-location';
import { useTagStore, Tag } from '../stores/tagStore';
import { mobileApi } from '../services/api';

// Default region (Taiwan)
const DEFAULT_REGION: Region = {
  latitude: 25.0330,
  longitude: 121.5654,
  latitudeDelta: 0.1,
  longitudeDelta: 0.1,
};

// Marker colors by status
const MARKER_COLORS = {
  online: '#22C55E',  // Green
  offline: '#6B7280', // Gray
  alert: '#EF4444',   // Red
};

export default function MapScreen() {
  const mapRef = useRef<MapView>(null);
  const [userLocation, setUserLocation] = useState<Location.LocationObject | null>(null);
  const [isLoadingLocation, setIsLoadingLocation] = useState(true);
  const [selectedTag, setSelectedTag] = useState<Tag | null>(null);

  const { tags, fetchTags, isLoading } = useTagStore();

  // Request location permission and get current location
  useEffect(() => {
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert(
            'Location Permission',
            'Location permission is required to show your position on the map.'
          );
          setIsLoadingLocation(false);
          return;
        }

        const location = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        setUserLocation(location);

        // Update server with location
        await mobileApi.updateLocation({
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
          accuracy: location.coords.accuracy || undefined,
          speed: location.coords.speed || undefined,
          heading: location.coords.heading || undefined,
        });
      } catch (error) {
        console.error('Error getting location:', error);
      } finally {
        setIsLoadingLocation(false);
      }
    })();
  }, []);

  // Fetch tags on mount
  useEffect(() => {
    fetchTags();
  }, [fetchTags]);

  // Center map on user location
  const centerOnUser = useCallback(() => {
    if (userLocation && mapRef.current) {
      mapRef.current.animateToRegion({
        latitude: userLocation.coords.latitude,
        longitude: userLocation.coords.longitude,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      });
    }
  }, [userLocation]);

  // Fit map to show all tags
  const fitToTags = useCallback(() => {
    if (!mapRef.current || tags.length === 0) return;

    const coordinates = tags
      .filter((t) => t.latitude && t.longitude)
      .map((t) => ({
        latitude: t.latitude!,
        longitude: t.longitude!,
      }));

    if (coordinates.length > 0) {
      mapRef.current.fitToCoordinates(coordinates, {
        edgePadding: { top: 50, right: 50, bottom: 50, left: 50 },
        animated: true,
      });
    }
  }, [tags]);

  // Handle marker press
  const handleMarkerPress = useCallback((tag: Tag) => {
    setSelectedTag(tag);
  }, []);

  // Close tag info
  const closeTagInfo = useCallback(() => {
    setSelectedTag(null);
  }, []);

  // Get initial region
  const getInitialRegion = (): Region => {
    if (userLocation) {
      return {
        latitude: userLocation.coords.latitude,
        longitude: userLocation.coords.longitude,
        latitudeDelta: 0.05,
        longitudeDelta: 0.05,
      };
    }
    return DEFAULT_REGION;
  };

  if (isLoadingLocation) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#3B82F6" />
        <Text style={styles.loadingText}>Getting location...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        style={styles.map}
        provider={PROVIDER_GOOGLE}
        initialRegion={getInitialRegion()}
        showsUserLocation
        showsMyLocationButton={false}
        showsCompass
        showsScale
      >
        {tags.map((tag) => {
          if (!tag.latitude || !tag.longitude) return null;

          return (
            <Marker
              key={tag.mac}
              coordinate={{
                latitude: tag.latitude,
                longitude: tag.longitude,
              }}
              title={tag.name}
              description={
                tag.temperature !== undefined
                  ? `${tag.temperature.toFixed(1)}C`
                  : undefined
              }
              pinColor={MARKER_COLORS[tag.status]}
              onPress={() => handleMarkerPress(tag)}
            />
          );
        })}
      </MapView>

      {/* Map Controls */}
      <View style={styles.controls}>
        <TouchableOpacity
          style={styles.controlButton}
          onPress={centerOnUser}
          disabled={!userLocation}
        >
          <Text style={styles.controlIcon}>📍</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.controlButton}
          onPress={fitToTags}
          disabled={tags.length === 0}
        >
          <Text style={styles.controlIcon}>🏷️</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.controlButton}
          onPress={() => fetchTags()}
          disabled={isLoading}
        >
          {isLoading ? (
            <ActivityIndicator size="small" color="#3B82F6" />
          ) : (
            <Text style={styles.controlIcon}>🔄</Text>
          )}
        </TouchableOpacity>
      </View>

      {/* Tag Info Card */}
      {selectedTag && (
        <View style={styles.tagCard}>
          <View style={styles.tagHeader}>
            <View
              style={[
                styles.statusDot,
                { backgroundColor: MARKER_COLORS[selectedTag.status] },
              ]}
            />
            <Text style={styles.tagName}>{selectedTag.name}</Text>
            <TouchableOpacity onPress={closeTagInfo}>
              <Text style={styles.closeButton}>✕</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.tagInfo}>
            <Text style={styles.tagMac}>{selectedTag.mac}</Text>

            {selectedTag.temperature !== undefined && (
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Temperature:</Text>
                <Text
                  style={[
                    styles.infoValue,
                    selectedTag.temperature > 8 && styles.alertValue,
                  ]}
                >
                  {selectedTag.temperature.toFixed(1)}C
                </Text>
              </View>
            )}

            {selectedTag.humidity !== undefined && (
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Humidity:</Text>
                <Text style={styles.infoValue}>
                  {selectedTag.humidity.toFixed(1)}%
                </Text>
              </View>
            )}

            {selectedTag.battery !== undefined && (
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Battery:</Text>
                <Text style={styles.infoValue}>{selectedTag.battery}%</Text>
              </View>
            )}

            {selectedTag.last_seen_at && (
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Last seen:</Text>
                <Text style={styles.infoValue}>
                  {new Date(selectedTag.last_seen_at).toLocaleString()}
                </Text>
              </View>
            )}
          </View>

          <TouchableOpacity style={styles.detailButton}>
            <Text style={styles.detailButtonText}>View Details</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#6B7280',
  },
  map: {
    flex: 1,
  },
  controls: {
    position: 'absolute',
    top: 60,
    right: 16,
    gap: 8,
  },
  controlButton: {
    width: 44,
    height: 44,
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  controlIcon: {
    fontSize: 20,
  },
  tagCard: {
    position: 'absolute',
    bottom: 100,
    left: 16,
    right: 16,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
  },
  tagHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 8,
  },
  tagName: {
    flex: 1,
    fontSize: 18,
    fontWeight: '600',
    color: '#1F2937',
  },
  closeButton: {
    fontSize: 20,
    color: '#9CA3AF',
    padding: 4,
  },
  tagInfo: {
    marginBottom: 12,
  },
  tagMac: {
    fontSize: 12,
    color: '#9CA3AF',
    fontFamily: 'monospace',
    marginBottom: 8,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  infoLabel: {
    fontSize: 14,
    color: '#6B7280',
  },
  infoValue: {
    fontSize: 14,
    fontWeight: '500',
    color: '#1F2937',
  },
  alertValue: {
    color: '#EF4444',
  },
  detailButton: {
    backgroundColor: '#3B82F6',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  detailButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
});
