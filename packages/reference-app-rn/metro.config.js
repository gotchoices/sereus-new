// Metro configuration for workspace symlink resolution.
// Resolves workspace packages (cadre-core, etc.) and hoisted node_modules.

const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

// Resolve workspace root for symlinked packages
const workspaceRoot = path.resolve(__dirname, '../..');
config.watchFolders = [...(config.watchFolders ?? []), workspaceRoot];
config.resolver.nodeModulesPaths = [
  ...(config.resolver.nodeModulesPaths ?? []),
  path.resolve(__dirname, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

module.exports = config;

