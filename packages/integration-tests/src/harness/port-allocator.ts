/**
 * Port allocator for integration tests.
 * 
 * Ensures each test gets unique ports to avoid conflicts,
 * even when tests run in sequence or parallel.
 */

// IMPORTANT:
// These integration tests are typically executed by Vitest using multiple workers.
// A per-process in-memory allocator cannot prevent cross-process port collisions.
//
// The most reliable approach is to request an ephemeral port from the OS by
// listening on port 0. Libp2p will bind an available port and report the actual
// listen multiaddrs after start.
const EPHEMERAL_PORT = 0;

/**
 * Allocate a single available port
 */
export async function allocatePort(): Promise<number> {
  return EPHEMERAL_PORT;
}

/**
 * Allocate multiple contiguous-ish ports
 */
export async function allocatePorts(count: number): Promise<number[]> {
  const ports: number[] = [];
  
  for (let i = 0; i < count; i++) {
    ports.push(await allocatePort());
  }
  
  return ports;
}

/**
 * Release ports back to the pool
 */
export function releasePorts(ports: number[]): void {
  // noop - ports are ephemeral and managed by the OS
  void ports;
}

/**
 * Release all allocated ports (for cleanup)
 */
export function releaseAllPorts(): void {
  // noop - ports are ephemeral and managed by the OS
}

/**
 * Get count of currently allocated ports
 */
export function getAllocatedCount(): number {
  return 0;
}

