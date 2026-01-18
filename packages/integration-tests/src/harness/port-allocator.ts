/**
 * Port allocator for integration tests.
 * 
 * Ensures each test gets unique ports to avoid conflicts,
 * even when tests run in sequence or parallel.
 */

import { createServer } from 'net';

// Start from a high port range to avoid conflicts with system services
const BASE_PORT = 30000;
const MAX_PORT = 40000;

// Track allocated ports across the process lifetime
const allocatedPorts = new Set<number>();

/**
 * Check if a port is available by attempting to bind to it
 */
async function isPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = createServer();
    
    server.once('error', () => {
      resolve(false);
    });
    
    server.once('listening', () => {
      server.close(() => resolve(true));
    });
    
    server.listen(port, '127.0.0.1');
  });
}

/**
 * Allocate a single available port
 */
export async function allocatePort(): Promise<number> {
  for (let port = BASE_PORT; port < MAX_PORT; port++) {
    if (allocatedPorts.has(port)) {
      continue;
    }
    
    if (await isPortAvailable(port)) {
      allocatedPorts.add(port);
      return port;
    }
  }
  
  throw new Error(`No available ports in range ${BASE_PORT}-${MAX_PORT}`);
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
  for (const port of ports) {
    allocatedPorts.delete(port);
  }
}

/**
 * Release all allocated ports (for cleanup)
 */
export function releaseAllPorts(): void {
  allocatedPorts.clear();
}

/**
 * Get count of currently allocated ports
 */
export function getAllocatedCount(): number {
  return allocatedPorts.size;
}

