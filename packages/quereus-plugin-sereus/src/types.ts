import type { Libp2p } from '@libp2p/interface';
import type { IRepo } from '@optimystic/db-core';

export interface StrandConnectionOptions {
	/** UUID of the strand to connect to */
	strandId: string;
	/** Bootstrap multiaddrs for peer discovery */
	bootstrapNodes?: string[];
	/** sApp schema DDL to apply (optional - omit if schema already exists on strand) */
	schema?: string;
	/** sApp author public key */
	sAppId?: string;
	/** sApp version */
	sAppVersion?: string;
	/** libp2p listening port (default: 0 = random) */
	port?: number;
	/** Enable optimystic caching (default: true) */
	enableCache?: boolean;
	/** FRET profile (default: 'edge') */
	fretProfile?: 'edge' | 'core';
	/** Inject an existing libp2p node instead of creating one */
	libp2pNode?: Libp2p;
	/** Required when libp2pNode is provided */
	coordinatedRepo?: IRepo;
	/** @internal Override transactor type (default: 'network'; use 'test' for unit tests) */
	transactor?: string;
}

export interface SereusPluginResult {
	vtables: [];
	functions: [];
	collations: [];
	/** Shuts down the libp2p node and collection factory. Call when done. */
	shutdown: () => Promise<void>;
}

/**
 * Extended Libp2p node type with coordinatedRepo attached by createLibp2pNode.
 * @internal
 */
export interface Libp2pNodeWithRepo extends Libp2p {
	coordinatedRepo: IRepo;
}
