import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { csvParse, csvFormat } from 'd3-dsv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');
const INTERMEDIATE_DIR = path.join(ROOT_DIR, 'data', 'intermediate');
const PROCESSED_DIR = path.join(ROOT_DIR, 'data', 'processed');

const UNIFIED_COLUMNS = [
  'dataset',
  'record_id',
  'name',
  'country',
  'country_code',
  'year',
  'month',
  'magnitude',
  'depth_km',
  'tsunami_flag',
  'cdi',
  'mmi',
  'sig',
  'nst',
  'dmin',
  'gap',
  'value',
  'value_type',
  'capacity_mw',
  'primary_fuel',
  'reactors',
  'feature_type',
  'latitude',
  'longitude',
  'airports_within_100km',
  'ports_within_100km',
  'powerplants_within_100km',
  'nuclear_plants_within_100km'
];

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function readCsv(filePath) {
  if (!fs.existsSync(filePath)) {
    return [];
  }
  const rawText = fs.readFileSync(filePath, 'utf8');
  return csvParse(rawText);
}

function writeCsv(filePath, rows, columns) {
  if (rows.length === 0) {
    return;
  }
  const text = csvFormat(rows, columns);
  fs.writeFileSync(filePath, text, 'utf8');
}

function parseNumber(value) {
  const parsed = Number(String(value ?? '').trim());
  return Number.isFinite(parsed) ? parsed : NaN;
}

function safeNumber(value) {
  return Number.isFinite(value) ? value : '';
}

function safeString(value) {
  return value === undefined || value === null ? '' : String(value);
}

function toPoint(latitude, longitude) {
  return { latitude, longitude };
}

function distanceKm(a, b) {
  if (!Number.isFinite(a.latitude) || !Number.isFinite(a.longitude) || !Number.isFinite(b.latitude) || !Number.isFinite(b.longitude)) {
    return Infinity;
  }
  const rad = Math.PI / 180;
  const lat1 = a.latitude * rad;
  const lat2 = b.latitude * rad;
  const dLat = (b.latitude - a.latitude) * rad;
  const dLon = (b.longitude - a.longitude) * rad;

  const sinLat = Math.sin(dLat / 2);
  const sinLon = Math.sin(dLon / 2);
  const h = sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLon * sinLon;
  const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  return 6371 * c;
}

function countWithinRadius(origin, points, radiusKm) {
  let count = 0;
  for (let i = 0; i < points.length; i += 1) {
    if (distanceKm(origin, points[i]) <= radiusKm) {
      count += 1;
    }
  }
  return count;
}

