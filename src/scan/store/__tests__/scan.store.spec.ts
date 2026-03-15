import { Test, TestingModule } from '@nestjs/testing';
import { ScanStore, MAX_SCAN_RECORDS_TOKEN } from '../scan.store';
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
    let smallStore: ScanStore;

    beforeEach(async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          ScanStore,
          { provide: MAX_SCAN_RECORDS_TOKEN, useValue: 3 },
        ],
      }).compile();

      smallStore = module.get<ScanStore>(ScanStore);
    });

    it('evicts oldest finished/failed records when at capacity', () => {
      const r1 = smallStore.create('https://github.com/test/repo1');
      const r2 = smallStore.create('https://github.com/test/repo2');

      // Mark both as finished so they're eligible for eviction
      smallStore.updateStatus(r1.id, ScanStatus.Finished);
      smallStore.updateStatus(r2.id, ScanStatus.Failed);

      // r3 fills the store to capacity (3)
      const r3 = smallStore.create('https://github.com/test/repo3');

      // All 3 still present (at capacity, not over)
      expect(smallStore.get(r1.id)).toBeDefined();
      expect(smallStore.get(r2.id)).toBeDefined();
      expect(smallStore.get(r3.id)).toBeDefined();

      // r4 triggers eviction — r1 (oldest Finished) should be evicted
      const r4 = smallStore.create('https://github.com/test/repo4');

      expect(smallStore.get(r1.id)).toBeUndefined();
      expect(smallStore.get(r2.id)).toBeDefined();
      expect(smallStore.get(r3.id)).toBeDefined();
      expect(smallStore.get(r4.id)).toBeDefined();
    });

    it('preserves queued/scanning records during eviction', () => {
      const r1 = smallStore.create('https://github.com/test/repo1');
      const r2 = smallStore.create('https://github.com/test/repo2');
      const r3 = smallStore.create('https://github.com/test/repo3');

      // r1 is Scanning (active), r2 is Finished (evictable), r3 is Queued (active)
      smallStore.updateStatus(r1.id, ScanStatus.Scanning);
      smallStore.updateStatus(r2.id, ScanStatus.Finished);

      // r4 triggers eviction — r2 (Finished) should be evicted, not r1 or r3
      const r4 = smallStore.create('https://github.com/test/repo4');

      expect(smallStore.get(r1.id)).toBeDefined();
      expect(smallStore.get(r2.id)).toBeUndefined();
      expect(smallStore.get(r3.id)).toBeDefined();
      expect(smallStore.get(r4.id)).toBeDefined();
    });
  });
});
