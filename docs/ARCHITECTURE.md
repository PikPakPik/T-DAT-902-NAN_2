# Homepedia — Architecture globale

Plateforme d’exploration cartographique des territoires français : données publiques géoréférencées, indicateurs immobiliers et sociaux, avis utilisateurs.

## Diagramme d’architecture (vue conteneurs)

```mermaid
flowchart TB
  subgraph users["Utilisateurs"]
    Browser["Navigateur web"]
  end

  subgraph external["Sources open data"]
    AdresseDG["adresse.data.gouv.fr<br/>Contours administratifs"]
    DataGouv["data.gouv.fr / files.data.gouv.fr<br/>DVF, loyers, délinquance, RNIC…"]
    CadastreDG["cadastre.data.gouv.fr<br/>Cadastre GeoJSON"]
    Insee["insee.fr<br/>Recensement, Filosofi"]
    Ademe["data.ademe.fr<br/>DPE"]
    MapboxAPI["api.mapbox.com<br/>Tuiles & styles"]
  end

  subgraph docker["Docker Compose — stack Homepedia"]
    Frontend["Frontend Angular 21<br/>:4200 — carte Mapbox GL"]
    Backend["Backend NestJS<br/>:3000 — REST /api + GraphQL /graphql"]
    PostGIS["PostGIS 18<br/>:5432 — données géo & analytiques"]
    MongoDB["MongoDB 8<br/>:27017 — avis & agrégats communautaires"]

    subgraph airflow["Orchestration Airflow 3.2 (Celery)"]
      Scheduler["Scheduler"]
      Worker["Worker Celery"]
      DagProc["DAG Processor"]
      AirflowUI["API Server / UI :8080"]
      AirflowPG["PostgreSQL métadonnées"]
      Redis["Redis broker"]
    end

    AirflowData[("Staging<br/>./airflow/data")]

    subgraph spark["Apache Spark — local (Docker)"]
      SparkMaster["Spark master"]
      SparkWorker["Spark worker(s)"]
      SparkJobs["Jobs PySpark<br/>spark-jobs/"]
    end
  end

  Browser -->|"HTTPS GraphQL + assets"| Frontend
  Frontend -->|"Apollo → /graphql"| Backend
  Frontend -->|"Tuiles vectorielles / raster"| MapboxAPI
  Backend -->|"TypeORM + requêtes spatiales ST_*"| PostGIS
  Backend -->|"Mongoose"| MongoDB

  Scheduler --> Worker
  Worker --> DagProc
  AirflowUI --> Scheduler
  Worker --> Redis
  Scheduler --> AirflowPG

  Worker -->|"download + load_contours (léger)"| AdresseDG
  Worker -->|"DAGs download"| DataGouv
  Worker --> CadastreDG
  Worker --> Insee
  Worker --> Ademe
  Worker -->|"load_contours uniquement"| PostGIS
  Worker --> AirflowData

  Worker -->|"spark-submit / opérateur"| SparkJobs
  SparkMaster --> SparkWorker
  SparkJobs --> SparkMaster
  AirflowData -->|"lecture staging"| SparkJobs
  SparkJobs -->|"JDBC → postgis:5432"| PostGIS
```

## Diagramme — modèle de données PostGIS

Le schéma ci-dessous représente l'état applicatif actuel, après migrations
PostGIS (`geom` au lieu des anciens champs `wkb`) et après séparation DVF entre
`mutations` et `mutation_locals`.