function buildUnifiedDataset() {
  const unified = [];

  const earthquakes = readCsv(path.join(INTERMEDIATE_DIR, 'earthquakes_clean.csv')).map((row) => ({
    event_id: row.event_id,
    latitude: parseNumber(row.latitude),
    longitude: parseNumber(row.longitude),
    magnitude: parseNumber(row.magnitude),
    depth_km: parseNumber(row.depth_km),
    cdi: parseNumber(row.cdi),
    mmi: parseNumber(row.mmi),
    sig: parseNumber(row.sig),
    nst: parseNumber(row.nst),
    dmin: parseNumber(row.dmin),
    gap: parseNumber(row.gap),
    tsunami_flag: parseNumber(row.tsunami_flag),
    year: parseNumber(row.year),
    month: parseNumber(row.month)
  })).filter((row) => Number.isFinite(row.latitude) && Number.isFinite(row.longitude));

  const airports = readCsv(path.join(INTERMEDIATE_DIR, 'airports_clean.csv')).map((row) => ({
    ident: safeString(row.ident),
    name: safeString(row.name),
    type: safeString(row.type),
    iso_country: safeString(row.iso_country),
    latitude: parseNumber(row.latitude),
    longitude: parseNumber(row.longitude)
  })).filter((row) => Number.isFinite(row.latitude) && Number.isFinite(row.longitude));

  const ports = readCsv(path.join(INTERMEDIATE_DIR, 'ports_clean.csv')).map((row) => ({
    index_no: safeString(row.index_no),
    port_name: safeString(row.port_name),
    country: safeString(row.country),
    latitude: parseNumber(row.latitude),
    longitude: parseNumber(row.longitude)
  })).filter((row) => Number.isFinite(row.latitude) && Number.isFinite(row.longitude));

  const powerplants = readCsv(path.join(INTERMEDIATE_DIR, 'powerplants_clean.csv')).map((row) => ({
    country_code: safeString(row.country_code),
    country_name: safeString(row.country_name),
    plant_name: safeString(row.plant_name),
    capacity_mw: parseNumber(row.capacity_mw),
    primary_fuel: safeString(row.primary_fuel),
    latitude: parseNumber(row.latitude),
    longitude: parseNumber(row.longitude)
  })).filter((row) => Number.isFinite(row.latitude) && Number.isFinite(row.longitude));

  const nuclearPlants = readCsv(path.join(INTERMEDIATE_DIR, 'nuclear_plants_clean.csv')).map((row) => ({
    plant: safeString(row.plant),
    country: safeString(row.country),
    reactors: parseNumber(row.reactors),
    latitude: parseNumber(row.latitude),
    longitude: parseNumber(row.longitude)
  })).filter((row) => Number.isFinite(row.latitude) && Number.isFinite(row.longitude));

  const gdpTotal = readCsv(path.join(INTERMEDIATE_DIR, 'gdp_total_clean.csv')).map((row) => ({
    country_name: safeString(row.country_name),
    country_code: safeString(row.country_code),
    year: parseNumber(row.year),
    value: parseNumber(row.gdp_usd)
  })).filter((row) => Number.isFinite(row.year) && Number.isFinite(row.value));

  const gdpPerCapita = readCsv(path.join(INTERMEDIATE_DIR, 'gdp_per_capita_clean.csv')).map((row) => ({
    country_name: safeString(row.country_name),
    country_code: safeString(row.country_code),
    year: parseNumber(row.year),
    value: parseNumber(row.gdp_per_capita_usd)
  })).filter((row) => Number.isFinite(row.year) && Number.isFinite(row.value));

  const airportPoints = airports.map((row) => toPoint(row.latitude, row.longitude));
  const portPoints = ports.map((row) => toPoint(row.latitude, row.longitude));
  const powerplantPoints = powerplants.map((row) => toPoint(row.latitude, row.longitude));
  const nuclearPoints = nuclearPlants.map((row) => toPoint(row.latitude, row.longitude));

  earthquakes.forEach((eq) => {
    const point = toPoint(eq.latitude, eq.longitude);
    unified.push({
      dataset: 'earthquake',
      record_id: safeString(eq.event_id),
      name: '',
      country: '',
      country_code: '',
      year: safeNumber(eq.year),
      month: safeNumber(eq.month),
      magnitude: safeNumber(eq.magnitude),
      depth_km: safeNumber(eq.depth_km),
      tsunami_flag: safeNumber(eq.tsunami_flag),
      cdi: safeNumber(eq.cdi),
      mmi: safeNumber(eq.mmi),
      sig: safeNumber(eq.sig),
      nst: safeNumber(eq.nst),
      dmin: safeNumber(eq.dmin),
      gap: safeNumber(eq.gap),
      value: '',
      value_type: '',
      capacity_mw: '',
      primary_fuel: '',
      reactors: '',
      feature_type: '',
      latitude: safeNumber(eq.latitude),
      longitude: safeNumber(eq.longitude),
      airports_within_100km: countWithinRadius(point, airportPoints, 100),
      ports_within_100km: countWithinRadius(point, portPoints, 100),
      powerplants_within_100km: countWithinRadius(point, powerplantPoints, 100),
      nuclear_plants_within_100km: countWithinRadius(point, nuclearPoints, 100)
    });
  });

  airports.forEach((row) => {
    unified.push({
      dataset: 'airport',
      record_id: row.ident,
      name: row.name,
      country: row.iso_country,
      country_code: row.iso_country,
      year: '',
      month: '',
      magnitude: '',
      depth_km: '',
      tsunami_flag: '',
      cdi: '',
      mmi: '',
      sig: '',
      nst: '',
      dmin: '',
      gap: '',
      value: '',
      value_type: '',
      capacity_mw: '',
      primary_fuel: '',
      reactors: '',
      feature_type: row.type,
      latitude: safeNumber(row.latitude),
      longitude: safeNumber(row.longitude),
      airports_within_100km: '',
      ports_within_100km: '',
      powerplants_within_100km: '',
      nuclear_plants_within_100km: ''
    });
  });

  ports.forEach((row) => {
    unified.push({
      dataset: 'port',
      record_id: row.index_no,
      name: row.port_name,
      country: row.country,
      country_code: row.country,
      year: '',
      month: '',
      magnitude: '',
      depth_km: '',
      tsunami_flag: '',
      cdi: '',
      mmi: '',
      sig: '',
      nst: '',
      dmin: '',
      gap: '',
      value: '',
      value_type: '',
      capacity_mw: '',
      primary_fuel: '',
      reactors: '',
      feature_type: 'port',
      latitude: safeNumber(row.latitude),
      longitude: safeNumber(row.longitude),
      airports_within_100km: '',
      ports_within_100km: '',
      powerplants_within_100km: '',
      nuclear_plants_within_100km: ''
    });
  });

  powerplants.forEach((row) => {
    unified.push({
      dataset: 'powerplant',
      record_id: row.plant_name,
      name: row.plant_name,
      country: row.country_name,
      country_code: row.country_code,
      year: '',
      month: '',
      magnitude: '',
      depth_km: '',
      tsunami_flag: '',
      cdi: '',
      mmi: '',
      sig: '',
      nst: '',
      dmin: '',
      gap: '',
      value: '',
      value_type: '',
      capacity_mw: safeNumber(row.capacity_mw),
      primary_fuel: row.primary_fuel,
      reactors: '',
      feature_type: row.primary_fuel,
      latitude: safeNumber(row.latitude),
      longitude: safeNumber(row.longitude),
      airports_within_100km: '',
      ports_within_100km: '',
      powerplants_within_100km: '',
      nuclear_plants_within_100km: ''
    });
  });

  nuclearPlants.forEach((row) => {
    unified.push({
      dataset: 'nuclear_plant',
      record_id: row.plant,
      name: row.plant,
      country: row.country,
      country_code: row.country,
      year: '',
      month: '',
      magnitude: '',
      depth_km: '',
      tsunami_flag: '',
      cdi: '',
      mmi: '',
      sig: '',
      nst: '',
      dmin: '',
      gap: '',
      value: '',
      value_type: '',
      capacity_mw: '',
      primary_fuel: '',
      reactors: safeNumber(row.reactors),
      feature_type: 'nuclear',
      latitude: safeNumber(row.latitude),
      longitude: safeNumber(row.longitude),
      airports_within_100km: '',
      ports_within_100km: '',
      powerplants_within_100km: '',
      nuclear_plants_within_100km: ''
    });
  });

  gdpTotal.forEach((row) => {
    unified.push({
      dataset: 'gdp_total',
      record_id: `${row.country_code}_${row.year}`,
      name: row.country_name,
      country: row.country_name,
      country_code: row.country_code,
      year: safeNumber(row.year),
      month: '',
      magnitude: '',
      depth_km: '',
      tsunami_flag: '',
      cdi: '',
      mmi: '',
      sig: '',
      nst: '',
      dmin: '',
      gap: '',
      value: safeNumber(row.value),
      value_type: 'gdp_usd_total',
      capacity_mw: '',
      primary_fuel: '',
      reactors: '',
      feature_type: '',
      latitude: '',
      longitude: '',
      airports_within_100km: '',
      ports_within_100km: '',
      powerplants_within_100km: '',
      nuclear_plants_within_100km: ''
    });
  });

  gdpPerCapita.forEach((row) => {
    unified.push({
      dataset: 'gdp_per_capita',
      record_id: `${row.country_code}_${row.year}`,
      name: row.country_name,
      country: row.country_name,
      country_code: row.country_code,
      year: safeNumber(row.year),
      month: '',
      magnitude: '',
      depth_km: '',
      tsunami_flag: '',
      cdi: '',
      mmi: '',
      sig: '',
      nst: '',
      dmin: '',
      gap: '',
      value: safeNumber(row.value),
      value_type: 'gdp_usd_per_capita',
      capacity_mw: '',
      primary_fuel: '',
      reactors: '',
      feature_type: '',
      latitude: '',
      longitude: '',
      airports_within_100km: '',
      ports_within_100km: '',
      powerplants_within_100km: '',
      nuclear_plants_within_100km: ''
    });
  });

  writeCsv(path.join(PROCESSED_DIR, 'unified_dataset.csv'), unified, UNIFIED_COLUMNS);
}

function run() {
  ensureDir(PROCESSED_DIR);
  buildUnifiedDataset();
}

run();
