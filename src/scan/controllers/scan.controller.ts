import {
  Body,
  Controller,
  Get,
  HttpCode,
  Logger,
  NotFoundException,
  Param,
  Post,
} from '@nestjs/common';
import { ScanStore } from '../store/scan.store';
import { ScanWorker } from '../workers/scan.worker';
import { CreateScanDto } from '../types/create-scan.dto';

@Controller('api/scan')
export class ScanController {
  private readonly logger = new Logger(ScanController.name);

  constructor(
    private readonly scanStore: ScanStore,
    private readonly scanWorker: ScanWorker,
  ) {}

  @Post()
  @HttpCode(202)
  create(@Body() dto: CreateScanDto) {
    const record = this.scanStore.create(dto.repoUrl);

    this.scanWorker.processScan(record.id).catch((error: unknown) => {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Unhandled error in scan worker for ${record.id}: ${msg}`,
      );
    });

    return { scanId: record.id, status: record.status };
  }

  @Get(':scanId')
  findOne(@Param('scanId') scanId: string) {
    const record = this.scanStore.get(scanId);
    if (!record) {
      throw new NotFoundException(`Scan ${scanId} not found`);
    }
    return record;
  }
}
