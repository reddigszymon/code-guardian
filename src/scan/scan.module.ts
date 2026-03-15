import { Module } from '@nestjs/common';
import { ScanController } from './controllers/scan.controller';
import { ScanStore } from './store/scan.store';
import { TrivyService } from './services/trivy.service';
import { ScanWorker } from './workers/scan.worker';

@Module({
  controllers: [ScanController],
  providers: [ScanStore, TrivyService, ScanWorker],
  exports: [ScanStore],
})
export class ScanModule {}
