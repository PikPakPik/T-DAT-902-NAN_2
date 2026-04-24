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

## Connexions Airflow preconfigurees

Au demarrage, Airflow cree automatiquement ces connexions via des variables
d'environnement `AIRFLOW_CONN_*` (definies dans `compose.yaml`) :

- `postgres_default` -> PostGIS (`postgresql://...@postgis:5432/homepedia`)
- `mongo_default` -> MongoDB (`mongodb://...@mongodb:27017/homepedia?authSource=admin`)

Ces connexions utilisent les identifiants de `.env` :
`POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`,
`MONGO_USERNAME`, `MONGO_PASSWORD`, `MONGO_DATABASE`.

Vous pouvez les verifier avec :

```bash
docker compose exec airflow-scheduler airflow connections get postgres_default
docker compose exec airflow-scheduler airflow connections get mongo_default
```

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

- **0 DAG visible** : verifier que le fichier est dans `airflow/dags` et relancer `airflow-dag-processor`.
- **Erreur env manquante** (`KeyError`) : ajouter la variable dans `.env` ou dans les `environment` Airflow du compose.
- **Ancien service webserver qui plante** : supprimer les orphelins
  - `docker compose up -d --remove-orphans`

