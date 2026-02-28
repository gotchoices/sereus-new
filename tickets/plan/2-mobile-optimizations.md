priority: 2
description: Design mobile-specific features: secure key storage, background service, battery/network awareness
dependencies: packages/cadre-core, packages/reference-app-rn, expo-secure-store or react-native-keychain
----
Mobile nodes need platform-specific optimizations beyond the base cadre-core functionality.

### Secure key storage
Authority keys and peer private keys should be stored in the platform's secure enclave (iOS Keychain / Android Keystore) rather than in plain app storage. This protects keys at rest.

### Background service
An always-on background service keeps the cadre node connected for push wake signals and strand activity. On iOS this requires background modes; on Android, a foreground service.

### Battery and network awareness
- Battery-aware sync scheduling: reduce sync frequency on low battery, defer non-urgent work
- Network-aware bootstrap: prefer WiFi over cellular for initial sync, adapt behavior on metered connections
- Minimal memory footprint: limit concurrent strand instances on mobile

## TODO
- [ ] Research expo-secure-store vs react-native-keychain for key storage
- [ ] Design key storage integration with CadreNode identity
- [ ] Research RN background service patterns (expo-task-manager, headless JS)
- [ ] Design battery-aware sync policy
- [ ] Design network-aware bootstrap strategy
- [ ] Specify memory limits for mobile strand instances
