import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';
import debug from 'debug';
import type { StrandFilter } from '@sereus/cadre-core';
import { CliConfigFile, ResolvedConfig, ENV_MAPPINGS } from './types.js';

const log = debug('cadre:cli:config');

/**
 * Load configuration from a YAML or JSON file
 */
export async function loadConfigFile(configPath: string): Promise<CliConfigFile> {
  const fullPath = path.resolve(configPath);
  log('Loading config from: %s', fullPath);

  if (!fs.existsSync(fullPath)) {
    throw new Error(`Config file not found: ${fullPath}`);
  }

  const content = fs.readFileSync(fullPath, 'utf-8');
  const ext = path.extname(fullPath).toLowerCase();

  if (ext === '.yaml' || ext === '.yml') {
    return yaml.load(content) as CliConfigFile;
  } else if (ext === '.json') {
    return JSON.parse(content);
  } else {
    // Try YAML first, fall back to JSON
    try {
      return yaml.load(content) as CliConfigFile;
    } catch {
      return JSON.parse(content);
    }
  }
}

/**
 * Apply environment variable overrides to config
 */
export function applyEnvironmentOverrides(config: CliConfigFile): CliConfigFile {
  const result = { ...config };

  for (const [envVar, configPath] of Object.entries(ENV_MAPPINGS)) {
    const value = process.env[envVar];
    if (value === undefined) continue;

    log('Applying env override: %s=%s', envVar, value);
    setNestedValue(result, configPath, parseEnvValue(envVar, value));
  }

  return result;
}

function parseEnvValue(envVar: string, value: string): unknown {
  // Handle array values (comma-separated)
  if (envVar.endsWith('_NODES') || envVar.endsWith('_ADDRS')) {
    return value.split(',').map(s => s.trim()).filter(Boolean);
  }
  // Handle boolean values
  if (envVar.includes('_ENABLED') || envVar.includes('_RELAY')) {
    return value.toLowerCase() === 'true' || value === '1';
  }
  return value;
}

function setNestedValue(obj: Record<string, unknown>, pathStr: string, value: unknown): void {
  const parts = pathStr.split('.');
  let current: Record<string, unknown> = obj;

  for (let i = 0; i < parts.length - 1; i++) {
    if (!(parts[i] in current) || typeof current[parts[i]] !== 'object') {
      current[parts[i]] = {};
    }
    current = current[parts[i]] as Record<string, unknown>;
  }

  current[parts[parts.length - 1]] = value;
}

/**
 * Load private key from file
 */
export async function loadPrivateKey(keyPath: string): Promise<Uint8Array> {
  const fullPath = path.resolve(keyPath);
  log('Loading private key from: %s', fullPath);

  if (!fs.existsSync(fullPath)) {
    throw new Error(`Key file not found: ${fullPath}`);
  }

  const content = fs.readFileSync(fullPath);
  // If it looks like hex, decode it
  const text = content.toString('utf-8').trim();
  if (/^[0-9a-fA-F]+$/.test(text)) {
    return Buffer.from(text, 'hex');
  }
  // Otherwise return raw bytes
  return new Uint8Array(content);
}

/**
 * Parse strand filter from config format to StrandFilter type
 */
export function parseStrandFilter(filter: CliConfigFile['strandFilter']): StrandFilter {
  if (!filter || filter === 'all') return { mode: 'all' };
  if (filter === 'none') return { mode: 'none' };
  if (typeof filter === 'object') {
    if ('sAppId' in filter) return { mode: 'sAppId', sAppId: filter.sAppId };
    if ('strandId' in filter) return { mode: 'strandId', strandId: filter.strandId };
  }
  return { mode: 'all' };
}

/**
 * Resolve configuration: load file, apply env overrides, load keys
 */
export async function resolveConfig(configPath: string): Promise<ResolvedConfig> {
  let fileConfig = await loadConfigFile(configPath);
  fileConfig = applyEnvironmentOverrides(fileConfig);

  // Load private key if specified
  let privateKey: Uint8Array | undefined;
  if (fileConfig.identity?.keyFile) {
    privateKey = await loadPrivateKey(fileConfig.identity.keyFile);
  } else if (fileConfig.identity?.privateKeyHex) {
    privateKey = Buffer.from(fileConfig.identity.privateKeyHex, 'hex');
  }

  return {
    privateKey,
    controlNetwork: fileConfig.controlNetwork,
    profile: fileConfig.profile,
    strandFilter: parseStrandFilter(fileConfig.strandFilter),
    storage: fileConfig.storage,
    network: fileConfig.network,
    hibernation: fileConfig.hibernation,
    strandWatchInterval: fileConfig.strandWatchInterval,
  };
}

