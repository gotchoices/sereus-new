// Metro configuration for workspace symlink resolution.
// Resolves workspace packages (cadre-core, etc.) and hoisted node_modules.

const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

// Resolve workspace root for symlinked packages
const workspaceRoot = path.resolve(__dirname, '../..');
const optimysticRoot = path.resolve(__dirname, '../../../optimystic');
const quereusRoot = path.resolve(__dirname, '../../../quereus');

config.watchFolders = [
  ...(config.watchFolders ?? []),
  workspaceRoot,
  optimysticRoot,
  quereusRoot,
];

config.resolver.unstable_enableSymlinks = true;

config.resolver.nodeModulesPaths = [
  ...(config.resolver.nodeModulesPaths ?? []),
  path.resolve(__dirname, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
  path.resolve(optimysticRoot, 'node_modules'),
  path.resolve(quereusRoot, 'node_modules'),
];

// Polyfill Node.js built-ins for React Native
config.resolver.extraNodeModules = {
  ...(config.resolver.extraNodeModules ?? {}),
  'node:os': path.resolve(__dirname, 'polyfills/node-os.js'),
  'node:stream': require.resolve('readable-stream'),
  'node:buffer': require.resolve('buffer'),
  'node:crypto': path.resolve(__dirname, 'polyfills/node-crypto.js'),
  os: path.resolve(__dirname, 'polyfills/node-os.js'),
  stream: require.resolve('readable-stream'),
  buffer: require.resolve('buffer'),
  crypto: path.resolve(__dirname, 'polyfills/node-crypto.js'),
};

module.exports = config;

