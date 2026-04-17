import { Module } from '@nestjs/common';
import { GraphqlTestResolver } from './graphql-test.resolver';

@Module({
  providers: [GraphqlTestResolver],
})
export class AppGraphqlModule {}
