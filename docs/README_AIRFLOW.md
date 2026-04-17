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
- `airflow-postgres` : base metadonnees Airflow
- `airflow-redis` : broker Celery

Les dossiers montes dans les containers :

- `./airflow/dags` -> `/opt/airflow/dags`
- `./airflow/logs` -> `/opt/airflow/logs`
- `./airflow/config` -> `/opt/airflow/config`
- `./airflow/plugins` -> `/opt/airflow/plugins`

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