```mermaid
erDiagram
  regions {
    integer id PK
    varchar name
    varchar code
    geometry geom
  }

  departments {
    integer id PK
    varchar name
    varchar code
    geometry geom
    integer regionId FK
  }

  cities {
    integer id PK
    varchar name
    text names
    varchar code
    varchar siren
    varchar epci
    text zipCodes
    geometry geom
    integer departmentId FK
  }

  sections {
    integer id PK
    varchar prefixe
    varchar code
    varchar section_key
    geometry geom
    integer cityId FK
  }

  plots {
    integer id PK
    geometry geom
    varchar number
    varchar capacity
    integer sectionId FK
  }

  mutations {
    integer id PK
    varchar id_mutation
    date date_mutation
    smallint annee
    varchar nature_mutation
    numeric valeur_fonciere
    integer nb_lots
    numeric surface_habitable
    numeric prix_m2
    double longitude
    double latitude
  }

  mutation_locals {
    integer id PK
    varchar type_local
    numeric surface_reelle_bati
    integer nombre_pieces_principales
    numeric surface_terrain
    varchar id_parcelle
    integer mutationId FK
    integer plotId FK
  }

  dpes {
    integer id PK
    varchar dpe_id
    smallint annee
    varchar classe_energie
    varchar classe_ges
    numeric surface_habitable
    varchar type_batiment
    smallint annee_construction
    varchar code_insee
    double longitude
    double latitude
    integer plotId FK
  }

  rents {
    integer id PK
    smallint annee
    numeric loyer_median_apt
    numeric loyer_median_t1t2
    numeric loyer_median_t3plus
    numeric loyer_median_maison
    integer nb_observations
    numeric r2
    integer cityId FK
  }

  stats_cities {
    integer id PK
    smallint annee
    varchar type_local
    numeric prix_median_m2
    numeric prix_moyen_m2
    numeric surface_mediane
    integer nb_transactions
    numeric evolution_prix_pct
    integer cityId FK
  }

  stats_departments {
    integer id PK
    smallint annee
    varchar type_local
    numeric prix_median_m2
    numeric prix_moyen_m2
    numeric surface_mediane
    integer nb_transactions
    numeric evolution_prix_pct
    integer departmentId FK
  }

  stats_sections {
    integer id PK
    smallint annee
    varchar type_local
    numeric prix_median_m2
    numeric prix_moyen_m2
    numeric surface_mediane
    integer nb_transactions
    numeric evolution_prix_pct
    integer sectionId FK
  }

  populate_cities {
    integer id PK
    integer population
    smallint annee
    timestamp created_at
    integer cityId FK
  }

  income_cities {
    integer id PK
    smallint annee
    numeric mediane_salaire
    numeric decile1_salaire
    numeric decile9_salaire
    numeric taux_pauvrete
    integer nb_menages
    timestamp created_at
    integer cityId FK
  }

  crimes_cities {
    integer id PK
    smallint annee
    numeric taux_cambriolages
    numeric taux_vols_armes
    numeric taux_vols_sans_viol
    numeric taux_violences_phys
    timestamp created_at
    integer cityId FK
  }

  air_quality {
    integer id PK
    smallint annee
    smallint indice_atmo_median
    numeric pm25_median
    numeric pm10_median
    numeric no2_median
    numeric o3_median
    integer nb_jours_bon
    integer nb_jours_moyen
    integer nb_jours_mauvais
    integer cityId FK
  }

  transport_stops {
    integer id PK
    varchar stop_id
    varchar name
    varchar mode
    point longitude
    point latitude
    integer cityId FK
  }

  devices {
    integer id PK
    varchar nom
    varchar address
    varchar typequ
    varchar categorie
    varchar dom
    varchar sdom
    varchar libcom
    double longitude
    double latitude
    integer cityId FK
  }

  regions ||--o{ departments : has
  departments ||--o{ cities : has
  departments ||--o{ stats_departments : has
  cities ||--o{ sections : has
  cities ||--o{ rents : has
  cities ||--o{ stats_cities : has
  cities ||--o{ populate_cities : has
  cities ||--o{ income_cities : has
  cities ||--o{ crimes_cities : has
  cities ||--o{ air_quality : has
  cities ||--o{ transport_stops : has
  cities ||--o{ devices : has
  sections ||--o{ plots : has
  sections ||--o{ stats_sections : has
  plots ||--o{ mutation_locals : has
  plots ||--o{ dpes : has
  mutations ||--o{ mutation_locals : has
```

Côté MongoDB, les collections `cities` et `reviews` stockent les avis, les notes
agrégées, le sentiment NLP et les données de wordcloud.

