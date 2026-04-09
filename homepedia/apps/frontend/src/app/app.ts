import { Component, OnInit, inject } from '@angular/core';
import { Apollo } from 'apollo-angular';
import { gql } from '@apollo/client/core';
import { RouterModule } from '@angular/router';
import { NxWelcome } from './nx-welcome';

@Component({
  imports: [NxWelcome, RouterModule],
  selector: 'app-root',
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App implements OnInit {
  private readonly apollo = inject(Apollo);

  protected title = 'frontend';
  protected apolloStatus = 'Idle';
  protected apolloResult = '';

  ngOnInit(): void {
    this.apolloStatus = 'Loading...';

    this.apollo
      .query<{ __typename: string }>({
        query: gql`
          query ApolloConnectionTest {
            __typename
          }
        `,
        fetchPolicy: 'network-only',
      })
      .subscribe({
        next: ({ data }) => {
          this.apolloStatus = 'Connected';
          this.apolloResult = data?.__typename ?? 'No data';
        },
        error: (error) => {
          this.apolloStatus = 'Error';
          this.apolloResult = error.message;
        },
      });
  }
}
