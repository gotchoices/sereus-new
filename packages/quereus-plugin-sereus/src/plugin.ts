/**
 * Quereus plugin entry point for Sereus strand connections.
 *
 * Loaded via Quoomb's `.plugin install` or config file, or via `registerPlugin()`.
 * Parses SqlValue config and delegates to `connectToStrand`.
 */

import type { Database, SqlValue } from '@quereus/quereus';
import { connectToStrand } from './connect.js';
import type { StrandConnectionOptions, SereusPluginResult } from './types.js';

/**
 * Parse the plugin-loader SqlValue config into typed StrandConnectionOptions.
 */
export function parseConfig(config: Record<string, SqlValue>): StrandConnectionOptions {
	const strandId = config.strand_id;
	if (typeof strandId !== 'string' || !strandId) {
		throw new Error('quereus-plugin-sereus: strand_id is required');
	}

	const bootstrapNodesRaw = config.bootstrap_nodes;
	const bootstrapNodes = typeof bootstrapNodesRaw === 'string' && bootstrapNodesRaw
		? bootstrapNodesRaw.split(',').map(s => s.trim()).filter(Boolean)
		: [];

	const schema = typeof config.schema === 'string' ? config.schema : undefined;
	const sAppId = typeof config.sapp_id === 'string' ? config.sapp_id : 'unknown';
	const sAppVersion = typeof config.sapp_version === 'string' ? config.sapp_version : '1.0.0';
	const port = typeof config.port === 'number' ? config.port : 0;
	const enableCache = config.enable_cache !== false && config.enable_cache !== 0;
	const fretProfile = config.fret_profile === 'core' ? 'core' as const : 'edge' as const;

	return {
		strandId,
		bootstrapNodes,
		schema,
		sAppId,
		sAppVersion,
		port,
		enableCache,
		fretProfile,
	};
}

/**
 * Default export: Quereus plugin registration function.
 */
export default async function register(
	db: Database,
	config: Record<string, SqlValue> = {},
): Promise<SereusPluginResult> {
	const options = parseConfig(config);
	return connectToStrand(db, options);
}
