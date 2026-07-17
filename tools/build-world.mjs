// Genera assets/data.js MUNDIAL desde Natural Earth 50m, preservando los 35 países ricos de América.
// Fuentes: Natural Earth (dominio público) — nombres ES, capitales, fronteras. ISO 3166.
import fs from 'node:fs';

const dir = new URL('.', import.meta.url);
const countries = JSON.parse(fs.readFileSync(new URL('ne_countries.geojson', dir)));
const places = JSON.parse(fs.readFileSync(new URL('ne_places.geojson', dir)));

// dataset actual (para preservar los 35 ricos + glosario/fuentes/confusiones)
global.window = {};
await import(new URL('../assets/data.js', dir).href);
const OLD = global.window.ATLAS_DATA;
const oldByIso3 = new Map(OLD.countries.map(c => [c.iso3, c]));
const OLD_REGION_MAP = { norte: 'norteamerica', central: 'centroamerica', caribe: 'caribe', sur: 'sudamerica' };

// ---- Sectores (8) ----
const REGIONS = {
  norteamerica: { nombre: 'América del Norte', color: '#55b8ff', colorSuave: 'rgba(85,184,255,.20)', descripcion: 'Canadá, Estados Unidos y México.' },
  centroamerica: { nombre: 'América Central', color: '#46d4a7', colorSuave: 'rgba(70,212,167,.20)', descripcion: 'El istmo centroamericano.' },
  caribe: { nombre: 'Caribe', color: '#ffbf69', colorSuave: 'rgba(255,191,105,.20)', descripcion: 'Los Estados insulares del Caribe.' },
  sudamerica: { nombre: 'América del Sur', color: '#c58cff', colorSuave: 'rgba(197,140,255,.20)', descripcion: 'Los Estados sudamericanos.' },
  europa: { nombre: 'Europa', color: '#ff6b9d', colorSuave: 'rgba(255,107,157,.20)', descripcion: 'Los Estados de Europa.' },
  africa: { nombre: 'África', color: '#ffd24a', colorSuave: 'rgba(255,210,74,.20)', descripcion: 'Los Estados del continente africano.' },
  asia: { nombre: 'Asia', color: '#ff8c5a', colorSuave: 'rgba(255,140,90,.20)', descripcion: 'Los Estados de Asia.' },
  oceania: { nombre: 'Oceanía', color: '#5ee0d0', colorSuave: 'rgba(94,224,208,.20)', descripcion: 'Australia, Nueva Zelanda y los Estados insulares del Pacífico.' },
};

function sectorFor(p) {
  const sub = p.SUBREGION || '';
  if (sub === 'Northern America') return 'norteamerica';
  if (sub === 'Central America') return 'centroamerica';
  if (sub === 'Caribbean') return 'caribe';
  if (sub === 'South America') return 'sudamerica';
  const cont = p.CONTINENT || '';
  if (cont === 'Europe') return 'europa';
  if (cont === 'Africa') return 'africa';
  if (cont === 'Asia') return 'asia';
  if (cont === 'Oceania') return 'oceania';
  if (cont === 'North America') return 'norteamerica';
  if (cont === 'South America') return 'sudamerica';
  return null; // Seven seas / Antártida -> excluir
}

// ---- Capitales admin-0 por país ----
const capByAdm = new Map();
for (const f of places.features) {
  const fc = f.properties.FEATURECLA || '';
  if (!/Admin-0 capital/i.test(fc)) continue;
  const adm = f.properties.ADM0_A3;
  const prim = fc === 'Admin-0 capital';
  const rec = { name: f.properties.NAME_ES || f.properties.NAME, lat: f.geometry.coordinates[1], lng: f.geometry.coordinates[0], prim };
  const cur = capByAdm.get(adm);
  if (!cur || (prim && !cur.prim)) capByAdm.set(adm, rec);
}

