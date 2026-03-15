import { Resolver, Query, Mutation, Args, ID } from '@nestjs/graphql';
import { Logger } from '@nestjs/common';
import { Scan } from './scan.model';
import { ScanStore } from '../store/scan.store';
import { ScanWorker } from '../workers/scan.worker';

@Resolver(() => Scan)
export class ScanResolver {
  private readonly logger = new Logger(ScanResolver.name);

  constructor(
    private readonly scanStore: ScanStore,
    private readonly scanWorker: ScanWorker,
  ) {}

  @Mutation(() => Scan)
  startScan(@Args('repoUrl') repoUrl: string): Scan {
    const record = this.scanStore.create(repoUrl);

    setImmediate(() => {
      this.scanWorker.processScan(record.id).catch((error: unknown) => {
        const msg = error instanceof Error ? error.message : String(error);
        this.logger.error(
          `Unhandled error in scan worker for ${record.id}: ${msg}`,
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
