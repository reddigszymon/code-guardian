import { Injectable, Logger } from '@nestjs/common';
import * as os from 'os';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { ScanStore } from '../store/scan.store';
import { TrivyService } from '../services/trivy.service';
import { ScanStatus, getErrorMessage } from '../types/scan.types';
import { extractCriticalVulnerabilities } from '../streams/vulnerability-filter.stream';

const MAX_CONCURRENT_SCANS = parseInt(
  process.env.MAX_CONCURRENT_SCANS || '2',
  10,
);

@Injectable()
export class ScanWorker {
  private readonly logger = new Logger(ScanWorker.name);
  private activeScans = 0;
  private readonly queue: string[] = [];

  constructor(
    private readonly scanStore: ScanStore,
    private readonly trivyService: TrivyService,
  ) {}

  async processScan(scanId: string): Promise<void> {
    if (this.activeScans >= MAX_CONCURRENT_SCANS) {
      this.logger.log(
        `[${scanId}] Queued (${this.activeScans}/${MAX_CONCURRENT_SCANS} active)`,
      );
      this.queue.push(scanId);
      return;
    }
    await this.runScan(scanId);
  }

  private drainQueue(): void {
    while (this.queue.length > 0 && this.activeScans < MAX_CONCURRENT_SCANS) {
      const nextId = this.queue.shift();
      if (nextId) {
        // Fire-and-forget so we can keep draining
        this.runScan(nextId).catch((error: unknown) => {
          this.logger.error(
            `[${nextId}] Queued scan failed: ${getErrorMessage(error)}`,
          );
        });
      }
    }
  }

  private async runScan(scanId: string): Promise<void> {
    const record = this.scanStore.get(scanId);
    if (!record) {
      this.logger.error(`Scan record ${scanId} not found`);
      return;
    }

    this.activeScans++;
    const outputPath = path.join(
      os.tmpdir(),
      `code-guardian-result-${uuidv4()}.json`,
    );
    let cloneDir: string | undefined;

    try {
      this.scanStore.updateStatus(scanId, ScanStatus.Scanning);
      this.logger.log(`[${scanId}] Scanning ${record.repoUrl}`);

      cloneDir = await this.trivyService.cloneRepo(record.repoUrl);
      this.logger.log(`[${scanId}] Cloned to ${cloneDir}`);

      await this.trivyService.runScan(cloneDir, outputPath);
      this.logger.log(`[${scanId}] Trivy scan complete`);

      const result = await extractCriticalVulnerabilities(outputPath);
      this.logger.log(
        `[${scanId}] Found ${result.vulnerabilities.length} critical vulnerabilities${result.truncated ? ' (truncated)' : ''}`,
      );

      this.scanStore.updateStatus(scanId, ScanStatus.Finished, {
        criticalVulnerabilities: result.vulnerabilities,
      });
      this.logger.log(`[${scanId}] Scan finished`);
    } catch (error: unknown) {
      const msg = getErrorMessage(error);
      this.logger.error(`[${scanId}] Scan failed: ${msg}`);
      try {
        this.scanStore.updateStatus(scanId, ScanStatus.Failed, {
          error: msg,
        });
      } catch (updateError: unknown) {
        this.logger.error(
          `[${scanId}] Failed to update status to Failed: ${getErrorMessage(updateError)}`,
        );
      }
    } finally {
      this.activeScans--;
      try {
        const cleanupPaths = [outputPath];
        if (cloneDir) {
          cleanupPaths.push(cloneDir);
        }
        await this.trivyService.cleanup(cleanupPaths);
      } catch (cleanupError: unknown) {
        this.logger.error(
          `[${scanId}] Cleanup failed: ${getErrorMessage(cleanupError)}`,
        );
      }
      // Process next queued scan after cleanup frees disk space
      void this.drainQueue();
    }
  }
}
