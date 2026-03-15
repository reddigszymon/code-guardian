                                                    import { Module } from '@nestjs/common';
import { ScanController } from './controllers/scan.controller';
import { ScanStore } from './store/scan.store';
import { TrivyService } from './services/trivy.service';
import { ScanWorker } from './workers/scan.worker';
import { ScanResolver } from './graphql/scan.resolver';

@Module({
  controllers: [ScanController],
  providers: [ScanStore, TrivyService, ScanWorker, ScanResolver],
  exports: [ScanStore, ScanWorker],
})
export class ScanModule {}
