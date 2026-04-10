import { TestBed } from '@angular/core/testing';
import { Apollo } from 'apollo-angular';
import { of } from 'rxjs';
import { App } from './app';
  
describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
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
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('#leaflet-map')).not.toBeNull();
  });
});
