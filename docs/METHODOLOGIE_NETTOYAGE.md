# Documentation methodologie de nettoyage

Cette documentation decrit les choix de nettoyage appliques aux sources de
donnees Homepedia. Elle couvre les champs retenus, les champs exclus, les
transformations, les regles de filtrage, la gestion des valeurs manquantes et
la standardisation des codes communes.

## Principes communs

- Les donnees volumineuses passent par une logique bronze / silver / gold :
  fichier source brut, fichier nettoye, puis chargement en base.
- Les jobs Spark ecrivent des sorties silver en Parquet, et pour certaines
  sources un CSV de controle.
- Les lignes non conformes sont conservees dans des fichiers de rejets quand le
  job le prevoit, avec un champ `motif`.
- Les chargements en base sont idempotents : suppression par annee, `TRUNCATE`
  sur table feuille, ou `upsert` selon la table cible.
- Les codes communes sont standardises en code INSEE 5 caracteres, avec prise
  en charge des codes corses `2A` / `2B` quand le jeu source le permet.
- Les nombres sont lus comme chaines puis convertis explicitement, avec
  remplacement des virgules decimales par des points.
- Les valeurs confidentielles ou non renseignees (`s`, `ns`, `nd`, `so`, `na`,
  `n/a`, vide, `null` selon les sources) sont traitees comme `NULL`.

## Contours administratifs

Source :

- GeoJSON gzip des regions, departements et communes.
- Chargeur : `airflow/plugins/load_contours.py`
- Tables cibles : `regions`, `departments`, `cities`

Champs retenus :

- regions : `code`, `nom`, geometrie ;
- departements : `code`, `nom`, code region, geometrie ;
- communes : `code`, `nom`, code departement, `epci`, geometrie.

Champs exclus :

- metadonnees GeoJSON non utilisees par l'application ;
- champs absents du fichier communes comme SIREN et codes postaux, initialises
  respectivement a chaine vide et `[]`.

Transformations :

- conversion des geometries GeoJSON en `MultiPolygon` SRID 4326 ;
- rattachement des departements aux regions par code ;
- rattachement des communes aux departements par code ;
- `names` reprend le nom principal de la commune.

Regles de filtrage :

- rejet des entites sans code, sans nom ou sans geometrie ;
- rejet des departements dont la region est inconnue ;
- rejet des communes dont le departement est inconnu.

Gestion des valeurs manquantes :

- les champs facultatifs absents sont initialises avec une valeur neutre ;
- les entites incompletes sur les champs obligatoires sont ignorees.

Standardisation des codes communes :

- `cities.code` est normalise avec `zfill(5)`.

## Cadastre Etalab

Source :

- GeoJSON gzip cadastre par departement, couches `sections` et `parcelles`.
- Chargeur : `airflow/plugins/load_cadastre.py`
- Tables cibles : `sections`, `plots`

Champs retenus :

- sections : commune, prefixe, code section, geometrie ;
- parcelles : commune, prefixe, section, numero, contenance, geometrie.

Champs exclus :

- proprietes cadastre non necessaires au rattachement parcelle/section ;
- features sans geometrie exploitable.

Transformations :

- lecture streaming avec `ijson` pour eviter de charger un departement entier
  en memoire ;
- staging PostgreSQL temporaire via `COPY` ;
- conversion GeoJSON vers `MultiPolygon` SRID 4326 ;
- resolution de `cityId` depuis `cities.code` ;
- resolution de `sectionId` pour chaque parcelle ;
- dedoublonnage par cle fonctionnelle avant `ON CONFLICT`.

Regles de filtrage :

- sections ignorees si commune, code section ou geometrie manquants ;
- parcelles ignorees si commune, section, numero ou geometrie manquants ;
- parcelles non chargees si la commune ou la section cible n'est pas retrouvee.

Gestion des valeurs manquantes :

- `prefixe` vaut `000` par defaut ;
- `contenance` manquante devient une chaine vide.

Standardisation des codes communes :

- commune cadastre normalisee avec `zfill(5)`.

## DVF

Source :

- Fichiers `full-YYYY.csv.gz` geo-dvf.
- Job : `spark-jobs/silver/dvf_mutations.py`
- Tables cibles : `mutations`, `mutation_locals`

