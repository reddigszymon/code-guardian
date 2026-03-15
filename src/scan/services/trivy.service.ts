import { Injectable, Logger } from '@nestjs/common';
import { execFile } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { promisify } from 'util';
import { v4 as uuidv4 } from 'uuid';
import simpleGit from 'simple-git';

const execFileAsync = promisify(execFile);

@Injectable()
export class TrivyService {
  private readonly logger = new Logger(TrivyService.name);

  async cloneRepo(repoUrl: string): Promise<string> {
    const cloneDir = path.join(os.tmpdir(), `code-guardian-${uuidv4()}`);
    this.logger.log(`Cloning ${repoUrl} into ${cloneDir}`);
    const git = simpleGit();
    await git.clone(repoUrl, cloneDir, ['--depth', '1']);
    this.logger.log(`Clone complete: ${cloneDir}`);
    return cloneDir;
  }

  async runScan(repoDir: string, outputPath: string): Promise<void> {
    this.logger.log(`Running Trivy scan on ${repoDir}`);
    const trivyBin = process.env.TRIVY_BIN || 'trivy';
    try {
      await execFileAsync(
        trivyBin,
        ['fs', '--format', 'json', '--output', outputPath, repoDir],
        { timeout: 5 * 60 * 1000 },
      );
    } catch (error: any) {
      // Trivy exits with code 0 on success, but some versions exit with
      // non-zero when vulnerabilities are found. If the output file was
      // created, treat it as success.
      if (
        error.code !== undefined &&
        fs.existsSync(outputPath) &&
        fs.statSync(outputPath).size > 0
      ) {
        this.logger.warn(
          `Trivy exited with code ${error.code}, but output file exists — treating as success`,
        );
        return;
      }
      throw new Error(
        `Trivy scan failed: ${error.stderr || error.message}`,
      );
    }
    this.logger.log(`Trivy scan complete, output: ${outputPath}`);
  }

  async cleanup(paths: string[]): Promise<void> {
    for (const p of paths) {
      try {
        await fs.promises.rm(p, { recursive: true, force: true });
        this.logger.log(`Cleaned up: ${p}`);
      } catch (error: any) {
        this.logger.warn(`Failed to clean up ${p}: ${error.message}`);
      }
    }
  }
}
