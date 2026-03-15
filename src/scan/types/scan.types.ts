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
