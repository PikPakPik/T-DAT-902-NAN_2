import { Component, OnDestroy, OnInit, AfterViewInit, inject } from '@angular/core';
import { Apollo } from 'apollo-angular';
import { gql } from '@apollo/client/core';
import { RouterModule } from '@angular/router';
import { Map, map, tileLayer } from 'leaflet';

@Component({
  imports: [RouterModule],
  selector: 'app-root',
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App implements OnInit, AfterViewInit, OnDestroy {
  private readonly apollo = inject(Apollo);
  private leafletMap?: Map;

  protected title = 'frontend';
  protected apolloStatus = 'Idle';
  protected apolloResult = '';

  ngAfterViewInit(): void {
    const mapElement = document.getElementById('leaflet-map');
    if (!mapElement) return;

    // OSM public tiles are only published up to zoom 19; higher z returns invalid tiles.
    this.leafletMap = map(mapElement, { maxZoom: 20 }).setView(
      [47.2184, -1.5536],
      13,
    );

    tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 20,
      maxNativeZoom: 19,
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(this.leafletMap);
  }

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

  ngOnDestroy(): void {
    this.leafletMap?.remove();
  }
}