---

## Description des composants

### Frontend (Angular)

| Élément | Rôle |
|--------|------|
| **Application** (`frontend/`) | SPA zoneless (Angular 21), routing, UI PrimeNG. |
| **Carte** (`features/map/`) | Facade Mapbox GL, overlays par niveau de zoom (régions → départements → communes → sections → parcelles). |
| **Services GraphQL** | `apollo-angular` interroge le backend via `/graphql` (proxy dev ou même origine en prod). |
| **Config runtime** | `public/env.js` injecte `MAPBOX_TOKEN` au démarrage Docker. |

**Responsabilité** : affichage interactif, requêtes géo-filtrées selon la bounding box visible, expérience utilisateur.

### Backend (NestJS)

| Élément | Rôle |
|--------|------|
| **API GraphQL** (`@nestjs/graphql` + Apollo) | Point d’entrée principal : `regions`, `departmentsInBounds`, `citiesInBounds`, `sectionsInBounds`, `sectionsByCity`, `plotsInBounds`, `plotsBySection`, `ping`. |
| **REST** (`/api`) | Health check (`/api/health`) pour orchestration et supervision. |
| **TypeORM → PostGIS** | Entités géographiques hiérarchiques et données analytiques (loyers, DVF agrégé, délinquance, DPE, recensement…). Requêtes spatiales (`ST_Intersects`, `ST_AsGeoJSON`). |
| **Mongoose → MongoDB** | Contenu collaboratif : avis (`reviews`), notes agrégées par commune (`cities`). |
| **Migrations** | Schéma PostGIS versionné (`backend/src/migrations/`). |

**Responsabilité** : agrégation, filtrage spatial, exposition typée au front, séparation données référentielles / UGC.

### PostGIS (PostgreSQL + extension spatiale)

- **Données** : géométries `MultiPolygon` SRID 4326, hiérarchie administrative, cadastre (sections, parcelles), transactions (mutations DVF), indicateurs communaux/départementaux.
- **Accès** : backend (runtime), Airflow (`load_contours`), Spark (chargement des jeux lourds via JDBC).
- **Persistance** : volume Docker `postgis_data`.

### MongoDB

- **Données** : documents flexibles pour avis et notations multi-critères (sécurité, éducation, etc.).
- **Justification** : schéma évolutif, écritures utilisateur sans migrations lourdes sur le modèle relationnel géo.

### Apache Airflow (orchestration & ingestion légère)

| Service Compose | Rôle |
|-----------------|------|
| `airflow-scheduler` | Planification des DAGs (`@monthly`, etc.). |
| `airflow-worker` | Téléchargements HTTP, chargement direct des contours, déclenchement/supervision des jobs Spark. |
| `airflow-dag-processor` | Parsing et synchronisation des DAGs. |
| `airflow-apiserver` | UI et API (:8080). |
| `airflow-triggerer` | Tâches deferrables. |
| `airflow-postgres` / `airflow-redis` | Métadonnées et file Celery (isolés de PostGIS applicatif). |

**Répartition des responsabilités ETL** :

| Couche | Technologie | Périmètre |
|--------|-------------|-----------|
| **Extract** | Airflow (Python) | Téléchargement des jeux open data vers `./airflow/data` (volume partagé avec Spark). |
| **Transform (léger)** | Airflow + `load_contours.py` | Contours administratifs : upsert direct PostGIS (volume modeste, pas de Spark). |
| **Transform (lourd)** | **Apache Spark local** (PySpark, cluster Docker) | DVF, cadastre, loyers, DPE, délinquance, INSEE, RNIC : nettoyage, typage, jointures, agrégations. |
| **Load** | Spark → JDBC PostgreSQL | Tables métier PostGIS (`sections`, `plots`, `mutations`, `rents`, `stats`, etc.). |

**DAGs d’ingestion** (`airflow/dags/`) :

