FROM apache/spark:4.0.0-python3

USER root
RUN apt-get update && apt-get upgrade -y && apt-get install -y wget && rm -rf /var/lib/apt/lists/*
RUN wget https://jdbc.postgresql.org/download/postgresql-42.7.3.jar -P /opt/spark/jars/
RUN pip install --no-cache-dir psycopg2-binary
RUN useradd --uid 1000 --gid 0 --home-dir /tmp --shell /bin/bash airflow \
    && mkdir -p /opt/spark/work-dir/artifacts \
    && chown -R airflow:0 /opt/spark/work-dir
USER spark
