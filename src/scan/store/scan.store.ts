import { Injectable } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { ScanRecord, ScanStatus } from '../types/scan.types';

@Injectable()
export class ScanStore {
  private readonly records = new Map<string, ScanRecord>();

  create(repoUrl: string): ScanRecord {
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

  get(id: string): ScanRecord | undefined {
    return this.records.get(id);
  }

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
}
