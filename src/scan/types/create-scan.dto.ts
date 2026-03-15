import { IsNotEmpty, IsUrl, Matches } from 'class-validator';

export class CreateScanDto {
  @IsNotEmpty({ message: 'repoUrl must not be empty' })
  @IsUrl(
    { protocols: ['http', 'https'], require_protocol: true },
    { message: 'repoUrl must be a valid URL' },
  )
  @Matches(/^https?:\/\/github\.com\/.+\/.+/, {
    message: 'repoUrl must be a GitHub repository URL',
  })
  repoUrl!: string;
}
