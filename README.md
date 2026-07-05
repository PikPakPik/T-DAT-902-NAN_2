# Homepedia

Homepedia est une plateforme cartographique d'analyse territoriale. Elle croise
donnees immobilieres, cadastre, DPE, loyers, population, criminalite, qualite de
l'air, equipements et avis utilisateurs.

## Documentation

- [Documentation projet](docs/PROJET.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Airflow](docs/README_AIRFLOW.md)
- [Spark](docs/README_SPARK.md)
- [Methodologie de nettoyage](docs/METHODOLOGIE_NETTOYAGE.md)
- [IA / NLP](docs/IA_NLP.md)

## Stack

- Angular + Mapbox GL
- NestJS + GraphQL
- PostGIS
- MongoDB
- Airflow
- Apache Spark local Docker
- Docker Compose

## Prerequis

- Node.js 22+
- Docker + Docker Compose
- un fichier `.env` a la racine, a partir de `.env.example`

```bash
MAPBOX_TOKEN=ton_token
```

## Lancement rapide

```bash
docker compose up --build
```

- Front : [http://localhost:4200](http://localhost:4200)
- Back REST : [http://localhost:3000/api](http://localhost:3000/api)
- GraphQL : [http://localhost:3000/graphql](http://localhost:3000/graphql)
- Airflow : [http://localhost:8080](http://localhost:8080)

## Commandes utiles

```bash
docker compose exec -T backend npm run build
docker compose exec -T frontend npm run build
docker compose exec -T airflow-scheduler airflow dags list-import-errors
```

## Lancement manuel des DAGs

Les DAGs metier sont en manuel uniquement. Exemple :

```bash
docker compose exec airflow-scheduler airflow dags trigger download_air_quality
```

Voir [README_AIRFLOW.md](docs/README_AIRFLOW.md).
