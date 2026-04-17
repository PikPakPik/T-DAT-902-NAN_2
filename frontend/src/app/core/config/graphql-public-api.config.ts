import { inject } from '@angular/core';
import type { ApolloClient } from '@apollo/client/core';
import { InMemoryCache } from '@apollo/client/core';
import { HttpLink } from 'apollo-angular/http';
import { environment } from '../../../environments/environment';

export function publicGraphqlApolloOptionsFactory(): ApolloClient.Options {
  const httpLink = inject(HttpLink);

  return {
    link: httpLink.create({ uri: environment.graphql }),
    cache: new InMemoryCache(),
    defaultOptions: {
      watchQuery: {
        fetchPolicy: 'cache-first',
        errorPolicy: 'all',
      },
      query: {
        fetchPolicy: 'cache-first',
        errorPolicy: 'all',
      },
    },
  };
}

