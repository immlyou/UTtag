/**
 * Root Navigator
 * Phase 4: Mobile App - Navigation Configuration
 */

import React, { useEffect, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { useAuthStore, initializeAuth } from '../stores/authStore';

// Screens (placeholders - implement fully in separate files)
import MapScreen from '../screens/MapScreen';
import TagsScreen from '../screens/TagsScreen';

// Placeholder screens
function LoginScreen() {
  return (
    <View style={styles.placeholder}>
      <Text style={styles.placeholderText}>Login Screen</Text>
    </View>
  );
}

function ScanScreen() {
  return (
    <View style={styles.placeholder}>
      <Text style={styles.placeholderEmoji}>📷</Text>
      <Text style={styles.placeholderText}>Scan QR Code</Text>
    </View>
  );
}

function TasksScreen() {
  return (
    <View style={styles.placeholder}>
      <Text style={styles.placeholderEmoji}>📋</Text>
      <Text style={styles.placeholderText}>Tasks</Text>
    </View>
  );
}

function ProfileScreen() {
  return (
    <View style={styles.placeholder}>
      <Text style={styles.placeholderEmoji}>👤</Text>
      <Text style={styles.placeholderText}>Profile & Settings</Text>
    </View>
  );
}

function TagDetailScreen() {
  return (
    <View style={styles.placeholder}>
      <Text style={styles.placeholderText}>Tag Detail</Text>
    </View>
  );
}

// Navigation types
export type RootStackParamList = {
  Auth: undefined;
  Main: undefined;
};

export type AuthStackParamList = {
  Login: undefined;
  ForgotPassword: undefined;
  BiometricSetup: undefined;
};

export type MainTabParamList = {
  Map: undefined;
  Tags: undefined;
  Scan: undefined;
  Tasks: undefined;
  Profile: undefined;
};

export type MapStackParamList = {
  MapHome: undefined;
  TagDetail: { mac: string };
};

export type TagsStackParamList = {
  TagList: undefined;
  TagDetail: { mac: string };
  TagHistory: { mac: string };
};

// Create navigators
const RootStack = createNativeStackNavigator<RootStackParamList>();
const AuthStack = createNativeStackNavigator<AuthStackParamList>();
const MainTab = createBottomTabNavigator<MainTabParamList>();
const MapStack = createNativeStackNavigator<MapStackParamList>();
const TagsStack = createNativeStackNavigator<TagsStackParamList>();

// Tab bar icons
function TabIcon({ name, focused }: { name: string; focused: boolean }) {
  const icons: Record<string, string> = {
    Map: '🗺️',
    Tags: '🏷️',
    Scan: '📷',
    Tasks: '📋',
    Profile: '👤',
  };

  return (
    <Text style={[styles.tabIcon, focused && styles.tabIconFocused]}>
      {icons[name] || '❓'}
    </Text>
  );
}

// Auth Navigator
function AuthNavigator() {
  return (
    <AuthStack.Navigator screenOptions={{ headerShown: false }}>
      <AuthStack.Screen name="Login" component={LoginScreen} />
    </AuthStack.Navigator>
  );
}

// Map Stack Navigator
function MapNavigator() {
  return (
    <MapStack.Navigator>
      <MapStack.Screen
        name="MapHome"
        component={MapScreen}
        options={{ headerShown: false }}
      />
      <MapStack.Screen
        name="TagDetail"
        component={TagDetailScreen}
        options={{ title: 'Tag Details' }}
      />
    </MapStack.Navigator>
  );
}

// Tags Stack Navigator
function TagsNavigator() {
  return (
    <TagsStack.Navigator>
      <TagsStack.Screen
        name="TagList"
        component={TagsScreen}
        options={{ title: 'Tags' }}
      />
      <TagsStack.Screen
        name="TagDetail"
        component={TagDetailScreen}
        options={{ title: 'Tag Details' }}
      />
    </TagsStack.Navigator>
  );
}

// Main Tab Navigator
function MainNavigator() {
  return (
    <MainTab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused }) => <TabIcon name={route.name} focused={focused} />,
        tabBarActiveTintColor: '#3B82F6',
        tabBarInactiveTintColor: '#6B7280',
        tabBarStyle: styles.tabBar,
        tabBarLabelStyle: styles.tabLabel,
        headerShown: false,
      })}
    >
      <MainTab.Screen name="Map" component={MapNavigator} />
      <MainTab.Screen name="Tags" component={TagsNavigator} />
      <MainTab.Screen
        name="Scan"
        component={ScanScreen}
        options={{
          tabBarLabel: '',
          tabBarIcon: () => (
            <View style={styles.scanButton}>
              <Text style={styles.scanIcon}>📷</Text>
            </View>
          ),
        }}
      />
      <MainTab.Screen name="Tasks" component={TasksScreen} />
      <MainTab.Screen name="Profile" component={ProfileScreen} />
    </MainTab.Navigator>
  );
}

// Root Navigator Component
export default function RootNavigator() {
  const [isInitializing, setIsInitializing] = useState(true);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  useEffect(() => {
    // Initialize auth state
    initializeAuth().finally(() => {
      setIsInitializing(false);
    });
  }, []);

  if (isInitializing) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#3B82F6" />
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }

  return (
    <NavigationContainer>
      <RootStack.Navigator screenOptions={{ headerShown: false }}>
        {isAuthenticated ? (
          <RootStack.Screen name="Main" component={MainNavigator} />
        ) : (
          <RootStack.Screen name="Auth" component={AuthNavigator} />
        )}
      </RootStack.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#6B7280',
  },
  placeholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
  },
  placeholderEmoji: {
    fontSize: 48,
    marginBottom: 16,
  },
  placeholderText: {
    fontSize: 18,
    color: '#6B7280',
    fontWeight: '500',
  },
  tabBar: {
    height: 88,
    paddingTop: 8,
    paddingBottom: 32,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  tabLabel: {
    fontSize: 11,
    fontWeight: '500',
  },
  tabIcon: {
    fontSize: 24,
    opacity: 0.6,
  },
  tabIconFocused: {
    opacity: 1,
  },
  scanButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#3B82F6',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 32,
    shadowColor: '#3B82F6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  scanIcon: {
    fontSize: 28,
  },
});
