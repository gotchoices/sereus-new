// Core types
export * from './types';

// Main CadreNode class
export { CadreNode } from './cadre-node';

// Strand management
export {
  StrandWatcher,
  type StrandWatcherCallbacks,
  type StrandQueryable,
  type SAppIdLookup,
  type StrandRowWithApp
} from './strand-watcher';
export {
  StrandInstanceManager,
  type StartStrandConfig,
  getStrandStoragePath
} from './strand-instance-manager';

// Hibernation
export {
  HibernationManager,
  type HibernationCallbacks
} from './hibernation-manager';

// Arachnode (stub)
export {
  ArachnodeStub,
  createArachnodeStub,
  type RingConfig
} from './arachnode-stub';

// Enrollment
export { EnrollmentService, type AuthorityVerifier, type PeerRegistry } from './enrollment';
