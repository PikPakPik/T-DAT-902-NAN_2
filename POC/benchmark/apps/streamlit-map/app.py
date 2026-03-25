import json
from pathlib import Path

import pydeck as pdk
import streamlit as st

st.set_page_config(page_title="Streamlit benchmark", layout="wide")

st.markdown(
    """
<style>
html, body, [data-testid="stAppViewContainer"] { margin: 0; background: #faf5eb; }
header[data-testid="stHeader"] { display: none; }
[data-testid="stToolbar"] { display: none; }
.block-container { padding: 0 !important; max-width: 100% !important; }
.bench-topbar {
  height: 56px;
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 0 14px;
  border-bottom: 1px solid #d7c5ae;
  background: #f5e8d4;
  color: #3a2719;
  font-size: 14px;
  font-family: 'IBM Plex Sans', sans-serif;
}
.bench-topbar code {
  padding: 3px 8px;
  border-radius: 4px;
  background: #e7d8c5;
}
</style>
""",
    unsafe_allow_html=True,
)

st.markdown(
    '<div class="bench-topbar"><strong>Streamlit benchmark</strong><span>Loading polygons...</span><code id="dataset-label"></code></div>',
    unsafe_allow_html=True,
)

view_state = pdk.ViewState(latitude=46.7, longitude=2.5, zoom=6)

geojson_path = Path(__file__).parent / "static" / "data" / "cadastre-batiments.json"
query_params = st.query_params
source_mode = query_params.get("source", "geojson")

if source_mode == "vector":
    dataset_label = "https://openmaptiles.geo.data.gouv.fr/data/cadastre.json"
    layer = pdk.Layer(
        "MVTLayer",
        "https://openmaptiles.data.gouv.fr/data/cadastre/{z}/{x}/{y}.pbf",
        get_fill_color=[193, 71, 43, 90],
        get_line_color=[109, 31, 18, 160],
        line_width_min_pixels=0.5,
        pickable=False,
    )
else:
    if not geojson_path.exists():
        st.error("Missing dataset: apps/streamlit-map/static/data/cadastre-batiments.json")
        st.stop()
    dataset_label = "/static/data/cadastre-batiments.json"
    layer = pdk.Layer(
        "GeoJsonLayer",
        dataset_label,
        stroked=True,
        filled=True,
        get_fill_color=[193, 71, 43, 90],
        get_line_color=[109, 31, 18, 160],
        line_width_min_pixels=0.5,
    )

deck = pdk.Deck(
    layers=[layer],
    initial_view_state=view_state,
    map_provider="carto",
    map_style="light",
)

st.pydeck_chart(deck, use_container_width=True)

st.markdown(
    """
<script>
document.getElementById('dataset-label').innerText = %s;
window.__MAP_READY = true;
window.__MAP_STATS = { mapLoadedMs: null, sourceLoadedMs: null, firstIdleMs: null };
</script>
""" % json.dumps(dataset_label),
    unsafe_allow_html=True,
)
