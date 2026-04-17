from __future__ import annotations

import json
import os
import socket
from datetime import datetime
from urllib.error import URLError
from urllib.request import urlopen

from airflow import DAG
from airflow.operators.python import PythonOperator


BACKEND_HEALTH_URL = os.environ["BACKEND_HEALTH_URL"]
POSTGIS_HOST = os.environ["POSTGIS_HOST"]
POSTGIS_PORT = int(os.environ["POSTGIS_PORT"])
MONGODB_HOST = os.environ["MONGODB_HOST"]
MONGODB_PORT = int(os.environ["MONGODB_PORT"])


def check_backend_health() -> None:
    try:
        with urlopen(BACKEND_HEALTH_URL, timeout=10) as response:
            payload = response.read().decode("utf-8")
            status_code = response.getcode()
    except URLError as exc:
        raise RuntimeError(f"Backend health endpoint unreachable: {exc}") from exc

    if status_code != 200:
        raise RuntimeError(f"Unexpected backend health status: {status_code}")

    try:
        data = json.loads(payload)
    except json.JSONDecodeError:
        data = {"raw": payload}

    print(f"Backend health OK ({status_code}): {data}")


def check_tcp_connectivity(host: str, port: int) -> None:
    try:
        with socket.create_connection((host, port), timeout=5):
            print(f"TCP connectivity OK: {host}:{port}")
    except OSError as exc:
        raise RuntimeError(f"Cannot connect to {host}:{port} - {exc}") from exc


def publish_smoke_report() -> None:
    print("Smoke test finished: backend, postgis and mongodb are reachable.")


with DAG(
    dag_id="homepedia_stack_smoke",
    description="Simple smoke DAG for backend/postgis/mongodb connectivity",
    start_date=datetime(2026, 1, 1),
    schedule="@daily",
    catchup=False,
    tags=["homepedia", "smoke"],
) as dag:
    backend_health = PythonOperator(
        task_id="backend_healthcheck",
        python_callable=check_backend_health,
    )

    postgis_tcp = PythonOperator(
        task_id="postgis_tcp_check",
        python_callable=check_tcp_connectivity,
        op_kwargs={"host": POSTGIS_HOST, "port": POSTGIS_PORT},
    )

    mongodb_tcp = PythonOperator(
        task_id="mongodb_tcp_check",
        python_callable=check_tcp_connectivity,
        op_kwargs={"host": MONGODB_HOST, "port": MONGODB_PORT},
    )

    smoke_report = PythonOperator(
        task_id="publish_smoke_report",
        python_callable=publish_smoke_report,
    )

    [backend_health, postgis_tcp, mongodb_tcp] >> smoke_report
