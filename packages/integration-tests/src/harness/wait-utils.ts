/**
 * Wait utilities for integration tests.
 * 
 * Instead of arbitrary delays, these wait for specific conditions.
 * FRET makes convergence fast, so waits should be short.
 */

import debug from 'debug';

const log = debug('sereus:integration:wait');

export interface WaitOptions {
  /** Maximum time to wait in ms (default: 10000) */
  timeoutMs?: number;
  /** Polling interval in ms (default: 100) */
  intervalMs?: number;
  /** Description for error messages */
  description?: string;
}

const DEFAULT_TIMEOUT = 10_000;
const DEFAULT_INTERVAL = 100;

/**
 * Wait until a condition function returns true
 */
export async function waitUntil(
  condition: () => Promise<boolean> | boolean,
  options: WaitOptions = {}
): Promise<void> {
  const {
    timeoutMs = DEFAULT_TIMEOUT,
    intervalMs = DEFAULT_INTERVAL,
    description = 'condition'
  } = options;
  
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeoutMs) {
    try {
      if (await condition()) {
        log('Wait complete: %s (took %dms)', description, Date.now() - startTime);
        return;
      }
    } catch (err) {
      // Condition threw - keep waiting
      log('Wait condition threw: %s - %s', description, (err as Error).message);
    }
    
    await sleep(intervalMs);
  }
  
  throw new Error(`Timeout waiting for ${description} after ${timeoutMs}ms`);
}

/**
 * Wait for a specific value from an async function
 */
export async function waitForValue<T>(
  getter: () => Promise<T> | T,
  expected: T,
  options: WaitOptions = {}
): Promise<void> {
  const description = options.description ?? `value to equal ${JSON.stringify(expected)}`;
  
  await waitUntil(async () => {
    const value = await getter();
    return value === expected;
  }, { ...options, description });
}

/**
 * Wait for a count to reach a minimum value
 */
export async function waitForCount(
  getter: () => Promise<number> | number,
  minCount: number,
  options: WaitOptions = {}
): Promise<void> {
  const description = options.description ?? `count >= ${minCount}`;
  
  await waitUntil(async () => {
    const count = await getter();
    return count >= minCount;
  }, { ...options, description });
}

/**
 * Wait for an array to have a minimum length
 */
export async function waitForArrayLength<T>(
  getter: () => Promise<T[]> | T[],
  minLength: number,
  options: WaitOptions = {}
): Promise<T[]> {
  const description = options.description ?? `array length >= ${minLength}`;
  let result: T[] = [];
  
  await waitUntil(async () => {
    result = await getter();
    return result.length >= minLength;
  }, { ...options, description });
  
  return result;
}

/**
 * Simple sleep utility
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Wait for all libp2p nodes to be connected to each other
 */
export async function waitForMeshConnected(
  getConnectionCounts: () => Promise<number[]>,
  minConnections: number,
  options: WaitOptions = {}
): Promise<void> {
  const description = options.description ?? `all nodes have >= ${minConnections} connections`;
  
  await waitUntil(async () => {
    const counts = await getConnectionCounts();
    return counts.every(c => c >= minConnections);
  }, { ...options, description });
}

