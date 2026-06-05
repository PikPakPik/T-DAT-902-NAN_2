import { GraphqlTestResolver } from './graphql-test.resolver';

describe('GraphqlTestResolver', () => {
  it('ping returns pong', () => {
    const resolver = new GraphqlTestResolver();

    expect(resolver.ping()).toBe('pong');
  });
});
