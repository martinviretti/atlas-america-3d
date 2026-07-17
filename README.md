# Atlas América 3D

Aplicación web educativa, local y sin registro para explorar, estudiar, practicar y evaluar los **35 Estados independientes de América y sus capitales**.

La interfaz está en español latinoamericano y combina un globo interactivo, un mapa 2D accesible, recorridos guiados, tarjetas adaptativas, dieciséis modalidades de práctica, evaluaciones configurables y un panel de progreso persistente.

## 1. Inicio rápido

### Opción A — archivo autocontenido

Abra directamente:

```text
atlas-america-3d-autocontenido.html
```

Este archivo reúne HTML, CSS, JavaScript, datos y geometrías en un único documento.

### Opción B — versión modular

Abra `index.html`. Para obtener el comportamiento más consistente entre navegadores, ejecute un servidor local desde la carpeta del proyecto:

```bash
python3 -m http.server 8000
```

Luego visite `http://localhost:8000`.

No requiere instalación, compilación, backend, claves privadas, cuenta ni conexión permanente a Internet. Los enlaces de la sección Fuentes sí abren sitios externos. La respuesta por voz es experimental y su disponibilidad depende del navegador.

## 2. Arquitectura

La aplicación utiliza una arquitectura frontend modular basada en controladores:

- **Data layer:** `assets/data.js` contiene el conjunto normalizado de países, capitales, alias, códigos ISO, coordenadas, notas pedagógicas, geometrías, glosario, confusiones y fuentes.
- **State/store:** progreso, configuración, historial de evaluaciones, logros y repaso adaptativo se conservan localmente. Si `localStorage` no está disponible, se activa almacenamiento temporal en memoria sin interrumpir el uso.
- **Globe engine:** esfera renderizada con WebGL mediante shaders propios, con superposición Canvas para fronteras, países, etiquetas, capitales, pulsos, arcos y selección. Si WebGL no está disponible, el mismo motor pasa automáticamente a Canvas 2D.
- **Accessible map:** mapa SVG 2D navegable por teclado, tabla de 35 Estados y marcadores seleccionables para garantizar una alternativa completa al globo.
- **Learning controller:** recorridos regionales y de norte a sur, pronunciación opcional y comprobaciones rápidas.
- **Cards controller:** tarjetas país/capital, capital/país, bandera, silueta, ubicación y mezcla adaptativa.
- **Practice controller:** banco dinámico de preguntas, distractores regionales, escritura normalizada, mapas, orden y asociación.
- **Exam controller:** constructor de evaluación, semilla reproducible, temporizador, pausa, calificación, análisis de errores y repetición selectiva.
- **Progress controller:** dominio por país, estadísticas, evolución, mapa de dominio, logros y certificado local.

El globo es una única instancia persistente que se traslada entre secciones; no se recrea al navegar, por lo que conserva selección, cámara y recursos.

## 3. Tecnologías y decisiones

- **HTML5 semántico:** estructura, formularios, tablas, diálogos y regiones accesibles.
- **CSS3 moderno:** diseño responsive, foco visible, alto contraste, reducción de movimiento y componentes sin dependencias.
- **JavaScript ES6+:** lógica completa, controladores, persistencia, evaluación, accesibilidad y renderizado.
- **WebGL 1.0:** océano, atmósfera, iluminación, retícula y fondo estelar mediante un shader compacto.
- **Canvas 2D:** fronteras, rellenos regionales, etiquetas, capitales, arcos y fallback del globo.
- **SVG:** mapa accesible, siluetas, indicadores y sprite de iconos propio.
- **Web Speech API:** síntesis de voz y reconocimiento opcional cuando el navegador lo admite.
- **Web Audio API:** señales suaves de acierto, error y logro, desactivadas inicialmente.
- **LocalStorage:** progreso y preferencias; no se envían datos a servidores.

No se incorporaron React, Vue, Angular, Three.js, Globe.GL, Chart.js, tipografías remotas ni bibliotecas externas. Esta decisión reduce dependencias, evita fallos de CDN y permite una entrega totalmente local.

