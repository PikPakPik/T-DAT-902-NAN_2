# Documentation : Utilisation d'Apache Spark en Local

Cette documentation explique comment utiliser le service Apache Spark configuré pour le projet **Homepedia** afin d'exécuter des scripts de traitement de données (PySpark) en mode local. Le service est entièrement conteneurisé et interconnecté avec les bases de données PostGIS et MongoDB du projet.

---

## 🛠️ Prérequis

Avant de lancer un job Spark, assure-toi d'avoir configuré les éléments suivants :
* **Bases de données actives :** Les conteneurs `postgis` et `mongodb` doivent être démarrés et sains.

---

## 📁 Structure des Dossiers

Le dossier racine `spark-jobs/` de la machine est monté directement dans le conteneur Spark au chemin `/opt/spark-jobs`.

---

## 🚀 Lancement des tests Spark (Manuel)

### 1. Exécuter le script de test initial
Pour vérifier la bonne configuration de la DataFrame et la détection du driver JDBC PostgreSQL :
```bash
docker compose run --rm spark /opt/spark/bin/spark-submit /opt/spark-jobs/tests/hello_spark.py
```

### 2. Exécuter le script d'agrégation immobilière
Pour tester un pipeline d'agrégation de données avec calcul de moyennes et de volumes par ville :
```bash
docker compose run --rm spark /opt/spark/bin/spark-submit /opt/spark-jobs/tests/aggregation.py
```

### 3. Charger les loyers ANIL dans PostgreSQL
Après le DAG `download_carte_loyers` (fichiers dans `./airflow/data/carte_loyers/<année>/`) et le chargement des communes (`load_contours`) :
```bash
docker compose run --rm spark /opt/spark/bin/spark-submit /opt/spark-jobs/load_loyers.py --year 2024
```

Variables optionnelles : `LOYERS_YEAR`, `LOYERS_DATA_DIR` (défaut `/opt/airflow/data/carte_loyers`).

### 4. Charger les DPE ADEME dans PostgreSQL
Après le DAG `download_ademe_dpe` (fichiers dans `./airflow/data/ademe_dpe/`) et le chargement du cadastre :
```bash
docker compose run --rm spark /opt/spark/bin/spark-submit \
  --jars /opt/spark/jars/postgresql-42.7.3.jar \
  /opt/spark-jobs/silver/dpe_load.py
```

Variables optionnelles : `DPE_DOWNLOAD_DIR`, `DPE_SILVER_DIR`, `DPE_REJECTS_DIR`.
Ajouter `--skip-db` pour produire uniquement les fichiers silver/rejets, ou `--skip-link-plots` pour ne pas remplir `dpes.plotId`.

### 5. Tests unitaires (`load_loyers.py`)
Les tests PySpark utilisent des fixtures CSV minimales dans `spark-jobs/tests/fixtures/`.
```bash
docker compose run --rm spark bash -c \
  "pip install -q -r /opt/spark-jobs/requirements-dev.txt && \
   python -m pytest /opt/spark-jobs/tests/test_load_loyers.py -v"
```

---

## 💡 Astuces & Bonnes Pratiques

### Filtrer les logs verbeux de Spark
Par défaut, Spark affiche une quantité massive de logs de niveau `INFO`. Pour épurer la console et ne voir que les résultats des scripts, il faut ajouter cette ligne dans le code Python juste après l'initialisation de la `SparkSession` :

```python
spark = SparkSession.builder.appName("MyApp").getOrCreate()
# Conserve uniquement les avertissements et les erreurs critiques
spark.sparkContext.setLogLevel("WARN")
```

### Connexion aux bases de données (JDBC)
Le conteneur Spark est configuré avec le driver JDBC officiel PostgreSQL. On peut s'y connecter dans les scripts via l'URL réseau Docker suivante :
* **URL PostgreSQL :** `jdbc:postgresql://postgis:5432/homepedia`
```python
# Exemple de configuration JDBC dans le script PySpark
jdbc_url = "jdbc:postgresql://postgis:5432/homepedia"
```
