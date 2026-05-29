from pyspark.sql import SparkSession
from pyspark.sql.functions import col, avg, count, round

# Initialisation de la session Spark
spark = SparkSession.builder \
    .appName("Homepedia-AggregationTest") \
    .getOrCreate()

spark.sparkContext.setLogLevel("WARN")

# 1. Jeu de données brutes (Ville, Type de bien, Prix total, Surface en m²)
data = [
    ("Nantes", "Appartement", 250000, 50),
    ("Nantes", "Maison", 420000, 105),
    ("Nantes", "Appartement", 180000, 40),
    ("Ancenis", "Maison", 220000, 90),
    ("Ancenis", "Maison", 260000, 110),
    ("Paris", "Appartement", 600000, 50),
    ("Paris", "Appartement", 380000, 30),
]

columns = ["Ville", "Type", "Prix", "Surface"]

# Création de la DataFrame initiale
df_brut = spark.createDataFrame(data, columns)

# 2. Transformation : Ajouter une colonne pour le prix au m² de chaque bien
df_avec_m2 = df_brut.withColumn("Prix_m2", col("Prix") / col("Surface"))

# 3. Agrégation : Grouper par ville pour avoir les statistiques globales
# On calcule le prix moyen au m² (arrondi à 2 décimales) et le nombre total de biens
df_analyse = df_avec_m2.groupBy("Ville") \
    .agg(
        round(avg("Prix_m2"), 2).alias("Prix_m2_Moyen"),
        count("Type").alias("Total_Biens")
    ) \
    .orderBy(col("Prix_m2_Moyen").desc()) # Trier du plus cher au moins cher

# Affichage du résultat final
print("\n" + "="*60)
print("   RÉSULTAT DE L'AGRÉGATION IMMOBILIÈRE (HOME PEDIA)")
print("="*60)
df_analyse.show()

# Arrêt propre de Spark
spark.stop()