| DAG | Source | Extract (Airflow) | Transform / Load |
|-----|--------|-------------------|------------------|
| `download_contours_administratifs` | adresse.data.gouv.fr | GeoJSON.gz | **Airflow** → PostGIS (`regions`, `departments`, `cities`) |
| `download_cadastre` | cadastre.data.gouv.fr | `./airflow/data/cadastre` | **Spark** → `sections`, `plots` |
| `download_dvf` | files.data.gouv.fr/geo-dvf | `./airflow/data/dvf` | **Spark** → `mutations`, `stats_*` |
| `download_carte_loyers` | API data.gouv.fr | `./airflow/data/carte_loyers` | **Spark** → `rents` |
| `download_delinquance_communale` | data.gouv.fr | staging | **Spark** → `crimes` |
| `download_ademe_dpe` | data.ademe.fr | staging | **Spark** → `dpes` |
| `download_filosofi` / `download_recensement_populations_legales` | insee.fr | staging | **Spark** → `income`, `populate` |
| `download_rnic` | data.gouv.fr | staging | chargement PostGIS |

**Plugins Airflow** : `airflow/plugins/` contient les helpers de téléchargement,
les loaders directs PostGIS et le déclenchement Spark.

**Volume partagé** : `./airflow/data` → `/opt/airflow/data` — zone de staging consommée par les jobs Spark.

Voir aussi [README_AIRFLOW.md](./README_AIRFLOW.md).

### Apache Spark (local, Docker)

- **Rôle** : pipeline batch pour les jeux volumineux ou multi-fichiers (CSV.gz DVF, cadastre national, séries temporelles INSEE).
- **Pourquoi Spark** : parallélisation, API DataFrame/SQL pour jointures à grande échelle, même stack reproductible sur la machine de chaque dev.
- **Déploiement** : cluster Spark **local** via `docker compose` (pas de Databricks ni cloud) — services `spark-master` / `spark-worker`, scripts PySpark dans `spark-jobs/`.
- **Intégration** : Airflow enchaîne *download* puis `spark-submit` (ou `DockerOperator`) ; jobs lisent `/opt/airflow/data`, écrivent sur `postgis:5432` (réseau Compose).
- **Mode dev minimal** : `local[*]` sur la machine hôte possible pour prototyper hors cluster, mais la cible projet reste **100 % locale dans Docker**.

### Sources externes (hors dépôt)

