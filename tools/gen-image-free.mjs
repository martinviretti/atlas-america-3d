// Genera imágenes GRATIS con Pollinations.ai — sin API key, sin registro.
// Modelos: flux (default, buena calidad) | turbo (más rápido).
//
// Uso:
//   node tools/gen-image-free.mjs "un prompt en inglés funciona mejor" salida.png
//   node tools/gen-image-free.mjs "flat vector world map, blue tones" mapa.png 1024 768
//   node tools/gen-image-free.mjs "prompt" out.png 1024 1024 turbo 42
//        (args: prompt, salida, ancho, alto, modelo, seed)
import fs from 'node:fs';

const prompt = process.argv[2];
const out = process.argv[3] || 'imagen.png';
const w = parseInt(process.argv[4]) || 1024;
const h = parseInt(process.argv[5]) || 1024;
const model = process.argv[6] || 'flux';
const seed = process.argv[7] || Math.floor(Math.random() * 1e6);
if (!prompt) { console.error('Uso: node tools/gen-image-free.mjs "<prompt>" [salida.png] [ancho] [alto] [modelo] [seed]'); process.exit(1); }

const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=${w}&height=${h}&model=${model}&seed=${seed}&nologo=true`;
console.log('Generando (puede tardar 5-20s)…');
try {
  const r = await fetch(url, { headers: { 'User-Agent': 'atlas-gen/1.0' } });
  if (!r.ok) { console.error(`Error HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`); process.exit(1); }
  const buf = Buffer.from(await r.arrayBuffer());
  if (buf.length < 1000) { console.error('Respuesta demasiado chica, reintentá o cambiá el prompt.'); process.exit(1); }
  fs.writeFileSync(out, buf);
  console.log(`OK -> ${out} (${(buf.length / 1024).toFixed(0)} KB, ${w}x${h}, modelo ${model}, seed ${seed})`);
} catch (e) { console.error('Falló:', e.message); process.exit(1); }
