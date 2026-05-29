import { Injectable } from '@angular/core';
import Shepherd from 'shepherd.js';
import type { StepOptions, Tour } from 'shepherd.js';

const STORAGE_KEY = 'homepedia_onboarding_v1';

type TourButton = NonNullable<StepOptions['buttons']>[number];

@Injectable({ providedIn: 'root' })
export class OnboardingTourService {
  #tour?: Tour;

  shouldAutoStart(): boolean {
    if (typeof localStorage === 'undefined') return false;
    return localStorage.getItem(STORAGE_KEY) !== '1';
  }

  start(options?: { force?: boolean }): void {
    if (!options?.force && !this.shouldAutoStart()) return;

    this.#destroyActiveTour();

    const tour = new Shepherd.Tour({
      useModalOverlay: true,
      defaultStepOptions: {
        cancelIcon: { enabled: true },
        scrollTo: { behavior: 'smooth', block: 'center' },
        modalOverlayOpeningPadding: 8,
        modalOverlayOpeningRadius: 10,
      },
    });

    tour.on('complete', () => {
      this.#setTourActive(false);
      this.#markCompleted();
    });
    tour.on('cancel', () => this.#setTourActive(false));
    this.#tour = tour;

    for (const step of this.#buildSteps(tour)) {
      tour.addStep(step);
    }

    this.#setTourActive(true);
    tour.start();
  }

  #destroyActiveTour(): void {
    if (this.#tour?.isActive()) {
      this.#tour.cancel();
    }
    this.#setTourActive(false);
    this.#tour = undefined;
  }

  #setTourActive(active: boolean): void {
    document.body.classList.toggle('homepedia-tour-active', active);
  }

  #markCompleted(): void {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, '1');
    }
  }

  #buildSteps(tour: Tour): StepOptions[] {
    const back: TourButton = {
      text: 'Précédent',
      action: tour.back,
      secondary: true,
    };
    const next: TourButton = {
      text: 'Suivant',
      action: tour.next,
    };
    const finish: TourButton = {
      text: 'Terminer',
      action: tour.complete,
    };

    return [
      {
        id: 'welcome',
        title: 'Bienvenue sur Homepedia',
        text: 'Ce guide interactif vous présente les outils pour explorer les territoires français : carte, recherche et données territoriales.',
        buttons: [next],
      },
      {
        id: 'brand',
        title: 'Homepedia',
        text: 'Plateforme d’exploration cartographique : contours administratifs, indicateurs immobiliers et sociaux issus des données publiques.',
        attachTo: { element: '[data-tour="app-title"]', on: 'bottom' },
        buttons: [back, next],
      },
      {
        id: 'nav',
        title: 'Navigation',
        text: 'Accédez à la vue carte depuis le menu. D’autres sections pourront s’ajouter au fil du projet.',
        attachTo: { element: '[data-tour="nav-map"]', on: 'bottom' },
        buttons: [back, next],
      },
      {
        id: 'geocoder',
        title: 'Recherche d’adresse',
        text: 'Saisissez une adresse ou un lieu pour centrer la carte. Un marqueur bleu indique le résultat sélectionné.',
        attachTo: { element: '.map .mapboxgl-ctrl-geocoder', on: 'bottom' },
        buttons: [back, next],
      },
      {
        id: 'navigation',
        title: 'Zoom et orientation',
        text: 'Utilisez les boutons +/− pour zoomer, et la boussole pour pivoter la carte. Vous pouvez aussi zoomer à la molette ou au pinch.',
        attachTo: { element: '.map .mapboxgl-ctrl-top-left .mapboxgl-ctrl-group', on: 'right' },
        buttons: [back, next],
      },
      {
        id: 'geolocate',
        title: 'Ma position',
        text: 'Activez la géolocalisation pour vous situer sur la carte (autorisation du navigateur requise).',
        attachTo: { element: '.map .mapboxgl-ctrl-geolocate', on: 'right' },
        buttons: [back, next],
      },
      {
        id: 'map-layers',
        title: 'Niveaux de détail',
        text: [
          'Zoomez pour afficher progressivement les données :',
          '<ul class="shepherd-list">',
          '<li><strong>Vue France</strong> — régions</li>',
          '<li><strong>Zoom ~7+</strong> — départements</li>',
          '<li><strong>Zoom ~9+</strong> — communes</li>',
          '<li><strong>Zoom ~12+</strong> — sections cadastrales</li>',
          '<li><strong>Zoom ~15+</strong> — parcelles</li>',
          '</ul>',
          'Cliquez sur une commune ou une section pour « forer » dans le territoire.',
        ].join(''),
        attachTo: { element: '[data-tour="map-view"]', on: 'top' },
        buttons: [back, next],
      },
      {
        id: 'help',
        title: 'Relancer le guide',
        text: 'Vous pouvez rouvrir ce tour à tout moment via le bouton « Guide » dans l’en-tête.',
        attachTo: { element: '[data-tour="tour-help"]', on: 'bottom' },
        buttons: [back, finish],
      },
    ];
  }
}
