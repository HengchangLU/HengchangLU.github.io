import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { csvParse, csvFormat } from 'd3-dsv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');
const RAW_DIR = path.join(ROOT_DIR, 'data', 'raw');
const INTERMEDIATE_DIR = path.join(ROOT_DIR, 'data', 'intermediate');

const numberKeys = new Set(['', null, undefined]);

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function readCsv(filePath) {
  const rawText = fs.readFileSync(filePath, 'utf8');
  return csvParse(rawText);
}

function writeCsv(filePath, rows) {
  const text = csvFormat(rows, Object.keys(rows[0] ?? {}));
  fs.writeFileSync(filePath, text, 'utf8');
}

function toNumber(value) {
  if (numberKeys.has(value)) {
    return '';
  }
  const parsed = Number(String(value).trim());
  return Number.isFinite(parsed) ? parsed : '';
}

function cleanEarthquakes() {
  const filePath = path.join(RAW_DIR, 'earthquake_data_tsunami.csv');
  const rows = readCsv(filePath);
  const cleaned = [];

  rows.forEach((row, index) => {
    const magnitude = toNumber(row.magnitude);
    const latitude = toNumber(row.latitude);
    const longitude = toNumber(row.longitude);

    if (!Number.isFinite(magnitude) || magnitude < 2) {
      return;
    }
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return;
    }

    cleaned.push({
      event_id: `eq_${row.Year}_${row.Month}_${index}`,
      magnitude,
      depth_km: toNumber(row.depth),
      latitude,
      longitude,
      cdi: toNumber(row.cdi),
      mmi: toNumber(row.mmi),
      sig: toNumber(row.sig),
      nst: toNumber(row.nst),
      dmin: toNumber(row.dmin),
      gap: toNumber(row.gap),
      tsunami_flag: row.tsunami === '1' ? 1 : 0,
      year: toNumber(row.Year),
      month: toNumber(row.Month)
    });
  });

  if (cleaned.length === 0) {
    return;
  }

  writeCsv(path.join(INTERMEDIATE_DIR, 'earthquakes_clean.csv'), cleaned);
}

function cleanGdp() {
  const target = path.join(RAW_DIR, 'gdp', 'gdp.csv');
  const rows = readCsv(target);
  const longRows = [];

  rows.forEach((row) => {
    const countryName = row['Country Name'] ?? '';
    const countryCode = row['Code'] ?? '';

    Object.keys(row).forEach((key) => {
      if (/^\d{4}$/.test(key)) {
        const value = row[key];
        if (value === '' || value === null || value === undefined) {
          return;
        }
        const num = Number(String(value).replace(/,/g, '').trim());
        if (!Number.isFinite(num)) {
          return;
        }
        longRows.push({
          country_name: countryName,
          country_code: countryCode,
          year: Number(key),
          gdp_usd: num
        });
      }
    });
  });

  if (longRows.length === 0) {
    return;
  }

  writeCsv(path.join(INTERMEDIATE_DIR, 'gdp_total_clean.csv'), longRows);
}

function cleanGdpPerCapita() {
  const target = path.join(RAW_DIR, 'gdp', 'gdp_per_capita.csv');
  const rows = readCsv(target);
  const longRows = [];

  rows.forEach((row) => {
    const countryName = row['Country Name'] ?? '';
    const countryCode = row['Code'] ?? '';

    Object.keys(row).forEach((key) => {
      if (/^\d{4}$/.test(key)) {
        const value = row[key];
        if (value === '' || value === null || value === undefined) {
          return;
        }
        const num = Number(String(value).replace(/,/g, '').trim());
        if (!Number.isFinite(num)) {
          return;
        }
        longRows.push({
          country_name: countryName,
          country_code: countryCode,
          year: Number(key),
          gdp_per_capita_usd: num
        });
      }
    });
  });

  if (longRows.length === 0) {
    return;
  }

  writeCsv(path.join(INTERMEDIATE_DIR, 'gdp_per_capita_clean.csv'), longRows);
}

function cleanAirports() {
  const filePath = path.join(RAW_DIR, 'airports .csv');
  const rows = readCsv(filePath);
  const cleaned = rows
    .map((row) => {
      const latitude = toNumber(row.latitude_deg);
      const longitude = toNumber(row.longitude_deg);
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
        return null;
      }
      return {
        ident: row.ident ?? '',
        name: row.name ?? '',
        type: row.type ?? '',
        iso_country: row.iso_country ?? '',
        latitude,
        longitude
      };
    })
    .filter(Boolean);

  if (cleaned.length === 0) {
    return;
  }

  writeCsv(path.join(INTERMEDIATE_DIR, 'airports_clean.csv'), cleaned);
}

function cleanPorts() {
  const filePath = path.join(RAW_DIR, 'World_Port_Index.csv');
  const rows = readCsv(filePath);
  const cleaned = rows
    .map((row) => {
      const latitude = toNumber(row.LATITUDE ?? row.Y);
      const longitude = toNumber(row.LONGITUDE ?? row.X);
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
        return null;
      }
      return {
        index_no: row.INDEX_NO ?? '',
        port_name: row.PORT_NAME ?? '',
        country: row.COUNTRY ?? '',
        latitude,
        longitude
      };
    })
    .filter(Boolean);

  if (cleaned.length === 0) {
    return;
  }

  writeCsv(path.join(INTERMEDIATE_DIR, 'ports_clean.csv'), cleaned);
}

function cleanPowerplants() {
  const filePath = path.join(RAW_DIR, 'powerplants (global) - global_power_plants.csv');
  const rows = readCsv(filePath);
  const cleaned = rows
    .map((row) => {
      const latitude = toNumber(row.latitude);
      const longitude = toNumber(row.longitude);
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
        return null;
      }
      return {
        country_code: row['country code'] ?? '',
        country_name: row.country_long ?? '',
        plant_name: row['name of powerplant'] ?? '',
        capacity_mw: toNumber(row['capacity in MW']),
        primary_fuel: row.primary_fuel ?? '',
        latitude,
        longitude
      };
    })
    .filter(Boolean);

  if (cleaned.length === 0) {
    return;
  }

  writeCsv(path.join(INTERMEDIATE_DIR, 'powerplants_clean.csv'), cleaned);
}

function cleanNuclearPlants() {
  const filePath = path.join(RAW_DIR, 'energy-pop-exposure-nuclear-plants-locations_plants.csv');
  const rows = readCsv(filePath);
  const cleaned = rows
    .map((row) => {
      const latitude = toNumber(row.Latitude);
      const longitude = toNumber(row.Longitude);
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
        return null;
      }
      return {
        plant: row.Plant ?? '',
        country: row.Country ?? '',
        reactors: toNumber(row.NumReactor),
        latitude,
        longitude
      };
    })
    .filter(Boolean);

  if (cleaned.length === 0) {
    return;
  }

  writeCsv(path.join(INTERMEDIATE_DIR, 'nuclear_plants_clean.csv'), cleaned);
}

function run() {
  ensureDir(INTERMEDIATE_DIR);

  cleanEarthquakes();
  cleanGdp();
  cleanGdpPerCapita();
  cleanAirports();
  cleanPorts();
  cleanPowerplants();
  cleanNuclearPlants();
}

run();
