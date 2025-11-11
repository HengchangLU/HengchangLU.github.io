(() => {
  const MAP_ID = "global-map";
  const EARTHQUAKE_COUNT_ID = "earthquake-count";
  const DATA_URL = "data/processed/unified_dataset.csv";
  const EARTHQUAKE_DATASET_KEY = "earthquake";
  const MAGNITUDE_THRESHOLD = 6.5;
  const MAX_EVENTS = 500;

  function parseNumber(value) {
    const num = Number(value);
    return Number.isFinite(num) ? num : null;
  }

  function formatMagnitude(magnitude) {
    return magnitude !== null ? magnitude.toFixed(1) : "n/a";
  }

  function magnitudeToRadius(magnitude) {
    if (magnitude === null) {
      return 4;
    }
    const base = Math.max(magnitude - 4, 0);
    return 4 + base * 1.5;
  }

  function magnitudeToColor(magnitude) {
    if (magnitude === null) {
      return "#94a3b8";
    }
    if (magnitude >= 8) {
      return "#ef4444";
    }
    if (magnitude >= 7.5) {
      return "#f97316";
    }
    if (magnitude >= 7) {
      return "#facc15";
    }
    return "#38bdf8";
  }

  function buildPopupContent(row) {
    const magnitude = formatMagnitude(row.magnitude);
    const depth = row.depth_km !== null ? `${row.depth_km.toFixed(1)} km` : "n/a";
    const tsunamiFlag = row.tsunami_flag === 1 ? "Yes" : "No";
    const location = `${row.latitude.toFixed(3)}, ${row.longitude.toFixed(3)}`;

    return `
      <div class="popup">
        <strong>Magnitude:</strong> ${magnitude}<br/>
        <strong>Depth:</strong> ${depth}<br/>
        <strong>Tsunami:</strong> ${tsunamiFlag}<br/>
        <strong>Location:</strong> ${location}<br/>
        <strong>Date:</strong> ${row.year ?? "n/a"}-${row.month ?? "n/a"}
      </div>
    `;
  }

  function updateEarthquakeCount(count) {
    const target = document.getElementById(EARTHQUAKE_COUNT_ID);
    if (target) {
      target.textContent = count.toString();
    }
  }

  function parseRow(row) {
    if (row.dataset !== EARTHQUAKE_DATASET_KEY) {
      return null;
    }

    const latitude = parseNumber(row.latitude);
    const longitude = parseNumber(row.longitude);
    const magnitude = parseNumber(row.magnitude);

    if (
      latitude === null ||
      longitude === null ||
      magnitude === null ||
      magnitude < MAGNITUDE_THRESHOLD
    ) {
      return null;
    }

    return {
      magnitude,
      depth_km: parseNumber(row.depth_km),
      tsunami_flag: parseNumber(row.tsunami_flag),
      latitude,
      longitude,
      year: parseNumber(row.year),
      month: parseNumber(row.month)
    };
  }

  function init() {
    if (typeof L === "undefined" || typeof d3 === "undefined") {
      console.error("Leaflet or D3 failed to load.");
      return;
    }

    const mapElement = document.getElementById(MAP_ID);
    if (!mapElement) {
      console.error(`Map container with id "${MAP_ID}" not found.`);
      return;
    }

    const map = L.map(MAP_ID, {
      worldCopyJump: true,
      attributionControl: true
    }).setView([20, 0], 2);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 6,
      minZoom: 2,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map);

    d3.csv(DATA_URL, parseRow)
      .then((rows) => {
        const events = rows.slice(0, MAX_EVENTS);
        updateEarthquakeCount(events.length);

        const markers = L.layerGroup().addTo(map);

        events.forEach((event) => {
          const color = magnitudeToColor(event.magnitude);
          const radius = magnitudeToRadius(event.magnitude);

          L.circleMarker([event.latitude, event.longitude], {
            radius,
            color: "#0f172a",
            weight: 1,
            fillColor: color,
            fillOpacity: 0.8
          })
            .bindPopup(buildPopupContent(event))
            .addTo(markers);
        });
      })
      .catch((error) => {
        console.error("Unable to load map data:", error);
        mapElement.innerHTML = `<div class="map-error">Unable to load map data. ${error.message}</div>`;
      });
  }

  document.addEventListener("DOMContentLoaded", init);
})();

