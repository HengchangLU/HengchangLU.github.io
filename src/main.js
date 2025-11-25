(() => {
  const MAP_ID = "global-map";
  const DATA_URL = "data/processed/unified_dataset.csv";
  const TOPOJSON_URL = "data/world/countries-110m.json";
  const MAGNITUDE_THRESHOLD = 2.0;
  const MAX_EVENTS = 500;
  const MAX_INFRASTRUCTURE = 1000;

  function parseNumber(value) {
    if (value === '' || value === null || value === undefined) {
      return null;
    }
    const num = Number(value);
    return Number.isFinite(num) ? num : null;
  }

  function shuffleArray(array) {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }

  function formatMagnitude(magnitude) {
    return magnitude !== null ? magnitude.toFixed(1) : "n/a";
  }

  function formatNumber(num) {
    if (num === null || num === undefined) return "n/a";
    if (num >= 1e12) return `$${(num / 1e12).toFixed(2)}T`;
    if (num >= 1e9) return `$${(num / 1e9).toFixed(2)}B`;
    if (num >= 1e6) return `$${(num / 1e6).toFixed(2)}M`;
    return `$${num.toLocaleString()}`;
  }

  function magnitudeToRadius(magnitude) {
    if (magnitude === null) {
      return 3;
    }
    const minMagnitude = 2.0;
    const minRadius = 3;
    const magnitudeRange = Math.max(magnitude - minMagnitude, 0);
    return minRadius + magnitudeRange * 4;
  }

  function getEventColor(tsunamiFlag) {
    if (tsunamiFlag === 1) {
      return "#3b82f6";
    }
    return "#92400e";
  }

  function getInfrastructureIcon(dataset) {
    const colors = {
      airport: "#10b981",
      port: "#06b6d4",
      powerplant: "#f59e0b",
      nuclear_plant: "#ef4444"
    };
    const color = colors[dataset] || "#6b7280";
    return L.divIcon({
      className: "infrastructure-marker",
      html: `<div style="background-color: ${color}; width: 8px; height: 8px; border-radius: 50%; border: 1px solid white;"></div>`,
      iconSize: [8, 8]
    });
  }

  function interpolateColor(color1, color2, factor) {
    const hex = (color) => {
      const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(color);
      return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
      } : null;
    };
    
    const c1 = hex(color1);
    const c2 = hex(color2);
    if (!c1 || !c2) return color1;
    
    const r = Math.round(c1.r + (c2.r - c1.r) * factor);
    const g = Math.round(c1.g + (c2.g - c1.g) * factor);
    const b = Math.round(c1.b + (c2.b - c1.b) * factor);
    
    return "#" + [r, g, b].map(x => {
      const hex = x.toString(16);
      return hex.length === 1 ? "0" + hex : hex;
    }).join("");
  }

  function getGdpColorByRank(rank) {
    if (rank === null || rank === undefined || !Number.isFinite(rank)) {
      return "#d1d5db";
    }
    
    const normalized = Math.min(Math.max(rank, 0), 1);
    
    const colorStops = [
      { pos: 0.00, color: "#ffffff" },
      { pos: 0.05, color: "#fff9c4" },
      { pos: 0.10, color: "#fff59d" },
      { pos: 0.15, color: "#ffeb3b" },
      { pos: 0.22, color: "#ffc107" },
      { pos: 0.30, color: "#ff9800" },
      { pos: 0.38, color: "#ff5722" },
      { pos: 0.45, color: "#f44336" },
      { pos: 0.52, color: "#e91e63" },
      { pos: 0.60, color: "#9c27b0" },
      { pos: 0.68, color: "#673ab7" },
      { pos: 0.75, color: "#3f51b5" },
      { pos: 0.82, color: "#2196f3" },
      { pos: 0.88, color: "#1976d2" },
      { pos: 0.93, color: "#0d47a1" },
      { pos: 1.00, color: "#000051" }
    ];
    
    for (let i = 0; i < colorStops.length - 1; i++) {
      const stop1 = colorStops[i];
      const stop2 = colorStops[i + 1];
      
      if (normalized >= stop1.pos && normalized <= stop2.pos) {
        const range = stop2.pos - stop1.pos;
        const localFactor = range > 0 ? (normalized - stop1.pos) / range : 0;
        return interpolateColor(stop1.color, stop2.color, localFactor);
      }
    }
    
    return colorStops[colorStops.length - 1].color;
  }

  function getCountryName(properties) {
    return properties.name || properties.NAME || properties.NAME_LONG || 
           properties.NAME_EN || properties.ADMIN || "";
  }

  function buildCountryNameToCodeMap(gdpTotal, gdpPerCapita) {
    const nameToCode = {};
    const codeToName = {};
    
    [...gdpTotal, ...gdpPerCapita].forEach(row => {
      if (row.country && row.country_code) {
        const normalizedName = normalizeCountryName(row.country);
        if (!nameToCode[normalizedName]) {
          nameToCode[normalizedName] = row.country_code;
        }
        codeToName[row.country_code] = normalizedName;
      }
    });
    
    return { nameToCodeMap: nameToCode, codeToNameMap: codeToName };
  }
  
  function findCountryCode(topojsonName, nameToCodeMap, codeToNameMap) {
    if (!topojsonName) return null;
    
    const normalized = normalizeCountryName(topojsonName);
    
    if (nameToCodeMap[normalized]) {
      return nameToCodeMap[normalized];
    }
    
    for (const [gdpName, code] of Object.entries(nameToCodeMap)) {
      if (normalized.includes(gdpName) || gdpName.includes(normalized)) {
        return code;
      }
    }
    
    return null;
  }

  function normalizeCountryName(name) {
    if (!name) return "";
    let normalized = name.toLowerCase().trim();
    const variations = {
      "united states of america": "united states",
      "united states": "united states",
      "usa": "united states",
      "russia": "russian federation",
      "south korea": "korea, rep.",
      "north korea": "korea, dem. people's rep.",
      "uk": "united kingdom",
      "united kingdom": "united kingdom"
    };
    return variations[normalized] || normalized;
  }

  function buildEarthquakePopup(row, gdpData) {
    const magnitude = formatMagnitude(row.magnitude);
    const depth = row.depth_km !== null ? `${row.depth_km.toFixed(1)} km` : "n/a";
    const tsunamiFlag = row.tsunami_flag === 1 ? "Yes" : "No";
    const location = `${row.latitude.toFixed(3)}, ${row.longitude.toFixed(3)}`;
    
    let gdpInfo = "";
    if (row.year && row.country_code) {
      const gdp = gdpData[`${row.country_code}_${row.year}`];
      if (gdp) {
        gdpInfo = `<br/><strong>GDP (${row.year}):</strong> ${gdp.total ? formatNumber(gdp.total) : "n/a"}<br/>`;
        gdpInfo += `<strong>GDP per Capita:</strong> ${gdp.perCapita ? formatNumber(gdp.perCapita) : "n/a"}`;
      }
    }

    const infrastructureInfo = `
      <br/><strong>Infrastructure within 100km:</strong><br/>
      Airports: ${row.airports_within_100km || 0}<br/>
      Ports: ${row.ports_within_100km || 0}<br/>
      Power Plants: ${row.powerplants_within_100km || 0}<br/>
      Nuclear Plants: ${row.nuclear_plants_within_100km || 0}
    `;

    return `
      <div class="popup">
        <strong>Magnitude:</strong> ${magnitude}<br/>
        <strong>Depth:</strong> ${depth}<br/>
        <strong>Tsunami:</strong> ${tsunamiFlag}<br/>
        <strong>Location:</strong> ${location}<br/>
        <strong>Date:</strong> ${row.year ?? "n/a"}-${row.month ?? "n/a"}
        ${gdpInfo}
        ${infrastructureInfo}
      </div>
    `;
  }

  function buildInfrastructurePopup(row) {
    let content = `<div class="popup"><strong>${row.name || row.record_id}</strong><br/>`;
    
    if (row.country) {
      content += `<strong>Country:</strong> ${row.country}<br/>`;
    }
    
    if (row.dataset === "airport") {
      content += `<strong>Type:</strong> ${row.feature_type || "Airport"}<br/>`;
    } else if (row.dataset === "port") {
      content += `<strong>Type:</strong> Port<br/>`;
    } else if (row.dataset === "powerplant") {
      if (row.capacity_mw) {
        content += `<strong>Capacity:</strong> ${row.capacity_mw.toLocaleString()} MW<br/>`;
      }
      if (row.primary_fuel) {
        content += `<strong>Fuel Type:</strong> ${row.primary_fuel}<br/>`;
      }
    } else if (row.dataset === "nuclear_plant") {
      if (row.reactors) {
        content += `<strong>Reactors:</strong> ${row.reactors}<br/>`;
      }
    }
    
    if (row.latitude && row.longitude) {
      content += `<strong>Location:</strong> ${row.latitude.toFixed(3)}, ${row.longitude.toFixed(3)}<br/>`;
    }
    
    content += `</div>`;
    return content;
  }

  function parseRow(row) {
    const dataset = row.dataset || "";
    const latitude = parseNumber(row.latitude);
    const longitude = parseNumber(row.longitude);

    if (["airport", "port", "powerplant", "nuclear_plant", "earthquake"].includes(dataset)) {
      if (latitude === null || longitude === null) {
        return null;
      }
    }

    const parsed = {
      dataset,
      record_id: row.record_id || "",
      name: row.name || "",
      country: row.country || "",
      country_code: row.country_code || "",
      latitude,
      longitude,
      year: parseNumber(row.year),
      month: parseNumber(row.month),
      magnitude: parseNumber(row.magnitude),
      depth_km: parseNumber(row.depth_km),
      tsunami_flag: parseNumber(row.tsunami_flag),
      feature_type: row.feature_type || "",
      capacity_mw: parseNumber(row.capacity_mw),
      primary_fuel: row.primary_fuel || "",
      reactors: parseNumber(row.reactors),
      airports_within_100km: parseNumber(row.airports_within_100km),
      ports_within_100km: parseNumber(row.ports_within_100km),
      powerplants_within_100km: parseNumber(row.powerplants_within_100km),
      nuclear_plants_within_100km: parseNumber(row.nuclear_plants_within_100km)
    };

    if (dataset === "earthquake") {
      if (parsed.magnitude === null || parsed.magnitude <= MAGNITUDE_THRESHOLD) {
        return null;
      }
    }

    if (dataset === "gdp_total" || dataset === "gdp_per_capita") {
      parsed.value = parseNumber(row.value);
      parsed.value_type = row.value_type || "";
    }

    return parsed;
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
      noWrap: false,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map);

    const earthquakeLayer = L.layerGroup();
    const airportLayer = L.layerGroup();
    const portLayer = L.layerGroup();
    const powerplantLayer = L.layerGroup();
    const nuclearPlantLayer = L.layerGroup();

    const overlayMaps = {
      "Earthquakes & Tsunamis": earthquakeLayer,
      "Airports": airportLayer,
      "Ports": portLayer,
      "Power Plants": powerplantLayer,
      "Nuclear Plants": nuclearPlantLayer
    };

    L.control.layers(null, overlayMaps, { collapsed: false }).addTo(map);

    const legendControl = L.control({ position: "bottomleft" });
    legendControl.onAdd = function() {
      const div = L.DomUtil.create("div", "legend-control");
      div.innerHTML = `
        <div class="legend-container">
          <div class="legend-title">Legend</div>
          
          <div class="legend-section">
            <div class="legend-section-title">GDP Level</div>
            <div class="gdp-legend">
              <div class="gdp-gradient"></div>
              <div class="gdp-labels">
                <span>Low</span>
                <span>High</span>
              </div>
            </div>
          </div>
          
          <div class="legend-section">
            <div class="legend-section-title">Earthquake Type</div>
            <div class="earthquake-legend">
              <div class="legend-item">
                <div class="legend-symbol" style="background-color: #92400e; width: 12px; height: 12px; border-radius: 50%;"></div>
                <span>Earthquake</span>
              </div>
              <div class="legend-item">
                <div class="legend-symbol" style="background-color: #3b82f6; width: 12px; height: 12px; border-radius: 50%;"></div>
                <span>Tsunami</span>
              </div>
            </div>
          </div>
        </div>
      `;
      
      L.DomEvent.disableClickPropagation(div);
      return div;
    };
    legendControl.addTo(map);

    d3.csv(DATA_URL)
      .then((rows) => {
        const parsedRows = rows.map(parseRow).filter(row => row !== null);
        
        const earthquakes = parsedRows.filter(r => r.dataset === "earthquake");
        const airports = parsedRows.filter(r => r.dataset === "airport");
        const ports = parsedRows.filter(r => r.dataset === "port");
        const powerplants = parsedRows.filter(r => r.dataset === "powerplant");
        const nuclearPlants = parsedRows.filter(r => r.dataset === "nuclear_plant");
        const gdpTotal = parsedRows.filter(r => r.dataset === "gdp_total");
        const gdpPerCapita = parsedRows.filter(r => r.dataset === "gdp_per_capita");

        const gdpData = {};
        gdpTotal.forEach(row => {
          const key = `${row.country_code}_${row.year}`;
          if (!gdpData[key]) {
            gdpData[key] = {};
          }
          gdpData[key].total = row.value;
        });
        gdpPerCapita.forEach(row => {
          const key = `${row.country_code}_${row.year}`;
          if (!gdpData[key]) {
            gdpData[key] = {};
          }
          gdpData[key].perCapita = row.value;
        });

        const earthquakesByYearMonth = {};
        earthquakes.forEach(event => {
          const year = event.year;
          const month = event.month;
          if (year !== null && year >= 2001 && month !== null) {
            const yearMonthKey = `${year}-${String(month).padStart(2, '0')}`;
            if (!earthquakesByYearMonth[yearMonthKey]) {
              earthquakesByYearMonth[yearMonthKey] = [];
            }
            earthquakesByYearMonth[yearMonthKey].push(event);
          }
        });

        const airportsByYear = {};
        const portsByYear = {};
        const powerplantsByYear = {};
        const nuclearPlantsByYear = {};
        const airportsNoYear = [];
        const portsNoYear = [];
        const powerplantsNoYear = [];
        const nuclearPlantsNoYear = [];

        airports.forEach(airport => {
          if (airport.year !== null && airport.year >= 2001) {
            if (!airportsByYear[airport.year]) {
              airportsByYear[airport.year] = [];
            }
            airportsByYear[airport.year].push(airport);
          } else if (airport.year === null) {
            airportsNoYear.push(airport);
          }
        });

        ports.forEach(port => {
          if (port.year !== null && port.year >= 2001) {
            if (!portsByYear[port.year]) {
              portsByYear[port.year] = [];
            }
            portsByYear[port.year].push(port);
          } else if (port.year === null) {
            portsNoYear.push(port);
          }
        });

        powerplants.forEach(plant => {
          if (plant.year !== null && plant.year >= 2001) {
            if (!powerplantsByYear[plant.year]) {
              powerplantsByYear[plant.year] = [];
            }
            powerplantsByYear[plant.year].push(plant);
          } else if (plant.year === null) {
            powerplantsNoYear.push(plant);
          }
        });

        nuclearPlants.forEach(plant => {
          if (plant.year !== null && plant.year >= 2001) {
            if (!nuclearPlantsByYear[plant.year]) {
              nuclearPlantsByYear[plant.year] = [];
            }
            nuclearPlantsByYear[plant.year].push(plant);
          } else if (plant.year === null) {
            nuclearPlantsNoYear.push(plant);
          }
        });

        const allYearMonths = [];
        for (let year = 2001; year <= 2020; year++) {
          for (let month = 1; month <= 12; month++) {
            const yearMonthKey = `${year}-${String(month).padStart(2, '0')}`;
            if (earthquakesByYearMonth[yearMonthKey] || year < 2020 || (year === 2020 && month <= 12)) {
              allYearMonths.push(yearMonthKey);
            }
          }
        }
        
        const availableYearMonths = allYearMonths;
        const minYearMonth = availableYearMonths.length > 0 ? availableYearMonths[0] : "2001-01";
        const maxYearMonth = availableYearMonths.length > 0 ? availableYearMonths[availableYearMonths.length - 1] : "2020-12";
        const defaultYearMonth = availableYearMonths.length > 0 ? availableYearMonths[availableYearMonths.length - 1] : "2020-12";
        
        function formatYearMonth(yearMonthKey) {
          const [year, month] = yearMonthKey.split('-');
          const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
          return `${monthNames[parseInt(month) - 1]} ${year}`;
        }
        
        window.formatYearMonth = formatYearMonth;
        
        const earthquakeMarkers = [];
        const airportMarkers = [];
        const portMarkers = [];
        const powerplantMarkers = [];
        const nuclearPlantMarkers = [];

        function updateLayersForYearMonth(yearMonthKey) {
          earthquakeLayer.clearLayers();
          airportLayer.clearLayers();
          portLayer.clearLayers();
          powerplantLayer.clearLayers();
          nuclearPlantLayer.clearLayers();

          const yearMonthEarthquakes = earthquakesByYearMonth[yearMonthKey] || [];
          const eventsToShow = yearMonthEarthquakes.slice(0, MAX_EVENTS);
          const year = parseInt(yearMonthKey.split('-')[0]);
          eventsToShow.forEach((event) => {
            const color = getEventColor(event.tsunami_flag);
            const radius = magnitudeToRadius(event.magnitude);

            const marker = L.circleMarker([event.latitude, event.longitude], {
              radius,
              color: "#0f172a",
              weight: 1,
              fillColor: color,
              fillOpacity: 0.8
            })
              .bindPopup(buildEarthquakePopup(event, gdpData))
              .addTo(earthquakeLayer);
            earthquakeMarkers.push(marker);
          });

          const yearAirports = airportsByYear[year] || [];
          yearAirports.slice(0, MAX_INFRASTRUCTURE).forEach((airport) => {
            const marker = L.marker([airport.latitude, airport.longitude], {
              icon: getInfrastructureIcon("airport")
            })
              .bindPopup(buildInfrastructurePopup(airport))
              .addTo(airportLayer);
            airportMarkers.push(marker);
          });

          airportsNoYear.slice(0, MAX_INFRASTRUCTURE).forEach((airport) => {
            const marker = L.marker([airport.latitude, airport.longitude], {
              icon: getInfrastructureIcon("airport")
            })
              .bindPopup(buildInfrastructurePopup(airport))
              .addTo(airportLayer);
            airportMarkers.push(marker);
          });

          const yearPorts = portsByYear[year] || [];
          yearPorts.slice(0, MAX_INFRASTRUCTURE).forEach((port) => {
            const marker = L.marker([port.latitude, port.longitude], {
              icon: getInfrastructureIcon("port")
            })
              .bindPopup(buildInfrastructurePopup(port))
              .addTo(portLayer);
            portMarkers.push(marker);
          });
          portsNoYear.slice(0, MAX_INFRASTRUCTURE).forEach((port) => {
            const marker = L.marker([port.latitude, port.longitude], {
              icon: getInfrastructureIcon("port")
            })
              .bindPopup(buildInfrastructurePopup(port))
              .addTo(portLayer);
            portMarkers.push(marker);
          });

          const yearPowerplants = powerplantsByYear[year] || [];
          yearPowerplants.slice(0, MAX_INFRASTRUCTURE).forEach((plant) => {
            const marker = L.marker([plant.latitude, plant.longitude], {
              icon: getInfrastructureIcon("powerplant")
            })
              .bindPopup(buildInfrastructurePopup(plant))
              .addTo(powerplantLayer);
            powerplantMarkers.push(marker);
          });
          powerplantsNoYear.slice(0, MAX_INFRASTRUCTURE).forEach((plant) => {
            const marker = L.marker([plant.latitude, plant.longitude], {
              icon: getInfrastructureIcon("powerplant")
            })
              .bindPopup(buildInfrastructurePopup(plant))
              .addTo(powerplantLayer);
            powerplantMarkers.push(marker);
          });

          const yearNuclearPlants = nuclearPlantsByYear[year] || [];
          yearNuclearPlants.forEach((plant) => {
            const marker = L.marker([plant.latitude, plant.longitude], {
              icon: getInfrastructureIcon("nuclear_plant")
            })
              .bindPopup(buildInfrastructurePopup(plant))
              .addTo(nuclearPlantLayer);
            nuclearPlantMarkers.push(marker);
          });
          nuclearPlantsNoYear.forEach((plant) => {
            const marker = L.marker([plant.latitude, plant.longitude], {
              icon: getInfrastructureIcon("nuclear_plant")
            })
              .bindPopup(buildInfrastructurePopup(plant))
              .addTo(nuclearPlantLayer);
            nuclearPlantMarkers.push(marker);
          });
        }

        earthquakeLayer.addTo(map);
        
        window.updateLayersForYearMonth = updateLayersForYearMonth;
        window.yearMonthData = {
          minYearMonth: minYearMonth,
          maxYearMonth: maxYearMonth,
          defaultYearMonth: defaultYearMonth,
          allYearMonths: availableYearMonths
        };
        
        updateLayersForYearMonth(defaultYearMonth);
        
        let currentYearMonthIndex = availableYearMonths.indexOf(defaultYearMonth);
        if (currentYearMonthIndex === -1) currentYearMonthIndex = availableYearMonths.length - 1;
        let isPlaying = false;
        let playInterval = null;
        const playSpeed = 500; // milliseconds per month
        let isMapLocked = false;
        
        const sliderContainer = document.createElement("div");
        sliderContainer.className = "time-slider-control";
        sliderContainer.style.position = "absolute";
        sliderContainer.style.bottom = "20px";
        sliderContainer.style.left = "50%";
        sliderContainer.style.transform = "translateX(-50%)";
        sliderContainer.style.zIndex = "1000";
        sliderContainer.innerHTML = `
          <div class="time-slider-container">
            <div class="time-slider-header">
              <span class="current-year-display" id="current-year-display">${formatYearMonth(defaultYearMonth)}</span>
              <div class="time-slider-buttons">
                <button class="lock-btn" id="lock-btn" aria-label="Lock Map" title="Lock/Unlock Map View">
                  <span id="lock-icon">🔒</span>
                </button>
                <button class="play-pause-btn" id="play-pause-btn" aria-label="Play/Pause">
                  <span id="play-pause-icon">▶</span>
                </button>
                <button class="fullscreen-btn" id="fullscreen-btn" aria-label="Fullscreen" title="Toggle Fullscreen">
                  <span id="fullscreen-icon">⛶</span>
                </button>
              </div>
            </div>
            <div class="time-slider-wrapper">
              <input 
                type="range" 
                id="time-slider" 
                min="0" 
                max="${availableYearMonths.length - 1}" 
                value="${currentYearMonthIndex}" 
                step="1"
                class="time-slider-input"
              />
              <div class="time-slider-labels">
                <span>${formatYearMonth(minYearMonth)}</span>
                <span>${formatYearMonth(maxYearMonth)}</span>
              </div>
            </div>
          </div>
        `;
        
        const mapElement = document.getElementById(MAP_ID);
        if (mapElement) {
          mapElement.appendChild(sliderContainer);
          
          sliderContainer.addEventListener("mousedown", (e) => {
            e.stopPropagation();
          });
          
          sliderContainer.addEventListener("touchstart", (e) => {
            e.stopPropagation();
          });
          
          sliderContainer.addEventListener("click", (e) => {
            e.stopPropagation();
          });
        }
        
        function updateYearMonth(index) {
          if (index < 0 || index >= availableYearMonths.length) return;
          currentYearMonthIndex = index;
          const yearMonthKey = availableYearMonths[index];
          
          const slider = document.getElementById("time-slider");
          const display = document.getElementById("current-year-display");
          if (slider) slider.value = index;
          if (display) display.textContent = formatYearMonth(yearMonthKey);
          
          const year = parseInt(yearMonthKey.split('-')[0]);
          
          if (window.updateGdpLayer) {
            window.updateGdpLayer(year);
          }
          
          if (window.updateLayersForYearMonth) {
            window.updateLayersForYearMonth(yearMonthKey);
          }
        }
        
        function startPlaying() {
          if (isPlaying) return;
          isPlaying = true;
          const playIcon = document.getElementById("play-pause-icon");
          if (playIcon) playIcon.textContent = "⏸";
          
          playInterval = setInterval(() => {
            let nextIndex = currentYearMonthIndex + 1;
            if (nextIndex >= availableYearMonths.length) {
              nextIndex = 0;
            }
            updateYearMonth(nextIndex);
          }, playSpeed);
        }

        function stopPlaying() {
          if (!isPlaying) return;
          isPlaying = false;
          const playIcon = document.getElementById("play-pause-icon");
          if (playIcon) playIcon.textContent = "▶";
          
          if (playInterval) {
            clearInterval(playInterval);
            playInterval = null;
          }
        }

        function togglePlay() {
          if (isPlaying) {
            stopPlaying();
          } else {
            startPlaying();
          }
        }
        
        window.updateYearMonth = updateYearMonth;
        
        function toggleMapLock() {
          isMapLocked = !isMapLocked;
          const lockIcon = document.getElementById("lock-icon");
          const lockBtn = document.getElementById("lock-btn");
          
          if (isMapLocked) {
            map.dragging.disable();
            map.touchZoom.disable();
            map.doubleClickZoom.disable();
            map.scrollWheelZoom.disable();
            map.boxZoom.disable();
            map.keyboard.disable();
            if (lockIcon) lockIcon.textContent = "🔓";
            if (lockBtn) lockBtn.style.background = "#10b981";
          } else {
            map.dragging.enable();
            map.touchZoom.enable();
            map.doubleClickZoom.enable();
            map.scrollWheelZoom.enable();
            map.boxZoom.enable();
            map.keyboard.enable();
            if (lockIcon) lockIcon.textContent = "🔒";
            if (lockBtn) lockBtn.style.background = "#3b82f6";
          }
        }
        
        function toggleFullscreen() {
          const mapContainer = document.querySelector(".map-container");
          if (!mapContainer) return;
          
          if (!document.fullscreenElement) {
            mapContainer.requestFullscreen().catch(err => {
              console.error("Error attempting to enable fullscreen:", err);
            });
          } else {
            document.exitFullscreen();
          }
        }
        
        function updateFullscreenIcon() {
          const fullscreenIcon = document.getElementById("fullscreen-icon");
          if (fullscreenIcon) {
            fullscreenIcon.textContent = document.fullscreenElement ? "⛶" : "⛶";
          }
        }
        
        document.addEventListener("fullscreenchange", updateFullscreenIcon);
        
        setTimeout(() => {
          const slider = document.getElementById("time-slider");
          const playPauseBtn = document.getElementById("play-pause-btn");
          const lockBtn = document.getElementById("lock-btn");
          const fullscreenBtn = document.getElementById("fullscreen-btn");
          
          if (slider) {
            slider.addEventListener("mousedown", (e) => {
              e.stopPropagation();
              if (!isMapLocked) {
                map.dragging.disable();
                map.touchZoom.disable();
              }
            });
            
            slider.addEventListener("mouseup", (e) => {
              e.stopPropagation();
              if (!isMapLocked) {
                map.dragging.enable();
                map.touchZoom.enable();
              }
            });
            
            slider.addEventListener("touchstart", (e) => {
              e.stopPropagation();
              if (!isMapLocked) {
                map.dragging.disable();
                map.touchZoom.disable();
              }
            });
            
            slider.addEventListener("touchend", (e) => {
              e.stopPropagation();
              if (!isMapLocked) {
                map.dragging.enable();
                map.touchZoom.enable();
              }
            });
            
            slider.addEventListener("input", (e) => {
              e.stopPropagation();
              const index = parseInt(e.target.value);
              stopPlaying();
              updateYearMonth(index);
            });
            
            slider.addEventListener("change", (e) => {
              e.stopPropagation();
            });
          }
          
          if (playPauseBtn) {
            playPauseBtn.addEventListener("click", (e) => {
              e.stopPropagation();
              togglePlay();
            });
          }
          
          if (lockBtn) {
            lockBtn.addEventListener("click", (e) => {
              e.stopPropagation();
              toggleMapLock();
            });
          }
          
          if (fullscreenBtn) {
            fullscreenBtn.addEventListener("click", (e) => {
              e.stopPropagation();
              toggleFullscreen();
            });
          }
        }, 100);

        if (typeof topojson === "undefined") {
          console.error("topojson library not loaded");
        } else {
          d3.json(TOPOJSON_URL)
            .then((topology) => {
              const countriesTopo = topology.objects.countries;
              if (!countriesTopo) {
                console.error("No 'countries' object found in TopoJSON. Available objects:", Object.keys(topology.objects));
                return;
              }
              
              const countries = topojson.feature(topology, countriesTopo);
              
              countries.features.forEach(feature => {
                const normalizeRing = (ring) => {
                  const lons = ring.map(c => c[0]);
                  const minLon = Math.min(...lons);
                  const maxLon = Math.max(...lons);
                  
                  const hasNegative = lons.some(l => l < -100);
                  const hasPositive = lons.some(l => l > 100);
                  const crossesDateline = hasNegative && hasPositive && (maxLon - minLon > 180);
                  
                  if (crossesDateline) {
                    return ring.map(coord => {
                      let lon = coord[0];
                      if (lon < 0) lon += 360;
                      if (lon > 180) lon = 180;
                      if (lon > 180) lon -= 360;
                      return [lon, coord[1]];
                    });
                  } else {
                    return ring.map(coord => {
                      let lon = coord[0];
                      while (lon > 180) lon -= 360;
                      while (lon < -180) lon += 360;
                      return [lon, coord[1]];
                    });
                  }
                };
                
                if (feature.geometry && feature.geometry.type === "Polygon") {
                  feature.geometry.coordinates = feature.geometry.coordinates.map(normalizeRing);
                } else if (feature.geometry && feature.geometry.type === "MultiPolygon") {
                  feature.geometry.coordinates = feature.geometry.coordinates.map(polygon =>
                    polygon.map(normalizeRing)
                  );
                }
              });
              
              countries.features = countries.features.filter(feature => {
                const countryName = getCountryName(feature.properties).toLowerCase();
                return !countryName.includes('antarctica') && !countryName.includes('antartica');
              });
              
              const { nameToCodeMap, codeToNameMap } = buildCountryNameToCodeMap(gdpTotal, gdpPerCapita);
              
              const yearMonthData = window.yearMonthData || { defaultYearMonth: "2020-12" };
              const defaultYearMonth = yearMonthData.defaultYearMonth || "2020-12";
              const defaultYear = parseInt(defaultYearMonth.split('-')[0]);
              
              console.log("Loading GDP choropleth for default year-month", defaultYearMonth);
              console.log("Name to code map size:", Object.keys(nameToCodeMap).length);
              console.log("GDP data keys sample:", Object.keys(gdpData).slice(0, 10));
              
              const gdpValuesForYear = gdpTotal.filter(r => r.year === defaultYear).map(r => r.value).filter(v => v !== null);
              const maxGdp = gdpValuesForYear.length > 0 ? Math.max(...gdpValuesForYear) : 1;
              const minGdp = gdpValuesForYear.length > 0 ? Math.min(...gdpValuesForYear) : 0;
              console.log("GDP range for year", defaultYear, ":", formatNumber(minGdp), "to", formatNumber(maxGdp));

              let gdpLayer = null;
              
              function updateGdpLayer(year) {
                if (gdpLayer) {
                  map.removeLayer(gdpLayer);
                }

                const gdpValuesForYear = gdpTotal
                  .filter(r => r.year === year && r.value !== null && Number.isFinite(r.value))
                  .map(r => r.value);
                
                const sortedGdpValues = [...gdpValuesForYear].sort((a, b) => a - b);
                
                const gdpValueToRank = new Map();
                if (sortedGdpValues.length > 0) {
                  const valuePositions = new Map();
                  sortedGdpValues.forEach((value, index) => {
                    if (!valuePositions.has(value)) {
                      valuePositions.set(value, []);
                    }
                    valuePositions.get(value).push(index);
                  });
                  
                  const totalCountries = sortedGdpValues.length;
                  valuePositions.forEach((positions, value) => {
                    const avgPosition = positions.reduce((sum, pos) => sum + pos, 0) / positions.length;
                    const rank = totalCountries > 1 ? avgPosition / (totalCountries - 1) : 0.5;
                    gdpValueToRank.set(value, rank);
                  });
                }
                
                console.log(`GDP ranking for year ${year}: ${sortedGdpValues.length} countries, range: ${formatNumber(sortedGdpValues[0])} to ${formatNumber(sortedGdpValues[sortedGdpValues.length - 1])}`);

                const validCountries = {
                  type: "FeatureCollection",
                  features: countries.features.filter(feature => {
                    if (!feature.geometry || !feature.geometry.coordinates) return false;
                    try {
                      const coords = feature.geometry.coordinates;
                      const flat = coords.flat(Infinity);
                      const lons = flat.filter((_, i) => i % 2 === 0);
                      const validLons = lons.every(lon => lon >= -180 && lon <= 180);
                      return validLons;
                    } catch (e) {
                      return false;
                    }
                  })
                };
                
                gdpLayer = L.geoJSON(validCountries, {
                  style: (feature) => {
                    const countryName = getCountryName(feature.properties);
                    const countryCode = findCountryCode(countryName, nameToCodeMap, codeToNameMap);
                    const gdpKey = countryCode ? `${countryCode}_${year}` : null;
                    const gdp = gdpKey ? gdpData[gdpKey] : null;
                    const value = gdp ? gdp.total : null;
                    
                    let rank = null;
                    if (value !== null && Number.isFinite(value) && gdpValueToRank.has(value)) {
                      rank = gdpValueToRank.get(value);
                    }
                    
                    const color = getGdpColorByRank(rank);
                    
                    if (Math.random() < 0.01) {
                      const rankStr = rank !== null ? rank.toFixed(3) : "n/a";
                      console.log("Country:", countryName, "GDP:", value ? formatNumber(value) : "n/a", "Rank:", rankStr, "Color:", color);
                    }
                    
                    return {
                      fillColor: color,
                      fillOpacity: value !== null ? 0.95 : 0.2,
                      color: "#333",
                      weight: 0.5,
                      opacity: 1.0
                    };
                  },
                  onEachFeature: (feature, layer) => {
                    const countryName = getCountryName(feature.properties);
                    const countryCode = findCountryCode(countryName, nameToCodeMap, codeToNameMap);
                    const gdpKey = countryCode ? `${countryCode}_${year}` : null;
                    const gdp = gdpKey ? gdpData[gdpKey] : null;
                    
                    const popupContent = `
                      <div class="popup">
                        <strong>${countryName}</strong><br/>
                        <strong>Country Code:</strong> ${countryCode || "n/a"}<br/>
                        <strong>Year:</strong> ${year}<br/>
                        <strong>GDP Total:</strong> ${gdp && gdp.total ? formatNumber(gdp.total) : "n/a"}<br/>
                        <strong>GDP per Capita:</strong> ${gdp && gdp.perCapita ? formatNumber(gdp.perCapita) : "n/a"}
                      </div>
                    `;
                    
                    layer.bindPopup(popupContent);
                    }
                  });

                try {
                  if (gdpLayer) {
                    gdpLayer.addTo(map);
                    gdpLayer.bringToBack();
                    console.log("GDP layer added to map for year", year, "with", countries.features.length, "countries");
                  } else {
                    console.error("Failed to create GDP layer");
                  }
                } catch (error) {
                  console.error("Error adding GDP layer to map:", error);
                }
              }

              window.updateGdpLayer = updateGdpLayer;
              updateGdpLayer(defaultYear);
              
              if (window.updateYearMonth && yearMonthData.allYearMonths) {
                const defaultIndex = yearMonthData.allYearMonths.indexOf(defaultYearMonth);
                if (defaultIndex >= 0) {
                  window.updateYearMonth(defaultIndex);
                }
              }
            })
            .catch((error) => {
              console.error("Unable to load TopoJSON:", error);
            });
        }
      })
      .catch((error) => {
        console.error("Unable to load map data:", error);
        mapElement.innerHTML = `<div class="map-error">Unable to load map data. ${error.message}</div>`;
      });
  }

  document.addEventListener("DOMContentLoaded", init);
})();