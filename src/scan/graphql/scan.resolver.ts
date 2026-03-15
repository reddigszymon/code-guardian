import { Resolver, Query, Mutation, Args, ID } from '@nestjs/graphql';
import { Logger } from '@nestjs/common';
import { Scan } from './scan.model';
import { ScanStore } from '../store/scan.store';
import { ScanWorker } from '../workers/scan.worker';
import { ScanStatus, getErrorMessage } from '../types/scan.types';
import { validateGitHubUrl } from '../utils/validate-github-url';

@Resolver(() => Scan)
export class ScanResolver {
  private readonly logger = new Logger(ScanResolver.name);

  constructor(
    private readonly scanStore: ScanStore,
    private readonly scanWorker: ScanWorker,
  ) {}

  @Mutation(() => Scan)
  startScan(@Args('repoUrl') repoUrl: string): Scan {
    validateGitHubUrl(repoUrl);

    if (this.scanWorker.isQueueFull()) {
      throw new Error('Server is busy, try again later');
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
      criticalVulnerabilities: undefined,
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
      criticalVulnerabilities:
        record.status === ScanStatus.Finished
          ? record.criticalVulnerabilities
          : undefined,
      error: record.status === ScanStatus.Failed ? record.error : undefined,
    };
  }
}