## 4. Estructura de archivos

```text
atlas-america-3d/
├── index.html
├── atlas-america-3d-autocontenido.html
├── README.md
├── QA_REPORT.md
├── ATTRIBUTIONS.md
├── CHECKSUMS.sha256
├── qa-results.json
├── assets/
│   ├── app.js
│   ├── data.js
│   └── styles.css
└── previews/
    ├── preview-home.png
    ├── preview-explore.png
    └── preview-mobile.png
```

## 5. Cobertura geográfica

El conjunto principal contiene exactamente:

| Región pedagógica | Estados |
|---|---:|
| América del Norte | 3 |
| América Central | 7 |
| Caribe | 13 |
| América del Sur | 12 |
| **Total** | **35** |

Los territorios dependientes no forman parte del examen principal. Se explican únicamente cuando ayudan a resolver confusiones, por ejemplo Puerto Rico, Guayana Francesa o Groenlandia.

### Caso Bolivia

La aplicación diferencia explícitamente:

- **Sucre:** capital constitucional.
- **La Paz:** sede de los órganos Ejecutivo y Legislativo.

Las preguntas se redactan de forma específica para evitar ambigüedad.

## 6. Funciones principales

### Explorar

- Rotación por arrastre, zoom, teclado y restablecimiento de cámara.
- Selección de países y fly-to fluido.
- Filtros por región y estilos educativo, político y nocturno.
- Etiquetas y capitales configurables.
- Búsqueda por país, capital, alias o código ISO.
- Ficha con bandera, capital, región, códigos ISO, ubicación, nota y mnemotecnia.
- Comparación y marcado para repaso.
- Recorrido automático y cambio 3D/2D.

### Aprender

- Recorridos de América del Norte, Central, Caribe, Sur y toda América.
- Orden geográfico de norte a sur.
- Avance, retroceso, pausa y reproducción automática.
- Pronunciación opcional y pregunta rápida cada cuatro países.

### Tarjetas

- País → capital.
- Capital → país.
- Bandera → país.
- Silueta → país.
- Ubicación → país.
- Mezcla adaptativa.
- Calificación “Fácil”, “Dudé” y “No la sabía”.

### Práctica: 16 modalidades

1. Elegir la capital correcta.
2. Elegir el país desde la capital.
3. Tocar el país en el globo.
4. Ubicar aproximadamente una capital.
5. Reconocer una bandera.
6. Reconocer una silueta.
7. Escribir la capital.
8. Escribir el país.
9. Ordenar de norte a sur.
10. Relacionar país y capital.
11. Contrarreloj.
12. Supervivencia.
13. Sin errores.
14. Repaso de fallos.
15. Desafío diario local.
16. Respuesta por voz experimental con alternativa escrita.

### Evaluación

- Región, cantidad, duración, dificultad y tipos de pregunta configurables.
- Porcentaje mínimo de aprobación.
- Retroalimentación inmediata o diferida.
- Semilla reproducible.
- Pausa y reanudación.
- Nota de 0 a 100, precisión regional, racha, tiempo y lista de errores.
- Repetición exclusiva de respuestas falladas.

### Progreso

- Dominio global y por región.
- Países vistos, aciertos, errores y tiempo medio.
- Estados: Nuevo, En aprendizaje, En práctica, Casi dominado, Dominado y Necesita repaso.
- Repetición espaciada local, con reducción de frecuencia para elementos dominados.
- Evolución de notas, pares confundidos, logros y certificado 35/35.
- Exportación, importación y reinicio de datos.

## 7. Validación de respuestas

La escritura:

- ignora mayúsculas y minúsculas;
- normaliza espacios y signos;
- admite tildes opcionales;
- usa un diccionario explícito de alias;
- evita coincidencias parciales engañosas;
- muestra la respuesta esperada y la explicación.

Ejemplos aceptados: `Brasilia` / `Brasília`, `Belmopán` / `Belmopan`, variantes de `Washington D. C.` y `Puerto España` / `Port of Spain`.

## 8. Accesibilidad