const slug = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const P = 2, rnd = n => Math.round(n * 10 ** P) / 10 ** P;
function cleanRing(r) { const o = []; let pv = null; for (const [x, y] of r) { const p = [rnd(x), rnd(y)]; if (!pv || p[0] !== pv[0] || p[1] !== pv[1]) o.push(p); pv = p; } const a = o[0], b = o[o.length - 1]; if (a && b && (a[0] !== b[0] || a[1] !== b[1])) o.push([a[0], a[1]]); return o; }
function cleanGeom(g) {
  if (!g) return null;
  const poly = rings => { const out = []; for (const ring of rings) { const c = cleanRing(ring); if (c.length >= 4) out.push(c); } return out; };
  if (g.type === 'Polygon') { const r = poly(g.coordinates); return r.length ? { type: 'Polygon', coordinates: r } : null; }
  if (g.type === 'MultiPolygon') { const ps = []; for (const pg of g.coordinates) { const r = poly(pg); if (r.length) ps.push(r); } return ps.length ? { type: 'MultiPolygon', coordinates: ps } : null; }
  return null;
}

// Geometrías livianas 110m para el mundo; 50m detallado se reserva para los 35 de América.
const c110 = JSON.parse(fs.readFileSync(new URL('ne_110m.geojson', dir)));
const geom110 = new Map();
for (const gf of c110.features) {
  const iso = (gf.properties.ISO_A3 && gf.properties.ISO_A3 !== '-99') ? gf.properties.ISO_A3 : gf.properties.ADM0_A3;
  if (geom110.has(iso)) continue;
  const g = cleanGeom(gf.geometry);
  if (g) geom110.set(iso, g);
}
const RICH_ISO = new Set(OLD.countries.map(c => c.iso3));

const usedIds = new Set(OLD.countries.map(c => c.id));
const uniqId = base => { let id = base || 'pais'; if (!usedIds.has(id)) { usedIds.add(id); return id; } let i = 2; while (usedIds.has(id + '-' + i)) i++; id = id + '-' + i; usedIds.add(id); return id; };

const outCountries = [];
const outFeatures = [];
let orden = 0;
const seenIso3 = new Set();

// ordenar por sector (para "orden" coherente N->S dentro de América y luego continentes) — simple: por sector luego nombre
const sectorOrder = ['norteamerica', 'centroamerica', 'caribe', 'sudamerica', 'europa', 'africa', 'asia', 'oceania'];
const CAP_FALLBACK = { NRU: ['Yaren', -0.5477, 166.9209], VAT: ['Ciudad del Vaticano', 41.9029, 12.4534] };
const BLOCK = new Set(['CYN']); // Chipre del Norte (no miembro ONU, sin capital en la fuente)
const isoOf = f => (f.properties.ISO_A3 && f.properties.ISO_A3 !== '-99') ? f.properties.ISO_A3 : f.properties.ADM0_A3;
const feats = countries.features
  .filter(f => ['Sovereign country', 'Country', 'Sovereignty'].includes(f.properties.TYPE))
  .filter(f => f.properties.SOVEREIGNT === f.properties.ADMIN) // solo Estados soberanos (excluye dependencias)
  .filter(f => !BLOCK.has(isoOf(f)))
  .filter(f => sectorFor(f.properties))
  .sort((a, b) => {
    const sa = sectorOrder.indexOf(sectorFor(a.properties)), sb = sectorOrder.indexOf(sectorFor(b.properties));
    if (sa !== sb) return sa - sb;
    return (a.properties.NAME_ES || '').localeCompare(b.properties.NAME_ES || '');
  });

