# UTtag Mobile App

React Native mobile application for UTtag IoT cold chain tracking system.

## Features

- Real-time tag tracking on map
- Tag list with status and temperature monitoring
- QR code scanning for tag identification
- Push notifications for alerts (temperature, geofence, SOS)
- Offline mode with automatic sync
- Biometric authentication support
- Task management for drivers

## Prerequisites

- Node.js 18+
- npm or yarn
- Expo CLI (`npm install -g expo-cli`)
- iOS: Xcode 15+ (for iOS development)
- Android: Android Studio with SDK 33+ (for Android development)

## Setup

### 1. Install Dependencies

```bash
cd mobile
npm install
```

### 2. Configure Environment

Create a `.env` file in the mobile directory:

```env
# API Configuration
API_URL=https://uttag.api.uttec.com.tw

# Firebase (for push notifications)
FIREBASE_PROJECT_ID=your-firebase-project-id

# Google Maps (for map display)
GOOGLE_MAPS_API_KEY=your-google-maps-api-key
```

### 3. Firebase Setup (Push Notifications)

1. Create a Firebase project at https://console.firebase.google.com
2. Add iOS and Android apps to your Firebase project
3. Download `google-services.json` (Android) and `GoogleService-Info.plist` (iOS)
4. Place `google-services.json` in the `mobile/` directory
5. For iOS, the plist will be configured during `expo prebuild`

### 4. Google Maps Setup

1. Enable Maps SDK for iOS and Android in Google Cloud Console
2. Create API keys with appropriate restrictions
3. Update `app.json` with your API keys

## Development

### Start Development Server

```bash
# Start Expo development server
npm start

# Start with specific platform
npm run android
npm run ios
```

### Build for Production

```bash
# Install EAS CLI
npm install -g eas-cli

# Configure EAS
eas login
eas build:configure

# Build for platforms
eas build --platform ios
eas build --platform android
```

## Project Structure

```
mobile/
├── src/
│   ├── screens/           # Screen components
│   │   ├── MapScreen.tsx
│   │   ├── TagsScreen.tsx
│   │   └── ...
│   ├── components/         # Reusable UI components
│   │   ├── TagCard.tsx
│   │   ├── AlertItem.tsx
│   │   └── ...
│   ├── stores/             # Zustand state stores
│   │   ├── authStore.ts
│   │   ├── tagStore.ts
│   │   └── ...
│   ├── services/           # API and service integrations
│   │   ├── api.ts
│   │   ├── push.ts
│   │   ├── sync.ts
│   │   └── ...
│   └── navigation/         # Navigation configuration
│       └── RootNavigator.tsx
├── app.json                # Expo configuration
├── package.json            # Dependencies
└── README.md
```

## API Endpoints

The mobile app uses the following backend API endpoints:

### Device Registration
- `POST /api/mobile/register-device` - Register FCM token
- `DELETE /api/mobile/register-device` - Unregister device

### Location
- `PUT /api/mobile/location` - Update driver location
- `GET /api/mobile/location/nearby` - Get nearby tags
- `GET /api/mobile/location/history` - Get location history

### Sync
- `POST /api/mobile/sync` - Sync offline data
- `GET /api/mobile/sync/status` - Get sync status

### Notifications
- `GET /api/mobile/notifications` - Get notification preferences
- `PUT /api/mobile/notifications` - Update preferences
- `GET /api/mobile/notifications/history` - Get alert history
- `POST /api/mobile/notifications/:id/read` - Mark alert as read
- `POST /api/mobile/notifications/read-all` - Mark all as read

## Push Notification Channels

| Channel | Description | Priority |
|---------|-------------|----------|
| emergency_alerts | SOS alerts | Critical |
| critical_alerts | Temperature excursions | High |
| geofence_alerts | Geofence breaches | High |
| device_alerts | Battery/Offline alerts | Default |
| task_updates | Task assignments | Default |

## Offline Support

The app supports offline operation:

1. **Tag Data**: Cached locally for viewing when offline
2. **Scans**: Queued and synced when back online
3. **Tasks**: Can be updated offline and synced later
4. **Automatic Sync**: Triggers when network connection restored

## Troubleshooting

### Push Notifications Not Working

1. Verify Firebase configuration files are in place
2. Check that the device is registered (check server logs)
3. Ensure notification permissions are granted
4. For iOS, ensure APNs is configured in Firebase

### Map Not Loading

1. Verify Google Maps API key is correct
2. Check that Maps SDK is enabled in Google Cloud Console
3. Ensure API key has no IP restrictions for development

### Sync Issues

1. Check network connectivity
2. Verify authentication token is valid
3. Check server logs for sync errors
4. Clear app cache and re-login

## Contributing

1. Follow the existing code style (ESLint + Prettier)
2. Write TypeScript with proper types
3. Test on both iOS and Android before submitting
4. Update this README for new features

## License

Proprietary - UTTEC Corporation
