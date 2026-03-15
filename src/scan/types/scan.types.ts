export enum ScanStatus {
  Queued = 'Queued',
  Scanning = 'Scanning',
  Finished = 'Finished',
  Failed = 'Failed',
}

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

export interface ScanRecord {
  id: string;
  repoUrl: string;
  status: ScanStatus;
  criticalVulnerabilities: CriticalVulnerability[];
  error?: string;
  createdAt: Date;
  updatedAt: Date;
}

/** Trivy JSON output types — used for stream-based parsing */
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
  return error instanceof Error;
}
