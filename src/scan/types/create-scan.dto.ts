import {
  IsNotEmpty,
  IsUrl,
  Matches,
  registerDecorator,
  ValidationOptions,
} from 'class-validator';

/**
 * Validates that the URL's parsed hostname is exactly github.com,
 * rejects userinfo (user:pass@), non-standard ports, and hostname tricks
 * like github.com.evil.com or github.com@evil.com.
 */
function IsStrictGitHubUrl(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isStrictGitHubUrl',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown): boolean {
          if (typeof value !== 'string') return false;
          try {
            const url = new URL(value);
            if (url.hostname !== 'github.com') return false;
            if (url.username || url.password) return false;
            if (url.port) return false;
            // Ensure at least /owner/repo in pathname
            const parts = url.pathname.split('/').filter(Boolean);
            return parts.length >= 2;
          } catch {
            return false;
          }
        },
        defaultMessage(): string {
          return 'repoUrl must be a valid GitHub repository URL (https://github.com/owner/repo)';
        },
      },
    });
  };
}

/** Validated request body for POST /api/scan. */
export class CreateScanDto {
  @IsNotEmpty({ message: 'repoUrl must not be empty' })
  @IsUrl(
    { protocols: ['http', 'https'], require_protocol: true },
    { message: 'repoUrl must be a valid URL' },
  )
  @Matches(/^https?:\/\/github\.com\/.+\/.+/, {
    message: 'repoUrl must be a GitHub repository URL',
  })
  @IsStrictGitHubUrl()
  repoUrl!: string;
}
