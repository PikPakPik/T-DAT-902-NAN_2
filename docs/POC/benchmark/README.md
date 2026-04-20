# Frontend Map Benchmark (Next / Nuxt / Angular / Streamlit)

POC de benchmark frontend pour un cas Big Data cartographique France.

Objectif: comparer la performance de rendu et d'interaction entre 4 frontends sur un meme scenario metier:

- dezoome: affichage des departements
- zoom intermediaire: affichage des communes
- zoom plus fin: affichage des sections cadastrales
- zoom fort: affichage des parcelles + batiments cadastre

## Ce qui est teste

### Frontends

- Next.js (React)
- Nuxt (Vue)
- Angular
- Streamlit (PyDeck)

### Donnees et sources

- Contours administratifs:
  - `departements-100m.geojson`
  - `communes-100m.geojson`
  - source: https://adresse.data.gouv.fr/data/contours-administratifs/2024/geojson/
- Cadastre national vector tiles (tous departements):
  - TileJSON: `https://openmaptiles.geo.data.gouv.fr/data/cadastre.json`
  - tiles PBF: `https://openmaptiles.data.gouv.fr/data/cadastre/{z}/{x}/{y}.pbf`

### Scenario cartographique (LOD)

Sur les apps MapLibre (Next/Nuxt/Angular):

- `z < 7`: couches departements
- `7 <= z < 11.5`: couches communes
- `11 <= z < 14.5`: couches sections
- `13 <= z < 16.5`: couches parcelles
- `z >= 14`: couches batiments

## Metriques mesurees

Le script de benchmark collecte:

- `mapLoadedMs`: temps jusqu'au chargement de la carte
- `sourceLoadedMs`: temps jusqu'au chargement source principal
- `firstIdleMs`: temps jusqu'au premier idle de la carte
- `interactionMs`: temps d'une interaction standard (`easeTo` + `idle`)
- `usedJSHeapSize`: memoire JS estimee (quand disponible)

Note: pour Streamlit, `firstIdleMs` et `interactionMs` ne sont pas strictement comparables aux apps MapLibre.

## Setup

```bash
cd POC/benchmark
npm install
npx playwright install chromium
npm run setup:python
```

## Lancer une app manuellement

```bash
npm run dev:next
npm run dev:nuxt
npm run dev:angular
npm run dev:streamlit
```

URLs par defaut:

- Next: `http://127.0.0.1:3001`
- Nuxt: `http://127.0.0.1:3002`
- Angular: `http://127.0.0.1:3003`
- Streamlit: `http://127.0.0.1:3004`

Mode vector cadastre national:

- ajouter `?source=vector` a l'URL (exemple `http://127.0.0.1:3001/?source=vector`)

## Lancer le benchmark compare

```bash
npm run benchmark
```

Configurer le nombre de runs automatiques (pour p50/p95):

```bash
BENCH_REPEAT=10 npm run benchmark
```

Le runner:

1. demarre chaque app localement
2. execute le meme scenario de mesure sur plusieurs trajectoires de zoom:
   - `to_communes`
   - `to_sections`
   - `to_batiments`
   - `back_france`
3. arrete l'app
4. calcule p50/p95 par metrique
5. affiche p50/p95 par trajectoire
6. ecrit un fichier JSON brut dans `results/latest-*.json`

## Faire 3 runs (moyenne + variance)

```bash
mkdir -p results
for i in 1 2 3; do npm run benchmark > "results/run${i}.log" 2>&1; done
```

Puis parser les logs pour calculer moyennes/ecarts-types.

## Resultats (exemple recent)

Jeu de reference: mode vector (`?source=vector`), scenario multi-zoom, `BENCH_REPEAT=2`.

| Framework | mapLoaded p50/p95 (ms) | sourceLoaded p50/p95 (ms) | firstIdle p50/p95 (ms) | interaction p50/p95 (ms) | heap p50 (bytes) |
|---|---:|---:|---:|---:|---:|
| Next | 1657.3 / 2569.5 | 491.5 / 806.1 | 4692.1 / 5689.2 | 1971.0 / 3050.6 | 162000000 |
| Nuxt | 551.8 / 605.8 | 150.6 / 179.0 | 2360.1 / 2385.3 | 1755.8 / 2055.8 | 167000000 |
| Angular | 543.4 / 562.8 | 131.9 / 133.2 | 2441.1 / 2461.4 | 1876.6 / 2089.5 | 157000000 |
| Streamlit | 961.0 / 1150.0 | 959.0 / 1148.9 | n/a | n/a | 68000000 |

Trajectoires de zoom (p50/p95, ms) - apps MapLibre:

- Next:
  - `to_communes`: 3023.8 / 3104.3
  - `to_sections`: 1723.1 / 1744.2
  - `to_batiments`: 2296.2 / 2386.8
  - `back_france`: 1728.4 / 1740.7
- Nuxt:
  - `to_communes`: 1799.6 / 1828.1
  - `to_sections`: 1631.9 / 1656.8
  - `to_batiments`: 2050.5 / 2066.4
  - `back_france`: 1710.3 / 1740.4
- Angular:
  - `to_communes`: 1891.0 / 1892.9
  - `to_sections`: 1711.2 / 1848.9
  - `to_batiments`: 2073.9 / 2120.6
  - `back_france`: 1670.8 / 1684.3

## Conclusion

1. Sur ce POC, `Angular` et `Nuxt` sont les plus rapides et les plus stables en rendu cartographique multi-echelle.
2. `Next` fonctionne correctement mais reste plus lent sur les indicateurs globaux (`mapLoaded`, `firstIdle`, `interaction`).
3. `Streamlit` est utilisable pour la visualisation, mais les metriques d'interaction ne sont pas directement comparables a MapLibre SPA.
4. Pour un usage metier interactif (clic parcelle/batiment + mutations DVF), le couple le plus robuste ici est `MapLibre + Angular` ou `MapLibre + Nuxt`.

## Limites du POC

- Les perfs peuvent varier selon machine, GPU, charge reseau, cache navigateur.
- Un seul protocole d'interaction est mesure par defaut.
- Streamlit n'a pas exactement le meme modele runtime que les frameworks JS SPA.
