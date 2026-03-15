import { Module } from '@nestjs/common';
import { ScanController } from './controllers/scan.controller';
import { ScanStore } from './store/scan.store';

@Module({
  controllers: [ScanController],
  providers: [ScanStore],
  exports: [ScanStore],
})
export class ScanModule {}
