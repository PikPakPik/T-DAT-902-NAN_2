# Homepedia

## Stack
- Angular
- NestJS
- PostGIS
- MongoDB
- Mapbox
- Airflow (extract / orchestration)
- Apache Spark local (Docker — transform des jeux volumineux)
- Docker

## Prerequis
- Node.js 22+
- Docker + Docker Compose
- un fichier `.env` a la racine avec :
```bash
MAPBOX_TOKEN=ton_token
```

## Lancement rapide (recommande)
```bash
docker compose up --build
```
- Front : [http://localhost:4200](http://localhost:4200)
- Back REST : [http://localhost:3000/api](http://localhost:3000/api)
- GraphQL : [http://localhost:3000/graphql](http://localhost:3000/graphql)
- Airflow : [http://localhost:8080](http://localhost:8080)

## Architecture

Documentation complète : [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) (diagrammes, composants, flux E2E, choix techniques).

# Ressources

[TDAT902 Sharepoint](https://epitechfr.sharepoint.com/sites/TDAT902/Documents%20partages/Forms/AllItems.aspx?FolderCTID=0x012000F564A00B5E98FE4380EF0C645E31A70D&id=%2Fsites%2FTDAT902%2FDocuments%20partages%2Fdata)  
[Apache Spark](https://spark.apache.org/docs/latest/)  
[GraphQL](https://graphql.org/)  
[DB Diagram](https://mermaid.live/edit#pako:eNrVWF9v4jgQ_yqRn9sKQoHC657uZXXSPZ-QLCeZgreO7Y5trmy33_0mIQkkhJDu7T3cC1JmfjOe_2PzzlKTAVuzjQb8TYotinyjowhhK4120XvxEUVSe9gCRjKL_vx6JO0FpjuBkRY5tCmFxiPFw5uP_n5Jiq-P4icDK9DnoP0vV51KL-FzWr85o8tPd-2UmuIkgm6TwKbyTM13aXkh5y7NO1lzcp-TYb9_bYx3kPqR8a6gpKBNtwjP8m1UvE76KWiHjilWmVHJKXDDRtTCOuQJYOdgYUVxeJt68u3cojx4MTY6MuM1_MjIhIfyp0M_VYMP2GWSxYAyJZCCgPzZ6FQCdmLrDxa4MqlQbSEX8FmkwBFAKeAJ6e0HeEAUsjrS5UIpcizSCbcSUnDcoqRzLdlQFVVmQqIgUkZvpQ91ZmsqnXMiNuqE1tDJR5W58xArcwAcim-fvtqfUpjnkEmhubB-gOunPh5iz6wKbgCQC-nqJDXllXCTOMD9sUja0hjfLHhHmXf85vjo19AfmVslQpl9a1yK-3jk9CWrLpyjJFyEwaPQTqQ9YYC9UaFsrVK9TX3H_XGDeWiO_f8jYY0NqiwimuR5HvRP1cP56OXHNdrDoAj6Tlc2p1-Pppe0q7zIbZQi0EzLuDiZj7AHHdy_sX2oy6tQcyeUkNhhZpBKBdMh5qqf6UWgLIiwR_CXeaQSE9tmpw55n6LMpRZK0qT_jyJQmpqKPEFp1MmsFpuqy3GB-XWmo8rke9LQByAy6HL27w5jvM4sjFiKhGo29VCTpko4BxzoKriV_bwLr-tO3IlEekGLqKfvixVYDIs-CyhZ2nkMqe9vFKkdwKfX38CqoxLkr6EolMMn911DkzqT5LLwuakmUGdw5fH8CmM66WVoE_fSzaxFPuuMbyag44m5xinn5jUetRst0pubsZyi1qDnzhs76nJKuItL4eU1PjfZz-e0x1B4DdLC2GdFUZOvoVNr1Flbg92q1yb_lXbWr6ofP-7vzXvrNbSONmwn3IZ1n0kVtrqf3IJdbvOWRKWlBtevjgFMdTMc0nJ-fxrA9a3XAfjFOhvA9g7_Afz5DBiAdet_AHpegS1YE-M6CuXzqgU5kir-6bFzHVNM_YJLw-gFssibAsPu2BZlxtY0TOGO0fygyzJ9srIhNszvyLwNK-QygS-FyAfJWKH_MiavxdCE7Y6tn4Vy9BVs8XKq_hZoIKAzwC8maM_Wj4tSBVu_sze2vp_Nlg-rxXSymi2f5stVwT2wdTxdPkziJ6LGk8ViEs8eP-7Y9_LU6cPycf60jBerxeNqPptN53eMBp43-Mfxf4ny74mPfwCSDb26)  