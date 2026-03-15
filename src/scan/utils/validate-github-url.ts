import { BadRequestException } from '@nestjs/common';

const INVALID_URL_MESSAGE =
  'repoUrl must be a valid GitHub repository URL (https://github.com/owner/repo)';

/**
 * Validates that a URL is strictly a public GitHub repository URL.
 * Rejects userinfo (user:pass@), non-standard ports, hostname tricks
 * (github.com.evil.com), and URLs without at least /owner/repo.
 *
 * @throws BadRequestException if the URL is invalid.
 */
export function validateGitHubUrl(raw: string): void {
  if (!raw || raw.trim().length === 0) {
    throw new BadRequestException('repoUrl must not be empty');
  }

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new BadRequestException(INVALID_URL_MESSAGE);
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new BadRequestException(INVALID_URL_MESSAGE);
  }
  if (url.hostname !== 'github.com') {
    throw new BadRequestException(INVALID_URL_MESSAGE);
  }
  if (url.username || url.password) {
    throw new BadRequestException(INVALID_URL_MESSAGE);
  }
  if (url.port) {
    throw new BadRequestException(INVALID_URL_MESSAGE);
  }

  const parts = url.pathname.split('/').filter(Boolean);
  if (parts.length < 2) {
    throw new BadRequestException(INVALID_URL_MESSAGE);
  }
}

/**
 * Pure boolean check used by the class-validator decorator.
 * Same logic as validateGitHubUrl but returns true/false instead of throwing.
 */
export function isStrictGitHubUrl(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  try {
    validateGitHubUrl(value);
    return true;
  } catch {
    return false;
  }
}
