import { TestBed } from '@angular/core/testing';
import { Apollo } from 'apollo-angular';
import { of } from 'rxjs';
import { AppComponent } from './app';

describe('AppComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [
        {
          provide: Apollo,
          useValue: {
            query: () => of({ data: { __typename: 'Query' } }),
          },
        },
      ],
    }).compileComponents();
  });

  it('should render Leaflet map container', async () => {
    const fixture = TestBed.createComponent(AppComponent);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('#leaflet-map')).not.toBeNull();
  });
});
