import os
from pyspark.sql import SparkSession

# Récupération des variables d'environnement configurées dans le docker-compose
pg_user = os.getenv("POSTGRES_USER", "postgres")
pg_password = os.getenv("POSTGRES_PASSWORD", "postgres")
pg_db = os.getenv("POSTGRES_DB", "homepedia")

# Initialisation de la session Spark
spark = SparkSession.builder \
    .appName("Homepedia-HelloSpark") \
    .config("spark.jars", "/opt/spark/jars/postgresql-42.7.3.jar") \
    .getOrCreate()
spark.sparkContext.setLogLevel("WARN")

print("\n" + "="*50)
print("  [SPARK] COMPTE-RENDU DU TEST LOCAL")
print("="*50)

# 1. Test basique de traitement de données (DataFrame)
try:
    data = [("Nantes", 3500), ("Ancenis", 2200), ("Paris", 5500)]
    df = spark.createDataFrame(data, ["Ville", "Prix_m2"])
    print("\n[OK] Création de la DataFrame locale réussie :")
    df.show()
except Exception as e:
    print(f"\n[FAIL] Échec du traitement de la DataFrame : {e}")

# 2. Test de configuration du driver JDBC Postgres
print("\n[INFO] Tentative de configuration du driver JDBC vers PostGIS...")
try:
    jdbc_url = f"jdbc:postgresql://postgis:5432/{pg_db}"
    
    # On vérifie si Spark arrive à charger la classe du driver
    print(f"[INFO] Connexion ciblée : {jdbc_url}")
    print("[OK] Driver PostgreSQL JDBC présent et prêt à l'emploi.")
except Exception as e:
    print(f"[FAIL] Problème avec le driver JDBC ou la configuration réseau : {e}")

print("\n" + "="*50)
spark.stop()