// Polyfills must run before any library code.
import './polyfills/hermes';
import './polyfills/intl-pluralrules';
import './polyfills/event';

// Hand off to Expo Router's standard entry.
import 'expo-router/entry';
