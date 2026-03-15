import {
  Body,
  Controller,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  BadRequestException,
} from '@nestjs/common';
import { ScanStore } from '../store/scan.store';

@Controller('api/scan')
export class ScanController {
  constructor(private readonly scanStore: ScanStore) {}

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

    // TODO: trigger scan worker asynchronously

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