Champs retenus :

- mutation : `id_mutation`, `date_mutation`, `annee`, `nature_mutation`,
  `valeur_fonciere`, `nb_lots`, `surface_habitable`, `prix_m2`,
  `longitude`, `latitude` ;
- local : `type_local`, `surface_reelle_bati`,
  `nombre_pieces_principales`, `surface_terrain`, `id_parcelle`, `plotId`.

Champs exclus :

- lignes DVF qui ne sont pas des ventes ;
- colonnes descriptives non necessaires au calcul des prix ou au rattachement
  parcellaire ;
- doublons exacts au niveau local.

Transformations :

- conversion de `date_mutation` en date ;
- conversion numerique de `valeur_fonciere`, surfaces, pieces et coordonnees ;
- agregation a la maille `id_mutation` ;
- `surface_habitable` = somme des surfaces des locaux de type `Maison` ou
  `Appartement` ;
- `prix_m2 = valeur_fonciere / surface_habitable` quand la surface est
  positive ;
- rattachement optionnel a `plots` via `id_parcelle`, `sections.section_key` et
  le numero de parcelle.

Regles de filtrage :

- uniquement `nature_mutation = Vente` ;
- `id_mutation` obligatoire ;
- `valeur_fonciere > 0` obligatoire ;
- `date_mutation` valide obligatoire.

Gestion des valeurs manquantes :

- les champs optionnels absents sont remplaces par `NULL` type ;
- les ventes sans surface habitable valide sont conservees, mais `prix_m2`
  reste `NULL` ;
- les rejets indiquent notamment `id_mutation manquant`,
  `prix manquant ou invalide` ou `date invalide`.

Standardisation des codes communes :

- DVF est rattache au cadastre via `id_parcelle` normalise sur 14 caracteres ;
- les stats communales/sections sont ensuite derivees par jointure avec les
  tables cadastre et communes.

## DPE ADEME

Source :

- CSV ADEME DataFair.
- Job : `spark-jobs/silver/dpe_load.py`
- Table cible : `dpes`

Champs retenus :

- `dpe_id`, `annee`, `classe_energie`, `classe_ges`,
  `surface_habitable`, `type_batiment`, `annee_construction`,
  `code_insee`, coordonnees Lambert 93 de staging puis longitude/latitude
  WGS84, `plotId`.

Champs exclus :

- colonnes ADEME non utilisees par l'interface ;
- doublons sur `dpe_id` ;
- lignes sans coordonnees ou avec etiquette invalide.

Transformations :

- detection d'alias de colonnes pour absorber les variations ADEME ;
- normalisation des noms de colonnes sans accents ;
- conversion des dates en annee ;
- choix de la premiere surface disponible parmi les colonnes de surface
  connues ;
- upper-case des etiquettes energie/GES et du code INSEE ;
- conversion Lambert 93 vers WGS84 avec PostGIS ;
- rattachement spatial a la parcelle avec `ST_Covers`, en choisissant la plus
  petite parcelle candidate.

Regles de filtrage :

- numero DPE obligatoire ;
- code INSEE valide ;
- annee entre 1900 et 2100 ;
- etiquettes energie et GES dans `A` a `G` ;
- surface strictement positive ;
- type de batiment non vide ;
- annee de construction entre 0 et 2100 ;
- coordonnees Lambert 93 non nulles et non egales a 0.

Gestion des valeurs manquantes :

- `""`, `na`, `n/a`, `nd`, `ns`, `so`, `s`, `null` deviennent `NULL` ;
- `annee_construction` vaut `0` si absente ;
- le type de batiment peut etre force a `Tertiaire` pour les fichiers
  tertiaires ;
- les rejets conservent un motif precis.

Standardisation des codes communes :

- code INSEE upper-case, valide par regex `^(\d{5}|2[AB]\d{3})$`.

## Loyers ANIL

Source :

- Carte des loyers ANIL, un dossier par annee.
- Job : `spark-jobs/load_loyers.py`
- Table cible : `rents`

Champs retenus :

- `INSEE_C`, `loypredm2`, `nbobs_com`, `R2_adj` ;
- quatre indicateurs charges :
  `loyer_median_apt`, `loyer_median_t1t2`,
  `loyer_median_t3plus`, `loyer_median_maison`.