for (const f of feats) {
  const p = f.properties;
  let iso3 = (p.ISO_A3 && p.ISO_A3 !== '-99') ? p.ISO_A3 : p.ADM0_A3;
  let iso2 = (p.ISO_A2 && p.ISO_A2 !== '-99') ? p.ISO_A2 : (p.ISO_A2_EH && p.ISO_A2_EH !== '-99' ? p.ISO_A2_EH : (iso3 ? iso3.slice(0, 2) : 'XX'));
  if (seenIso3.has(iso3)) continue; // evitar duplicados
  seenIso3.add(iso3);
  const sector = sectorFor(p);
  const geom = RICH_ISO.has(iso3) ? cleanGeom(f.geometry) : geom110.get(iso3);
  if (geom) outFeatures.push({ type: 'Feature', properties: { iso3 }, geometry: geom });

  const rich = oldByIso3.get(iso3);
  if (rich) {
    // preservar contenido rico, solo remapear región
    outCountries.push(Object.assign({}, rich, { regionPedagogica: OLD_REGION_MAP[rich.regionPedagogica] || rich.regionPedagogica, orden: orden++ }));
    continue;
  }
  // país nuevo: datos base
  const nombreES = p.NAME_ES || p.NAME;
  let cap = capByAdm.get(iso3) || capByAdm.get(p.ADM0_A3);
  if (!cap && CAP_FALLBACK[iso3]) { const fb = CAP_FALLBACK[iso3]; cap = { name: fb[0], lat: fb[1], lng: fb[2] }; }
  const capName = cap ? cap.name : '—';
  const capCoord = cap ? [rnd4(cap.lat), rnd4(cap.lng)] : [rnd4(p.LABEL_Y), rnd4(p.LABEL_X)];
  outCountries.push({
    id: uniqId(slug(nombreES)),
    iso2: iso2.toUpperCase(), iso3,
    nombreES, nombreAlternativo: p.FORMAL_ES || nombreES,
    capitalPrincipal: capName, capitalesAceptadas: cap ? [capName] : [],
    tipoCapital: 'Capital',
    regionPedagogica: sector,
    coordenadasPais: [rnd4(p.LABEL_Y), rnd4(p.LABEL_X)],
    coordenadasCapital: capCoord,
    aliasPais: [], aliasCapital: [],
    descripcionBreve: `${nombreES} es un Estado soberano de ${REGIONS[sector].nombre}. Su capital es ${capName}.`,
    ayudaMemoria: `Capital de ${nombreES}: ${capName}.`,
    erroresHabituales: [],
    orden: orden++,
    estadoSoberania: 'Estado soberano',
    fuente: ['Natural Earth', 'ISO 3166'],
  });
}
function rnd4(n) { return Math.round(n * 1e4) / 1e4; }

// Garantía: los 35 ricos de América SIEMPRE presentes (aunque el filtro NE los omitiera)
for (const rich of OLD.countries) {
  if (seenIso3.has(rich.iso3)) continue;
  const nf = countries.features.find(f => f.properties.ISO_A3 === rich.iso3 || f.properties.ADM0_A3 === rich.iso3);
  if (nf) { const g = cleanGeom(nf.geometry); if (g) outFeatures.push({ type: 'Feature', properties: { iso3: rich.iso3 }, geometry: g }); }
  outCountries.push(Object.assign({}, rich, { regionPedagogica: OLD_REGION_MAP[rich.regionPedagogica] || rich.regionPedagogica, orden: orden++ }));
  seenIso3.add(rich.iso3);
  console.log('  (+) recuperado de los 35:', rich.nombreES);
}

const DATA = {
  version: OLD.version || 2,
  fechaRevision: OLD.fechaRevision,
  mundial: true,
  countries: outCountries,
  regions: REGIONS,
  geojson: { type: 'FeatureCollection', features: outFeatures },
  confusiones: OLD.confusiones,
  glosario: OLD.glosario,
  fuentes: OLD.fuentes,
};

const js = 'window.ATLAS_DATA = ' + JSON.stringify(DATA) + ';\n';
fs.writeFileSync(new URL('../assets/data.js', dir), js);
const withCap = outCountries.filter(c => c.capitalPrincipal !== '—').length;
console.log(`data.js MUNDIAL: ${outCountries.length} países, ${outFeatures.length} con geometría, ${withCap} con capital`);
console.log('por sector:', sectorOrder.map(s => s + ':' + outCountries.filter(c => c.regionPedagogica === s).length).join(' '));
console.log('tamaño data.js:', (js.length / 1024).toFixed(0), 'KB');
const noCap = outCountries.filter(c => c.capitalPrincipal === '—').map(c => c.nombreES);
if (noCap.length) console.log('SIN CAPITAL:', noCap.join(', '));
