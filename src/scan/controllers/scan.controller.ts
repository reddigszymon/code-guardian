import {
  Body,
  Controller,
  Get,
  HttpCode,
  Logger,
  NotFoundException,
  Param,
  Post,
  BadRequestException,
} from '@nestjs/common';
import { ScanStore } from '../store/scan.store';
import { ScanWorker } from '../workers/scan.worker';

@Controller('api/scan')
export class ScanController {
  private readonly logger = new Logger(ScanController.name);

  constructor(
    private readonly scanStore: ScanStore,
    private readonly scanWorker: ScanWorker,
  ) {}

  @Post()
  @HttpCode(202)
  create(@Body() body: { repoUrl: string }) {
    const { repoUrl } = body;

    if (
      !repoUrl ||
      typeof repoUrl !== 'string' ||
      !/^https?:\/\/github\.com\/.+\/.+/.test(repoUrl)
    ) {
      throw new BadRequestException(
        'repoUrl must be a valid GitHub repository URL',
      );
    }

    const record = this.scanStore.create(repoUrl);

    this.scanWorker.processScan(record.id).catch((error) => {
      this.logger.error(
        `Unhandled error in scan worker for ${record.id}: ${error.message}`,
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