Champs exclus :

- colonnes de modele et metadonnees non affichees ;
- communes absentes de la table `cities`.

Transformations :

- lecture CSV avec separateur `;` ;
- conversion des virgules decimales ;
- fusion des quatre fichiers d'indicateurs par code INSEE ;
- jointure avec `cities` ;
- suppression des loyers de l'annee avant insertion.

Regles de filtrage :

- l'annee est obligatoire ;
- les lignes sans commune correspondante en base ne sont pas chargees et sont
  journalisees.

Gestion des valeurs manquantes :

- les indicateurs absents restent `NULL` apres full join ;
- `nb_observations` et `r2` proviennent du fichier appartement principal.

Standardisation des codes communes :

- `INSEE_C` est trimme puis complete a gauche sur 5 caracteres.

## Delinquance communale

Source :

- Fichiers SSMSI data.gouv en CSV gzip.
- Job : `spark-jobs/silver/delinquance_crimes.py`
- Table cible : `crimes_cities`

Champs retenus :

- code commune, annee, indicateur, taux pour mille, statut de diffusion ;
- indicateurs finaux :
  `taux_cambriolages`, `taux_vols_armes`,
  `taux_vols_sans_viol`, `taux_violences_phys`.

Champs exclus :

- lignes non diffusees ;
- indicateurs hors perimetre fonctionnel ;
- colonnes non necessaires au pivot communal.

Transformations :

- selection du fichier geographique le plus recent ;
- detection de la colonne `CODGEO` millesimee ;
- conversion des taux en double ;
- pivot des indicateurs par commune et annee ;
- `taux_violences_phys` = violences intrafamiliales + violences hors cadre
  familial.

Regles de filtrage :

- uniquement `est_diffuse = diff` ;
- code INSEE valide ;
- tous les indicateurs requis doivent etre presents ;
- les taux doivent etre positifs ou nuls.

Gestion des valeurs manquantes :

- valeurs confidentielles ou vides converties en `NULL` ;
- pour les violences, une composante manquante vaut 0 si l'autre composante est
  presente ;
- lignes invalides exportees en rejets.

Standardisation des codes communes :

- code commune upper-case, valide par regex `^(\d{5}|2[AB]\d{3})$`.

## Recensement population

Source :

- Populations legales communales INSEE.
- Job : `spark-jobs/silver/recensement_population.py`
- Table cible : `populate_cities`

Champs retenus :

- code commune et population municipale `PMUN`.

Champs exclus :

- libelles et autres niveaux administratifs non charges dans
  `populate_cities` ;
- lignes sans population exploitable.

Transformations :

- detection automatique du format du millesime :
  `DEPCOM`, `COM`, `CODGEO` ou reconstruction `CODDEP + CODCOM` ;
- conversion de `PMUN` en entier ;
- ajout de l'annee, du fichier source et de la date de traitement ;
- jointure avec `cities`.

Regles de filtrage :

- code INSEE valide ;
- population strictement positive.

Gestion des valeurs manquantes :

- valeurs `s`, `ns`, `nd`, `n/a`, `na`, `so` et vides converties en `NULL` ;
- rejets avec motif `code_insee invalide` ou
  `population manquante ou nulle`.

Standardisation des codes communes :

- reconstruction et validation du code INSEE selon le millesime ;
- support des codes corses.

## Filosofi revenus

Source :

- Fichier communal INSEE Filosofi `cc_filosofi_YYYY_COM.csv`.
- Job : `spark-jobs/silver/filosofi_income.py`
- Table cible : `income_cities`

Champs retenus :

- `CODGEO`, `NBMENFISC21`, `MED21`, `D121`, `D921`, `TP6021`.

Champs exclus :

- autres indicateurs Filosofi non utilises dans l'application ;
- lignes confidentielles ou incompletes.

Transformations :

- selection du dernier millesime disponible ;
- conversion des revenus et taux en numeriques ;
- arrondi a deux decimales ;
- jointure avec `cities`.

Regles de filtrage :

- code INSEE valide ;
- nombre de menages fiscaux strictement positif ;
- mediane, decile 1, decile 9 et taux de pauvrete presents ;
- revenus positifs ou nuls ;
- taux de pauvrete entre 0 et 100 ;
- coherence des deciles :
  `decile1 <= mediane <= decile9`.