- **Mapbox** : fond de carte et tuiles (token `MAPBOX_TOKEN`).
- **Open data français** : jeux listés dans les DAGs ; hébergement projet [SharePoint TDAT902](https://epitechfr.sharepoint.com/sites/TDAT902).

### POC benchmark (`docs/POC/benchmark/`)

Hors stack production : comparaison Next / Nuxt / Angular / Streamlit sur rendu cartographique LOD. N’alimente pas directement le backend Homepedia.

---

## Flux de données end-to-end

### 1. Ingestion batch (offline)

```mermaid
sequenceDiagram
  participant Src as Open data (gouv, INSEE, ADEME)
  participant AF as Airflow
  participant Disk as Staging (airflow/data)
  participant SP as Spark local (Docker)
  participant PG as PostGIS
  participant MG as MongoDB

  AF->>Src: HTTP GET (GeoJSON, CSV, API)
  Src-->>AF: Fichiers bruts
  AF->>Disk: Persistance staging

  alt Contours administratifs (léger)
    AF->>PG: load_contours.py (upsert direct)
  else Autres jeux (DVF, cadastre, loyers…)
    AF->>SP: Déclencher job Spark
    SP->>Disk: Lire fichiers bruts
    SP->>SP: Transform (clean, join, aggregate)
    SP->>PG: Load JDBC (tables métier)
  end
```

**État actuel** : les contours et certains chargements directs sont pris en charge
par Airflow ; les jeux volumineux passent par Spark ou par des loaders bulk
dedies avant chargement PostGIS.

### 2. Requête utilisateur (online)

```mermaid
sequenceDiagram
  participant U as Utilisateur
  participant FE as Angular + Mapbox
  participant API as NestJS GraphQL
  participant PG as PostGIS
  participant MG as MongoDB

  U->>FE: Pan / zoom carte
  FE->>FE: Calcul bounding box (LOD)
  FE->>API: GraphQL query (ex. departmentsInBounds)
  API->>PG: SQL spatial ST_Intersects + agrégats
  PG-->>API: GeoJSON + métriques
  API-->>FE: Types GraphQL
  FE->>FE: Mise à jour sources/layers Mapbox
  FE-->>U: Carte + panneaux info

  opt Avis / notes communautaires
    FE->>API: Query/Mutation reviews
    API->>MG: Lecture / écriture documents
    MG-->>API: Résultat
    API-->>FE: Données UGC
  end
```

**Exemple concret** : `departmentsInBounds` exécute une enveloppe `ST_MakeEnvelope` sur `departments.geom` et joint les stats DVF agrégées (`stats_departments`) pour le prix médian au m².

### 3. Déploiement local

```bash
docker compose up --build
```

Ordre de démarrage : PostGIS + MongoDB → Backend (health) → Frontend ; stack Airflow après `airflow-init` ; Spark local partage les mêmes volumes et le même réseau Compose.

**Principe** : aucun service cloud (Databricks) — extract, transform et load tournent sur l’environnement local du projet.

---

## Justification des choix technologiques

| Choix | Alternatives envisagées | Pourquoi ce choix |
|-------|-------------------------|-------------------|
| **Angular** | React, Vue (benchmark POC) | Framework structuré, tooling entreprise, équipe/formation Epitech ; POC benchmark a validé Angular + Mapbox pour le LOD cartographique. |
| **NestJS** | Express pur, Fastify | Modules, DI, écosystème GraphQL/TypeORM/Mongoose cohérent ; typage TypeScript bout-en-bout avec le front. |
| **GraphQL** | REST uniquement | Requêtes géo-filtrées sur mesure (bounds, relations) sans sur-fetch ; contrat unique pour la carte multi-échelles. |
| **PostGIS** | Mongo géospatial seul, Elasticsearch geo | Jointures admin + stats + requêtes SQL spatiales matures ; modèle hiérarchique (région → parcelle) et indexes `GIST`. |
| **MongoDB** | Tables SQL pour avis | Schéma flexible pour critères de notation et commentaires ; charge d’écriture UGC découplée du référentiel géo. |
| **Mapbox GL** | Leaflet, MapLibre seul | Performances WebGL, écosystème tuiles, intégration éprouvée ; token géré côté client. |
| **Airflow 3 + Celery** | Cron, Dagster | Orchestration extract + chargements légers ; point d’entrée pour déclencher Spark. |
| **Apache Spark (local)** | Databricks, Pandas seul sur gros volumes | Transformations lourdes sans SaaS ; cluster Docker sur le même réseau que PostGIS et Airflow. |
| **Docker Compose** | K8s, cloud managé | Une commande pour front, back, BDD, Airflow et Spark ; pas de dépendance compte cloud. |
| **TypeORM + migrations** | Synchronize seul en prod | Schéma PostGIS versionné ; `synchronize` limité au dev. |
| **Python (DAGs Airflow)** | Node ETL | Téléchargements et `load_contours` ; pas de transformation lourde dans le worker Celery. |

---

## Évolutions possibles

1. **Tuiles vectorielles PostGIS** : endpoint MVT pour les parcelles afin de
   reduire le GeoJSON cote front.
2. **Observabilite Airflow** : rapports de volume par DAG et alertes sur les
   sources externes instables.
3. **Qualite des donnees** : jeux de controles automatises apres chargement
   (volumes, taux de rattachement parcelle, valeurs aberrantes).
4. **Production** : reverse proxy, variables secretes externalisees,
   `synchronize: false`, build frontend statique.

---

## Liens utiles

- [README racine](../README.md) — démarrage rapide
- [README Airflow](./README_AIRFLOW.md) — opérations DAG
- [POC benchmark carto](./POC/benchmark/README.md)
