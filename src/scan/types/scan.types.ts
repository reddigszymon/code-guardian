/** The four lifecycle states of a scan, matching the assignment specification. */
export enum ScanStatus {
  Queued = 'Queued',
  Scanning = 'Scanning',
  Finished = 'Finished',
  Failed = 'Failed',
}

/** A single critical vulnerability extracted from Trivy scan results. */
export interface CriticalVulnerability {
  vulnerabilityId: string;
  pkgName: string;
  installedVersion: string;
  fixedVersion: string;
  title: string;
  description: string;
  severity: string;
  target: string;
}

/** Internal representation of a scan stored in the in-memory store. */
export interface ScanRecord {
  id: string;
  repoUrl: string;
  status: ScanStatus;
  criticalVulnerabilities: CriticalVulnerability[];
  error?: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Response shape for GET /api/scan/:scanId.
 * Status is always present; criticalVulnerabilities only included when Finished.
 */
export interface ScanResponse {
  status: ScanStatus;
  criticalVulnerabilities?: CriticalVulnerability[];
  error?: string;
}

// ─── Trivy JSON output types — used for stream-based parsing ─────────────

/** Trivy severity level used to filter critical vulnerabilities. */
export const TRIVY_SEVERITY_CRITICAL = 'CRITICAL';

export interface TrivyVulnerability {
  VulnerabilityID?: string;
  PkgName?: string;
  InstalledVersion?: string;
  FixedVersion?: string;
  Title?: string;
  Description?: string;
  Severity?: string;
}

export interface TrivyResult {
  Target?: string;
  Vulnerabilities?: TrivyVulnerability[];
}

export interface StreamArrayChunk {
  key: number;
  value: TrivyResult;
}

/** Type-safe error message extraction for catch(error: unknown) blocks */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

/** Narrow an unknown catch value to an object with optional exec-specific fields */
export interface ExecError extends Error {
  code?: string | number;
  killed?: boolean;
  stderr?: string;
}

export function isExecError(error: unknown): error is ExecError {
  return (
    error instanceof Error &&
    ('code' in error || 'killed' in error || 'stderr' in error)
  );
}