Gestion des valeurs manquantes :

- valeurs confidentielles ou vides converties en `NULL` ;
- rejets avec motif `donnee manquante ou confidentielle`.

Standardisation des codes communes :

- code INSEE upper-case, valide par regex `^(\d{5}|2[AB]\d{3})$`.

## BPE equipements

Source :

- Base permanente des equipements INSEE.
- Chargeur : `airflow/plugins/load_bpe.py`
- Table cible : `devices`

Champs retenus :

- `NOMRS`, adresse composee depuis `NUMVOIE`, `TYPVOIE`, `LIBVOIE`,
  `TYPEQU`, `CATEGORIE`, `DOM`, `SDOM`, `LIBCOM`, `LONGITUDE`, `LATITUDE`,
  `DEPCOM`, `EPCI`.

Champs exclus :

- champs capacitaires et indicateurs tres specialises non encore exploites par
  l'application ;
- metadonnees de qualite geographique conservees uniquement dans la source
  brute, pas dans `devices`.

Transformations :

- lecture CSV UTF-8 avec separateur `;` ;
- construction d'une adresse lisible ;
- resolution de `cityId` d'abord par code commune `DEPCOM` vers `cities.code`,
  puis fallback par code EPCI si necessaire ;
- categorisation fonctionnelle exposee au frontend depuis `DOM`
  (`services`, `commerce`, `education`, `health`, `transport`, `sport`,
  `culture`) ;
- `TRUNCATE` de `devices` avant chargement pour rendre le DAG idempotent.

Regles de filtrage :

- les lignes sans longitude ou latitude valide sont ignorees ;
- les lignes sans commune rattachee sont ignorees ;
- les lignes chargees ont toujours un `cityId`.

Gestion des valeurs manquantes :

- parties d'adresse absentes simplement omises ;
- longitude/latitude vides ou non numeriques provoquent un rejet de ligne ;
- EPCI inconnu ne bloque pas si `DEPCOM` permet de trouver la commune.

Standardisation des codes communes :

- `DEPCOM` est trimme, upper-case et complete a gauche sur 5 caracteres.

## Avis utilisateurs

Source :

- Pages avis et quartiers de `bien-dans-ma-ville.fr`.
- Scraper : `scrapers/bien-dans-ma-ville/scraper.py`
- Collections cibles : `cities`, `reviews` dans MongoDB.

Champs retenus :

- ville/quartier : nom, code INSEE, quartier, note moyenne, notes par critere ;
- avis : source id, date, note globale, notes `securite`, `education`,
  `sport_loisir`, `environnement`, `vie_pratique`, commentaire, votes.

Champs exclus :

- avis internes marques `bdmv` ;
- blocs HTML sans note totale, date, commentaire ou criteres complets ;
- elements de presentation HTML.

Transformations :

- extraction du code INSEE depuis l'URL ;
- extraction optionnelle du slug de quartier ;
- conversion des notes en flottants bornes entre 0 et 5 ;
- conversion des dates francaises `jj/mm/aaaa` en `datetime` ;
- remplacement complet des avis d'une ville/quartier a chaque scrape ;
- index MongoDB sur `(code, quartier)` et `source_id`.

Regles de filtrage :

- code INSEE obligatoire dans l'URL ;
- 5 criteres de notation obligatoires ;
- commentaire non vide obligatoire ;
- date parseable obligatoire.

Gestion des valeurs manquantes :

- les compteurs de votes invalides valent 0 ;
- le nom de commune vaut `Inconnue` si le HTML ne permet pas de l'extraire.

Standardisation des codes communes :

- code INSEE extrait par regex `(\d{5}|2[AB]\d{3})` et upper-case.

## Tables derivees

Certaines tables ne viennent pas directement d'une source externe :

- `stats_cities` : agregations communales existantes pour les mutations ;
- `stats_sections` : prix au m2 et volumes de ventes par section cadastre ;
- `cities.sentiment_global` et `cities.wordcloud_data` : donnees derivees des
  avis analyses.

Ces tables ne doivent pas etre considerees comme des sources brutes. Elles sont
recalculables a partir des sources nettoyees et servent a accelerer les
requeters frontend/backend.
