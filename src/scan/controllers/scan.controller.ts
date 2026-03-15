import {
  Body,
  Controller,
  Get,
  HttpCode,
  Logger,
  NotFoundException,
  Param,
  Post,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ScanStore } from '../store/scan.store';
import { ScanWorker } from '../workers/scan.worker';
import { CreateScanDto } from '../types/create-scan.dto';
import type { ScanResponse } from '../types/scan.types';
import { ScanStatus } from '../types/scan.types';

@Controller('api/scan')
export class ScanController {
  private readonly logger = new Logger(ScanController.name);

  constructor(
    private readonly scanStore: ScanStore,
    private readonly scanWorker: ScanWorker,
  ) {}

  /**
   * Queues a new security scan for the given GitHub repository.
   * Returns immediately with a scanId and status of "Queued".
   */
  @Post()
  @HttpCode(202)
  create(@Body() dto: CreateScanDto): { scanId: string; status: string } {
    if (this.scanWorker.isQueueFull()) {
      throw new ServiceUnavailableException('Server is busy, try again later');
    }

    const record = this.scanStore.create(dto.repoUrl);

    // Defer worker start to next tick so the response returns status "Queued"
    // before processScan synchronously flips it to "Scanning".
    setImmediate(() => {
      this.scanWorker.processScan(record.id).catch((error: unknown) => {
        const msg = error instanceof Error ? error.message : String(error);
        this.logger.error(
          `Unhandled error in scan worker for ${record.id}: ${msg}`,
        );
      });
    });

    return { scanId: record.id, status: record.status };
  }

  /**
   * Returns the current status of a scan. Includes the list of critical
   * vulnerabilities only when the scan has finished.
   */
  @Get(':scanId')
  findOne(@Param('scanId') scanId: string): ScanResponse {
    const record = this.scanStore.get(scanId);
    if (!record) {
      throw new NotFoundException(`Scan ${scanId} not found`);
    }

    const response: ScanResponse = { status: record.status };

    if (record.status === ScanStatus.Finished) {
      response.criticalVulnerabilities = record.criticalVulnerabilities;
    }

    return response;
  }
}
