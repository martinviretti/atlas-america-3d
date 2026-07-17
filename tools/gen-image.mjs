// Genera imágenes con Google Gemini ("nano banana" = gemini-2.5-flash-image).
// La API key se lee de la variable de entorno GEMINI_API_KEY (nunca se escribe en el código).
//
// Uso:
//   node tools/gen-image.mjs "un prompt describiendo la imagen" salida.png
//   node tools/gen-image.mjs "logo minimalista de un globo terráqueo azul, plano, vectorial" logo.png
//
// Modelo configurable con GEMINI_IMAGE_MODEL (default: gemini-2.5-flash-image).
import fs from 'node:fs';

const KEY = process.env.GEMINI_API_KEY;
if (!KEY) {
  console.error('Falta GEMINI_API_KEY en el entorno. En PowerShell: setx GEMINI_API_KEY "tu-key" y abrí una terminal nueva.');
  process.exit(1);
}
const prompt = process.argv[2];
const out = process.argv[3] || 'imagen.png';
if (!prompt) { console.error('Uso: node tools/gen-image.mjs "<prompt>" [salida.png]'); process.exit(1); }

const MODEL = process.env.GEMINI_IMAGE_MODEL || 'gemini-2.5-flash-image';
const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${KEY}`;

const body = {
  contents: [{ parts: [{ text: prompt }] }],
  generationConfig: { responseModalities: ['IMAGE'] },
};

const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
if (!res.ok) {
  const t = await res.text();
  console.error(`Error HTTP ${res.status}: ${t.slice(0, 500)}`);
  process.exit(1);
}
const data = await res.json();
const parts = data?.candidates?.[0]?.content?.parts || [];
const img = parts.find(p => p.inlineData && /image/.test(p.inlineData.mimeType || ''));
if (!img) {
  console.error('La respuesta no trajo imagen. Respuesta:', JSON.stringify(data).slice(0, 600));
  process.exit(1);
}
const ext = (img.inlineData.mimeType.split('/')[1] || 'png').replace('jpeg', 'jpg');
const file = out.includes('.') ? out : `${out}.${ext}`;
fs.writeFileSync(file, Buffer.from(img.inlineData.data, 'base64'));
console.log(`OK -> ${file} (${(fs.statSync(file).size / 1024).toFixed(0)} KB, ${img.inlineData.mimeType})`);
