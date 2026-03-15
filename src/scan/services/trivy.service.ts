import { Injectable, Logger } from '@nestjs/common';
import { execFile } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { promisify } from 'util';
import { v4 as uuidv4 } from 'uuid';
import simpleGit from 'simple-git';
import { getErrorMessage, isExecError } from '../types/scan.types';

const execFileAsync = promisify(execFile);

const SCAN_TIMEOUT_MS = parseInt(process.env.SCAN_TIMEOUT_MS || '300000', 10);
const TRIVY_MAX_BUFFER = 50 * 1024 * 1024; // 50 MB — Trivy stderr can be verbose

@Injectable()
export class TrivyService {
  private readonly logger = new Logger(TrivyService.name);

  /** Shallow-clones a repository into a temporary folder under os.tmpdir(). */
  async cloneRepo(repoUrl: string): Promise<string> {
    const cloneDir = path.join(os.tmpdir(), `code-guardian-${uuidv4()}`);
    this.logger.log(`Cloning ${repoUrl} into ${cloneDir}`);
    const git = simpleGit();

    try {
      await git.clone(repoUrl, cloneDir, ['--depth', '1']);
    } catch (error: unknown) {
      const msg = getErrorMessage(error);

      if (
        msg.includes('not found') ||
        msg.includes('does not exist') ||
        msg.includes('Invalid url')
      ) {
        throw new Error(
          `Repository not found: ${repoUrl} — check that the URL is correct and the repository exists`,
        );
      }

      if (
        msg.includes('Authentication failed') ||
        msg.includes('could not read Username') ||
        msg.includes('terminal prompts disabled')
      ) {
        throw new Error(
          `Authentication required for ${repoUrl} — only public repositories are supported`,
        );
      }

      if (
        msg.includes('Could not resolve host') ||
        msg.includes('unable to access') ||
        msg.includes('Failed to connect')
      ) {
        throw new Error(
          `Network error cloning ${repoUrl} — check connectivity and try again`,
        );
      }

      if (msg.includes('No space left on device') || msg.includes('ENOSPC')) {
        throw new Error(
          `Disk full while cloning ${repoUrl} — free up disk space and try again`,
        );
      }

      throw new Error(`Failed to clone repository ${repoUrl}: ${msg}`);
    }

    this.logger.log(`Clone complete: ${cloneDir}`);
    return cloneDir;
  }

  /** Runs Trivy filesystem scan and writes JSON results to outputPath. */
  async runScan(repoDir: string, outputPath: string): Promise<void> {
    this.logger.log(`Running Trivy scan on ${repoDir}`);
    const trivyBin = process.env.TRIVY_BIN || 'trivy';

    try {
      await execFileAsync(
        trivyBin,
        ['fs', '--format', 'json', '--output', outputPath, repoDir],
        { timeout: SCAN_TIMEOUT_MS, maxBuffer: TRIVY_MAX_BUFFER },
      );
    } catch (error: unknown) {
      if (!isExecError(error)) {
        throw new Error(`Trivy scan failed: ${String(error)}`);
      }

      // ENOENT means the trivy binary was not found
      if (error.code === 'ENOENT') {
        throw new Error(
          `Trivy is not installed or not found at "${trivyBin}" — install Trivy and ensure it is on PATH`,
        );
      }

      // Node kills the process on timeout and sets .killed = true
      if (error.killed) {
        throw new Error(
          `Trivy scan timed out after ${SCAN_TIMEOUT_MS / 1000}s for ${repoDir} — the repository may be too large`,
        );
      }

      // Disk full
      if (
        error.stderr?.includes('ENOSPC') ||
        error.stderr?.includes('No space left on device') ||
        error.message?.includes('ENOSPC')
      ) {
        throw new Error(
          `Disk full during Trivy scan of ${repoDir} — free up disk space and try again`,
        );
      }

      // Trivy exits with non-zero when vulnerabilities are found.
      // If the output file was created with content, treat as success.
      if (
        error.code !== undefined &&
        fs.existsSync(outputPath) &&
        fs.statSync(outputPath).size > 0
      ) {
        this.logger.warn(
          `Trivy exited with code ${String(error.code)}, but output file exists — treating as success`,
        );
        return;
      }

      throw new Error(`Trivy scan failed: ${error.stderr || error.message}`);
    }

    this.logger.log(`Trivy scan complete, output: ${outputPath}`);
  }

  /** Removes temporary files/directories. Logs warnings on failure but never throws. */
  async cleanup(paths: string[]): Promise<void> {
    for (const p of paths) {
      try {
        await fs.promises.rm(p, { recursive: true, force: true });
        this.logger.log(`Cleaned up: ${p}`);
      } catch (error: unknown) {
        this.logger.warn(`Failed to clean up ${p}: ${getErrorMessage(error)}`);
      }
    }
  }
}
