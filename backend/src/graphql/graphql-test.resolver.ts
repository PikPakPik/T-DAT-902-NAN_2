import { Query, Resolver } from '@nestjs/graphql';

@Resolver()
export class GraphqlTestResolver {
  @Query(() => String, {
    name: 'ping',
    description: 'Simple GraphQL smoke-test query',
  })
  ping(): string {
    return 'pong';
  }
}
