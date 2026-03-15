import { Injectable, Inject, Optional, Logger } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { ScanRecord, ScanStatus } from '../types/scan.types';

// Default tuned for --max-old-space-size=150; increase via env var if more RAM is available.
const DEFAULT_MAX_RECORDS = parseInt(process.env.MAX_SCAN_RECORDS || '100', 10);

export const MAX_SCAN_RECORDS_TOKEN = 'MAX_SCAN_RECORDS';

@Injectable()
export class ScanStore {
  private readonly logger = new Logger(ScanStore.name);
  private readonly records = new Map<string, ScanRecord>();
  private readonly maxRecords: number;

  constructor(@Optional() @Inject(MAX_SCAN_RECORDS_TOKEN) maxRecords?: number) {
    this.maxRecords = maxRecords ?? DEFAULT_MAX_RECORDS;
  }

  /** Creates a new scan record in Queued status. Evicts old records if at capacity. */
  create(repoUrl: string): ScanRecord {
    this.evictIfNeeded();
    const now = new Date();
    const record: ScanRecord = {
      id: uuidv4(),
      repoUrl,
      status: ScanStatus.Queued,
      criticalVulnerabilities: [],
      createdAt: now,
      updatedAt: now,
    };
    this.records.set(record.id, record);
    return record;
  }

  /** Returns a scan record by ID, or undefined if not found. */
  get(id: string): ScanRecord | undefined {
    return this.records.get(id);
  }

  /** Transitions a scan to the given status and merges optional partial data. */
  updateStatus(
    id: string,
    status: ScanStatus,
    data?: Partial<ScanRecord>,
  ): void {
    const record = this.records.get(id);
    if (!record) {
      return;
    }
    record.status = status;
    record.updatedAt = new Date();
    if (data) {
      Object.assign(record, data, {
        id: record.id,
        updatedAt: record.updatedAt,
      });
    }
  }

  private evictIfNeeded(): void {
    if (this.records.size < this.maxRecords) {
      return;
    }

    // Evict oldest completed/failed records first (Map iterates in insertion order)
    for (const [id, record] of this.records) {
      if (
        record.status === ScanStatus.Finished ||
        record.status === ScanStatus.Failed
      ) {
        this.records.delete(id);
        this.logger.log(`Evicted old scan record ${id}`);
        if (this.records.size < this.maxRecords) {
          return;
        }
      }
    }
  }
}
