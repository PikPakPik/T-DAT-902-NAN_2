# Ressources

[TDAT902 Sharepoint](https://epitechfr.sharepoint.com/sites/TDAT902/Documents%20partages/Forms/AllItems.aspx?FolderCTID=0x012000F564A00B5E98FE4380EF0C645E31A70D&id=%2Fsites%2FTDAT902%2FDocuments%20partages%2Fdata)
[Databricks](https://docs.databricks.com/aws/en/getting-started/quick-start)
[Streamlit](https://streamlit.io/)


Mermaid : 

```mermaid
erDiagram
  departments {
    integer id PK
    varchar name
    varchar code
    text wkb
  }
  cities {
    integer id PK
    varchar name
    json names
    varchar code
    varchar siren
    varchar epci
    json zip_codes
    text wkb
    integer department_id FK
  }
  sections {
    integer id PK
    varchar section_id
    varchar prefixe
    varchar code
    text wkb
    integer city_id FK
  }
  plots {
    integer id PK
    varchar plot_id
    varchar prefixe
    integer number
    integer capacity
    integer section_id FK
  }
  mutations {
    integer id PK
    varchar id_mutation
    date date_mutation
    varchar nature_mutation
    numeric valeur_fonciere
    varchar type_local
    numeric surface_reelle_bati
    numeric surface_terrain
    smallint nb_pieces_principales
    double longitude
    double latitude
    smallint annee
    integer plot_id FK
  }
  loyers {
    integer id PK
    smallint annee
    numeric loyer_median_apt
    numeric loyer_median_t1t2
    numeric loyer_median_t3plus
    numeric loyer_median_maison
    integer nb_observations
    numeric r2
    integer city_id FK
  }
  stats_cities {
    integer id PK
    integer city_id FK
    smallint annee
    varchar type_local
    numeric prix_median_m2
    numeric prix_moyen_m2
    numeric surface_mediane
    integer nb_transactions
    numeric evolution_prix_pct
  }
  stats_departments {
    integer id PK
    integer department_id FK
    smallint annee
    varchar type_local
    numeric prix_median_m2
    numeric prix_moyen_m2
    numeric surface_mediane
    integer nb_transactions
    numeric evolution_prix_pct
  }
  population_communes {
    integer id PK
    integer city_id FK
    varchar code_region
    varchar code_dept
    integer population
    smallint annee
    timestamp created_at
  }
  revenus_communes {
    integer id PK
    integer city_id FK
    smallint annee
    numeric mediane_salaire
    numeric decile1_salaire
    numeric decile9_salaire
    numeric taux_pauvrete
    integer nb_menages
    timestamp created_at
  }
  criminalite_communes {
    integer id PK
    integer city_id FK
    smallint annee
    numeric taux_cambriolages
    numeric taux_vols_armes
    numeric taux_vols_sans_viol
    numeric taux_violences_phys
    timestamp created_at
  }
  dpe {
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
    integer city_id FK
    integer plot_id FK
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
    integer city_id FK
  }
  transport_stops {
    integer id PK
    varchar stop_id
    varchar name
    varchar mode
    double longitude
    double latitude
    integer city_id FK
  }
  equipements {
    integer id PK
    varchar typequ
    varchar categorie
    varchar nom
    double longitude
    double latitude
    integer city_id FK
  }
  departments ||--o{ cities : "has"
  departments ||--o{ stats_departments : "has"
  cities ||--o{ sections : "has"
  cities ||--o{ loyers : "has"
  cities ||--o{ stats_cities : "has"
  cities ||--o{ population_communes : "has"
  cities ||--o{ revenus_communes : "has"
  cities ||--o{ criminalite_communes : "has"
  cities ||--o{ dpe : "has"
  cities ||--o{ air_quality : "has"
  cities ||--o{ transport_stops : "has"
  cities ||--o{ equipements : "has"
  sections ||--o{ plots : "has"
  plots ||--o{ mutations : "has"
  plots ||--o{ dpe : "linked to"
```