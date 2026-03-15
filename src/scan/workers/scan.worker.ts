import { Injectable, Logger } from '@nestjs/common';
import * as os from 'os';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { ScanStore } from '../store/scan.store';
import { TrivyService } from '../services/trivy.service';
import { ScanStatus, getErrorMessage } from '../types/scan.types';
import { extractCriticalVulnerabilities } from '../streams/vulnerability-filter.stream';

@Injectable()
export class ScanWorker {
  private readonly logger = new Logger(ScanWorker.name);

  constructor(
    private readonly scanStore: ScanStore,
    private readonly trivyService: TrivyService,
  ) {}

  async processScan(scanId: string): Promise<void> {
    const record = this.scanStore.get(scanId);
    if (!record) {
      this.logger.error(`Scan record ${scanId} not found`);
      return;
    }

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

      const criticals = await extractCriticalVulnerabilities(outputPath);
      this.logger.log(
        `[${scanId}] Found ${criticals.length} critical vulnerabilities`,
      );

      this.scanStore.updateStatus(scanId, ScanStatus.Finished, {
        criticalVulnerabilities: criticals,
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
    }
  }
}