La aplicación incorpora prácticas orientadas a WCAG 2.2 AA:

- HTML semántico y jerarquía de encabezados.
- Enlace para saltar al contenido.
- Navegación por teclado y foco visible.
- Mensajes mediante `aria-live`.
- Etiquetas accesibles y controles táctiles amplios.
- Alto contraste y escala de texto.
- `prefers-reduced-motion` y control global para pausar movimiento.
- Información que no depende exclusivamente del color.
- Mapa SVG, tabla y lista como alternativas al globo.
- Fallback automático cuando WebGL no está disponible.

## 9. Privacidad

- No solicita datos personales.
- No utiliza cookies, analítica ni rastreadores.
- No requiere registro.
- No envía progreso a servidores.
- Exporta un archivo JSON únicamente por acción del usuario.

## 10. Datos cartográficos

Las geometrías generalizadas provienen de Natural Earth, escala 1:110m. Esa escala incluye polígonos de 28 de los 35 Estados del conjunto. Los siete microestados caribeños que no poseen polígono a esa resolución se representan mediante marcadores geolocalizados, etiquetas, fichas, tabla y lista accesible:

- Antigua y Barbuda.
- Barbados.
- Dominica.
- Granada.
- San Cristóbal y Nieves.
- Santa Lucía.
- San Vicente y las Granadinas.

Todos siguen disponibles en aprendizaje, práctica, evaluación, comparación y progreso.

## 11. Pruebas realizadas

Se ejecutó una batería automatizada de **78 verificaciones**, todas aprobadas, incluyendo:

- carga e inicialización;
- 35 países, cuatro regiones y ausencia de identificadores duplicados;
- diez rutas de navegación;
- mapa 2D, 28 polígonos y 35 marcadores;
- búsqueda y alias;
- aprendizaje y tarjetas;
- las dieciséis modalidades de práctica;
- persistencia del globo entre preguntas;
- examen completo, pausa y resultado;
- progreso, logros, comparador, confusiones, glosario y fuentes;
- exportación/importación;
- alto contraste y reducción de movimiento;
- validación de alias y rechazo de respuestas incorrectas;
- ausencia de errores JavaScript y de errores de consola.

Consulte `QA_REPORT.md` y `qa-results.json` para el detalle. Además, la variante autocontenida superó una prueba de humo independiente con navegación, mapa 2D y una práctica escrita completa.

## 12. Limitaciones reales

- La resolución cartográfica 1:110m no dibuja polígonos de siete microestados caribeños; se usan marcadores precisos y alternativas textuales.
- El reconocimiento de voz depende de soporte y permisos del navegador; nunca es obligatorio.
- Las pruebas automatizadas del entorno de construcción no expusieron un contexto WebGL en Chromium headless, por lo que allí se verificó exhaustivamente el fallback Canvas/SVG. El código WebGL conserva detección, compilación de shaders y fallback automático para navegadores con aceleración disponible.
- No se incluyen población, superficie, moneda ni idiomas para evitar datos accesorios no necesarios o potencialmente desactualizados.

## 13. Checklist de entrega

- [x] 35 Estados y capitales.
- [x] Cuatro regiones pedagógicas.
- [x] Bolivia sin ambigüedad.
- [x] Globo interactivo con WebGL y fallback Canvas.
- [x] Mapa 2D accesible.
- [x] Búsqueda, filtros, selección, zoom y cámara.
- [x] Recorridos guiados.
- [x] Tarjetas adaptativas.
- [x] Dieciséis modos de práctica.
- [x] Constructor de evaluación y resultados.
- [x] Dominio por país y repetición espaciada.
- [x] Panel de progreso, comparador, confusiones y glosario.
- [x] Persistencia, exportación, importación y reinicio.
- [x] Sonido y voz opcionales.
- [x] Responsive para escritorio, tablet y móvil.
- [x] Navegación por teclado, alto contraste y reducción de movimiento.
- [x] Fuentes y metodología visibles.
- [x] Sin backend, claves privadas, CDN o dependencias rotas.
- [x] Código completo y archivos listos para ejecutar.
