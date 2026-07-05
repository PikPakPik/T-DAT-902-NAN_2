# Documentation IA / NLP

Cette documentation couvre le pipeline d'analyse des avis utilisateurs issus de
`bien-dans-ma-ville.fr`. Le pipeline est orchestre par le DAG Airflow
`pipeline_avis_nlp` et alimente MongoDB pour l'affichage des insights par
commune dans l'application.

## Modele utilise et justification

Le modele utilise par defaut est
`nlptown/bert-base-multilingual-uncased-sentiment`, charge via Hugging Face
Transformers dans `scrapers/nlp/sentiment.py`.

Justification :

- le modele est multilingue et fonctionne sur des textes francais sans
  entrainement specifique au projet ;
- il produit une distribution de notes de 1 a 5 etoiles, ce qui correspond bien
  au format des avis utilisateurs ;
- il est utilisable en inference locale, sur CPU ou GPU, sans dependance a une
  API externe ;
- il permet une execution batchable dans Airflow avec des parametres de tuning
  (`SENTIMENT_BATCH_SIZE`, `SENTIMENT_MAX_LENGTH`,
  `SENTIMENT_TORCH_THREADS`) ;
- il donne un score continu interpretable pour l'interface :
  `sentiment_score` entre 1 et 5, puis un label
  `negative` / `neutral` / `positive`.

Le nom du modele peut etre surcharge avec la variable d'environnement
`SENTIMENT_MODEL`.

## Pipeline de traitement

1. Scraping des avis
   - Script : `scrapers/bien-dans-ma-ville/scraper.py`
   - Source : sitemap `https://www.bien-dans-ma-ville.fr/sitemap-villeavis.xml`
   - Sortie MongoDB :
     - collection `cities` : code INSEE, nom, quartier eventuel, note moyenne,
       notes par critere ;
     - collection `reviews` : code INSEE, quartier, date, note globale,
       notes par critere, commentaire, votes utiles/inutiles.
   - Les pages villes et quartiers sont traitees. Les avis sans note, date,
     criteres complets ou commentaire sont ignores.

2. Analyse de sentiment
   - Script : `scrapers/nlp/sentiment.py`
   - Entree : documents `reviews` non encore analyses
     (`sentiment_analyzed_at` absent ou nul).
   - Le texte est tronque a `SENTIMENT_MAX_LENGTH` tokens, puis traite en batch.
   - La distribution du modele sur les classes 1 a 5 etoiles est convertie en
     score attendu :
     `sentiment_score = sum(probabilite_classe * etoiles_classe)`.
   - Les labels sont derives du score :
     - `score <= 2.0` : `negative`
     - `2.0 < score <= 3.0` : `neutral`
     - `score > 3.0` : `positive`
   - Les commentaires vides sont neutralises avec `sentiment_score = 3.0`,
     `sentiment_label = neutral` et `keywords = []`.
   - Les mises a jour MongoDB sont groupees par `bulk_write` pour limiter les
     allers-retours.

3. Extraction de mots-cles
   - Fichier commun : `scrapers/nlp/common.py`
   - Tokenisation par expression reguliere compatible avec les accents francais.
   - Normalisation en minuscules.
   - Suppression des tokens de moins de 3 caracteres et d'une liste compacte de
     stopwords francais.
   - Par avis, les 10 mots les plus frequents sont stockes dans `keywords`.

4. Agregation du sentiment par commune
   - Les avis analyses sont regroupes par `code` INSEE.
   - Le champ `cities.sentiment_global` est mis a jour avec :
     - `average_score`
     - `label`
     - `review_count`
     - `positive_count`
     - `neutral_count`
     - `negative_count`
     - `analyzed_at`

5. Generation des wordclouds
   - Script : `scrapers/nlp/wordcloud.py`
   - Entree : avis analyses avec commentaire non vide.
   - Methode par defaut : comptage simple (`WORDCLOUD_METHOD=count`).
   - Methode alternative : TF-IDF local par commune
     (`WORDCLOUD_METHOD=tfidf`).
   - Sortie : `cities.wordcloud_data`, avec les 50 mots principaux et leur
     poids.

6. Rapport Airflow
   - Fonction : `report_pipeline_stats()` dans `airflow/plugins/pipeline_avis.py`
   - Le DAG affiche un rapport en fin de pipeline.

## Resultats et metriques

Les metriques produites automatiquement par le pipeline sont :

- nombre total d'avis en collection `reviews` ;
- nombre d'avis analyses par le NLP ;
- nombre d'avis ayant un label de sentiment ;
- nombre de communes avec `wordcloud_data` ;
- nombre de communes avec `sentiment_global` ;
- repartition des avis par label : `positive`, `neutral`, `negative` ;
- nombre d'avis analyses pendant le run courant ;
- nombre d'avis ignores pendant le run courant ;
- nombre de communes agregees pendant le run courant ;
- taille de batch effective.

Ces metriques sont disponibles dans les logs Airflow de la tache
`report_pipeline` et dans le retour de `analyze_reviews()`.

Exemple de format de suivi attendu :

| Metrique | Source | Interpretation |
| --- | --- | --- |
| `Avis total` | MongoDB `reviews.count_documents({})` | volume brut scrape |
| `Avis analyses NLP` | `sentiment_analyzed_at != null` | couverture de l'inference |
| `Avis avec sentiment` | `sentiment_label != null` | avis exploitables cote UI |
| `Communes sentiment` | `cities.sentiment_global` | communes avec synthese |
| `Communes wordcloud` | `cities.wordcloud_data` | communes avec mots saillants |
| `Label positive/neutral/negative` | `sentiment_label` | distribution des opinions |

Pour un rendu final, le rapport Airflow du dernier run doit etre conserve avec
la date d'execution et les valeurs exactes de ces compteurs.

## Limites et ameliorations possibles

Limites identifiees :

- le modele est generaliste et n'a pas ete fine-tune sur des avis de communes ;
- le score 1-5 du modele est une approximation du sentiment, pas une validation
  humaine ;
- les sarcasmes, negations complexes et avis mixtes peuvent etre mal classes ;
- le pipeline ne calcule pas encore de score de confiance exploite pour filtrer
  les predictions incertaines ;
- la source d'avis est unique, donc les resultats peuvent refleter le biais de
  population du site scrape ;
- la tokenisation n'inclut pas de lemmatisation : `ecole`, `ecoles` et
  variantes proches peuvent rester separees ;
- les wordclouds par comptage favorisent les mots frequents, pas forcement les
  mots discriminants ;
- aucune evaluation manuelle etiquetee n'est actuellement versionnee dans le
  repo.

Ameliorations possibles :

- constituer un jeu d'evaluation annote manuellement et suivre precision,
  rappel, F1 par classe et erreur moyenne de score ;
- comparer le modele actuel avec un modele francophone specialise, par exemple
  un CamemBERT fine-tune sur du sentiment ;
- fine-tuner le modele sur des avis de villes ou de services publics ;
- exploiter la probabilite maximale du modele comme indicateur de confiance ;
- passer le wordcloud en TF-IDF par defaut pour mieux faire ressortir les mots
  specifiques a chaque commune ;
- ajouter une lemmatisation francaise pour regrouper les variantes d'un meme
  mot ;
- separer le sentiment global et le sentiment par aspect
  (`securite`, `education`, `environnement`, etc.) ;
- suivre la derive des donnees entre deux runs Airflow.
