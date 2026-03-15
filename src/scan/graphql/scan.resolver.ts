import { Resolver, Query, Mutation, Args, ID } from '@nestjs/graphql';
import { BadRequestException, Logger } from '@nestjs/common';
import { Scan } from './scan.model';
import { ScanStore } from '../store/scan.store';
import { ScanWorker } from '../workers/scan.worker';
import { getErrorMessage } from '../types/scan.types';

const GITHUB_URL_RE = /^https?:\/\/github\.com\/.+\/.+/;

@Resolver(() => Scan)
export class ScanResolver {
  private readonly logger = new Logger(ScanResolver.name);

  constructor(
    private readonly scanStore: ScanStore,
    private readonly scanWorker: ScanWorker,
  ) {}

  @Mutation(() => Scan)
  startScan(@Args('repoUrl') repoUrl: string): Scan {
    if (!repoUrl || repoUrl.trim().length === 0) {
      throw new BadRequestException('repoUrl must not be empty');
    }

    try {
      const url = new URL(repoUrl);
      if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        throw new BadRequestException('repoUrl must use http or https protocol');
      }
    } catch (error: unknown) {
      if (error instanceof BadRequestException) throw error;
      throw new BadRequestException('repoUrl must be a valid URL');
    }

    if (!GITHUB_URL_RE.test(repoUrl)) {
      throw new BadRequestException('repoUrl must be a GitHub repository URL');
    }

    if (this.scanWorker.isQueueFull()) {
      throw new BadRequestException('Server is busy, try again later');
    }

    const record = this.scanStore.create(repoUrl);

    setImmediate(() => {
      this.scanWorker.processScan(record.id).catch((error: unknown) => {
        this.logger.error(
          `Unhandled error in scan worker for ${record.id}: ${getErrorMessage(error)}`,
        );
      });
    });

    return {
      id: record.id,
      status: record.status,
      criticalVulnerabilities: [],
    };
  }

  @Query(() => Scan, { nullable: true })
  scan(@Args('id', { type: () => ID }) id: string): Scan | null {
    const record = this.scanStore.get(id);
    if (!record) {
      return null;
    }

    return {
      id: record.id,
      status: record.status,
      criticalVulnerabilities: record.criticalVulnerabilities,
    };
  }
}
