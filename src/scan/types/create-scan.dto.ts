import {
  IsNotEmpty,
  IsUrl,
  Matches,
  registerDecorator,
  ValidationOptions,
} from 'class-validator';
import { isStrictGitHubUrl } from '../utils/validate-github-url';

/**
 * class-validator decorator that delegates to the shared isStrictGitHubUrl check.
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
          return isStrictGitHubUrl(value);
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
