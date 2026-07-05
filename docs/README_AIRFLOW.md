# Airflow - Guide projet

Ce projet utilise Airflow pour orchestrer des jobs batch (ETL, checks, synchronisation), en plus du backend/frontend.

## Architecture

La stack Airflow tourne via `docker compose` avec ces services :

- `airflow-apiserver` : UI/API Airflow sur `http://localhost:8080`
- `airflow-scheduler` : planification des DAGs
- `airflow-dag-processor` : parsing des fichiers DAG
- `airflow-worker` : execution des taches Celery
- `airflow-triggerer` : support des taches deferrables
- `airflow-init` : init DB + user admin
- `airflow-postgres` : base métadonnées Airflow
- `airflow-redis` : broker Celery

**Connexion UI / API** : connectez-vous avec `_AIRFLOW_WWW_USER_USERNAME` et `_AIRFLOW_WWW_USER_PASSWORD` definis dans `.env`. Le service `airflow-init` cree ce compte administrateur (FAB) au premier demarrage (`_AIRFLOW_WWW_USER_CREATE`). Ces variables sont obligatoires avant le premier `docker compose up` (voir `compose.yaml`, service `airflow-init`).

Les dossiers montes dans les containers :

- `./airflow/dags` -> `/opt/airflow/dags`
- `./airflow/logs` -> `/opt/airflow/logs`
- `./airflow/config` -> `/opt/airflow/config`
- `./airflow/plugins` -> `/opt/airflow/plugins`

## Déclenchement des DAGs

Les DAGs métier Homepedia sont configurés en **manuel uniquement**
(`schedule=None`) et avec `is_paused_upon_creation=True`.

Objectif : démarrer Airflow ne doit jamais lancer automatiquement un
téléchargement, un chargement distant ou le pipeline avis/NLP. Pour exécuter un
DAG, il faut le déclencher explicitement depuis l'UI Airflow ou avec :

```bash
docker compose exec airflow-scheduler airflow dags trigger <dag_id>
```

Le pipeline `pipeline_avis_nlp` est concerné aussi, car il réécrit les avis dans
MongoDB pendant le scraping.

## Connexions Airflow preconfigurees

Au demarrage, Airflow cree automatiquement ces connexions via des variables
d'environnement `AIRFLOW_CONN_*` (definies dans `compose.yaml`, host/port
configurables via `POSTGIS_HOST` / `POSTGIS_PORT` et `MONGODB_HOST` /
`MONGODB_PORT` dans `.env`) :

- `postgres_default` -> PostGIS (`postgresql://...@<POSTGIS_HOST>:<POSTGIS_PORT>/homepedia`)
- `mongo_default` -> MongoDB (`mongodb://...@<MONGODB_HOST>:<MONGODB_PORT>/homepedia?authSource=admin`)

Ces connexions utilisent les identifiants de `.env` :
`POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`,
`MONGO_USERNAME`, `MONGO_PASSWORD`, `MONGO_DATABASE`.

Vous pouvez les verifier avec :

```bash
docker compose exec airflow-scheduler airflow connections get postgres_default
docker compose exec airflow-scheduler airflow connections get mongo_default
```

## DAG cadastre

Fichier : `airflow/dags/ingest_cadastre_dag.py`

DAG `download_cadastre` (après `download_contours_administratifs`) :

1. (Optionnel) Télécharge les GeoJSON nationaux (référence)
2. Télécharge `sections` + `parcelles` **une tâche Airflow par département** (4 en parallèle max) — visible dans l’UI, reprise si fichier déjà présent
3. Charge `sections` puis `plots` (parcelles) dans PostGIS via `load_cadastre_department[XX]` (**3 départements en parallèle max**)

### Pipeline de chargement (`load_cadastre.py`)

Chaque département suit un pipeline `COPY` → staging → upsert ensembliste :

1. **Lecture streaming** du `*.json.gz` avec `ijson` (jamais le fichier entier en RAM).
2. **`COPY`** ligne par ligne vers une table **TEMP** PostgreSQL (`ON COMMIT DROP`). Le gros volume atterrit dans le stockage temporaire de PostGIS, **pas dans la mémoire du worker Airflow** → empreinte mémoire worker quasi constante.
3. Un seul **`INSERT ... SELECT ... ON CONFLICT`** : PostGIS parse toutes les géométries en une passe et résout `city`/`section` par **jointure SQL** (plus aucun dictionnaire Python en mémoire). Les parcelles se rattachent aux sections déjà présentes en base → un département peut être rejoué seul.

La session de chargement est tunée pour le bulk (variables d'env optionnelles) :

- `CADASTRE_SYNCHRONOUS_COMMIT` (défaut `off`) : supprime les fsync par commit (ETL idempotent, aucun risque fonctionnel).
- `CADASTRE_WORK_MEM` (défaut `64MB`), `CADASTRE_MAINTENANCE_WORK_MEM` (défaut `256MB`) : mémoire de tri/maintenance par session.

Si une tâche échoue avec **OOM (signal -9)** : c'est désormais rare côté worker (le volume est côté PostGIS). Vérifier plutôt la RAM du conteneur `postgis` ; au besoin baisser le parallélisme (`max_active_tis_per_dag=1` sur `load_cadastre_department`) ou `CADASTRE_WORK_MEM`, et relancer seulement les départements en échec.

**Durée chargement** : ~1–5 min / petit département, ~10–30 min pour les gros (14, 75, 13…). France entière (~109 dept) : **plusieurs heures**.

Les parcelles ne sont pas publiées au format « France entière » : l’ingestion passe par un fichier par département. Le téléchargement complet peut prendre **plusieurs heures** : ce n’est pas un blocage si les logs affichent `Downloading …` ou `Already present`.

## DAG exemple inclus

Fichier : `airflow/dags/homepedia_stack_smoke_dag.py`

DAG `homepedia_stack_smoke` :

- check `BACKEND_HEALTH_URL`
- check TCP vers PostGIS
- check TCP vers MongoDB

## Commandes utiles

Lister les DAGs :

```bash
docker compose exec airflow-scheduler airflow dags list
```

Voir les erreurs de chargement :

```bash
docker compose exec airflow-scheduler airflow dags list-import-errors
```

Relancer le parser de DAGs :

```bash
docker compose restart airflow-dag-processor
```

## Dépannage rapide

- **`No such file or directory: '...part' -> '...json.gz'`** (téléchargement cadastre) : échec réseau ou disque plein pendant le download ; le helper `download_utils` nettoie et valide le `.part`. Vérifier l'espace disque (`docker system df`) et relancer la tâche. Les fichiers déjà présents dans `airflow/data/cadastre/` sont ignorés (reprise possible).
- **`could not translate host name "postgis"`** : le worker Airflow ne voit pas la base Homepedia. Demarrer PostGIS et relancer les workers :
  ```bash
  docker compose up -d postgis
  docker compose restart airflow-worker airflow-scheduler
  ```
  Les taches `load_*_to_postgres` utilisent la connexion `postgres_default` (`AIRFLOW_CONN_POSTGRES_DEFAULT` → service `postgis`). Le service `postgis` doit tourner dans le meme `docker compose` que Airflow.
- **0 DAG visible** : verifier que le fichier est dans `airflow/dags` et relancer `airflow-dag-processor`.
- **Erreur env manquante** (`KeyError`) : ajouter la variable dans `.env` ou dans les `environment` Airflow du compose.
- **Ancien service webserver qui plante** : supprimer les orphelins
  - `docker compose up -d --remove-orphans`
