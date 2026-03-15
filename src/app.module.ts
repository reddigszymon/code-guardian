import { Module } from '@nestjs/common';
import { GraphQLModule } from '@nestjs/graphql';
import { ApolloDriver, ApolloDriverConfig } from '@nestjs/apollo';
import { ApolloServerPluginLandingPageGraphQLPlayground } from '@apollo/server-plugin-landing-page-graphql-playground';
import { join } from 'path';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ScanModule } from './scan/scan.module';

@Module({
  imports: [
    ScanModule,
    GraphQLModule.forRoot<ApolloDriverConfig>({
      driver: ApolloDriver,
      autoSchemaFile: join(process.cwd(), 'schema.gql'),
      playground: false,
      plugins: [ApolloServerPluginLandingPageGraphQLPlayground()],
      csrfPrevention: false,
    } as ApolloDriverConfig),
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
