import { ObjectType, Field, ID } from '@nestjs/graphql';
import { Vulnerability } from './vulnerability.model';

@ObjectType()
export class Scan {
  @Field(() => ID)
  id!: string;

  @Field()
  status!: string;

  @Field(() => [Vulnerability], { nullable: true })
  criticalVulnerabilities?: Vulnerability[];

  @Field({ nullable: true })
  error?: string;
}
