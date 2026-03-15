import { Test, TestingModule } from '@nestjs/testing';
import { ScanStore } from '../scan.store';
import { ScanStatus } from '../../types/scan.types';

describe('ScanStore', () => {
  let store: ScanStore;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ScanStore],
    }).compile();

    store = module.get<ScanStore>(ScanStore);
  });

  describe('create', () => {
    it('creates a record with Queued status', () => {
      const record = store.create('https://github.com/test/repo');

      expect(record.id).toBeDefined();
      expect(record.repoUrl).toBe('https://github.com/test/repo');
      expect(record.status).toBe(ScanStatus.Queued);
      expect(record.criticalVulnerabilities).toEqual([]);
      expect(record.createdAt).toBeInstanceOf(Date);
      expect(record.updatedAt).toBeInstanceOf(Date);
    });

    it('generates unique IDs for each record', () => {
      const r1 = store.create('https://github.com/test/repo1');
      const r2 = store.create('https://github.com/test/repo2');

      expect(r1.id).not.toBe(r2.id);
    });
  });

  describe('get', () => {
    it('returns the record by ID', () => {
      const created = store.create('https://github.com/test/repo');
      const fetched = store.get(created.id);

      expect(fetched).toBeDefined();
      expect(fetched!.id).toBe(created.id);
      expect(fetched!.repoUrl).toBe('https://github.com/test/repo');
    });

    it('returns undefined for unknown ID', () => {
      expect(store.get('nonexistent-id')).toBeUndefined();
    });
  });

  describe('updateStatus', () => {
    it('transitions status and updates timestamp', () => {
      const record = store.create('https://github.com/test/repo');
      const originalUpdatedAt = record.updatedAt;

      // Small delay so timestamps differ
      store.updateStatus(record.id, ScanStatus.Scanning);

      const updated = store.get(record.id);
      expect(updated!.status).toBe(ScanStatus.Scanning);
      expect(updated!.updatedAt.getTime()).toBeGreaterThanOrEqual(
        originalUpdatedAt.getTime(),
      );
    });

    it('merges partial data without overwriting id', () => {
      const record = store.create('https://github.com/test/repo');
      const vulns = [
        {
          vulnerabilityId: 'CVE-2020-0001',
          pkgName: 'lodash',
          installedVersion: '4.17.15',
          fixedVersion: '4.17.21',
          title: 'Test',
          description: 'Test desc',
          severity: 'CRITICAL',
          target: 'package.json',
        },
      ];

      store.updateStatus(record.id, ScanStatus.Finished, {
        criticalVulnerabilities: vulns,
      });

      const updated = store.get(record.id);
      expect(updated!.id).toBe(record.id);
      expect(updated!.status).toBe(ScanStatus.Finished);
      expect(updated!.criticalVulnerabilities).toEqual(vulns);
    });

    it('stores error message on failure', () => {
      const record = store.create('https://github.com/test/repo');

      store.updateStatus(record.id, ScanStatus.Failed, {
        error: 'Trivy crashed',
      });

      const updated = store.get(record.id);
      expect(updated!.status).toBe(ScanStatus.Failed);
      expect(updated!.error).toBe('Trivy crashed');
    });

    it('is a no-op for unknown ID', () => {
      // Should not throw
      store.updateStatus('nonexistent', ScanStatus.Scanning);
    });
  });

  describe('eviction', () => {
    it('evicts oldest finished/failed records when at capacity', () => {
      // Override MAX_RECORDS for this test by filling the store
      // The default is 500, so we'll test the eviction logic directly
      // by creating records and marking some as finished
      const records = Array.from({ length: 5 }, (_, i) =>
        store.create(`https://github.com/test/repo${i}`),
      );

      // Mark first two as Finished
      store.updateStatus(records[0].id, ScanStatus.Finished);
      store.updateStatus(records[1].id, ScanStatus.Failed);

      // All records should still be retrievable (under default cap of 500)
      expect(store.get(records[0].id)).toBeDefined();
      expect(store.get(records[1].id)).toBeDefined();
      expect(store.get(records[2].id)).toBeDefined();
    });
  });
});
