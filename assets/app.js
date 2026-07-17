(() => {
  'use strict';

  const DATA = window.ATLAS_DATA;
  if (!DATA || !Array.isArray(DATA.countries) || DATA.countries.length < 1) {
    document.body.innerHTML = '<main style="padding:2rem;color:white;background:#07111f;min-height:100vh"><h1>No se pudieron cargar los datos</h1><p>Verifica que <code>assets/data.js</code> esté disponible.</p></main>';
    throw new Error('ATLAS_DATA missing or invalid');
  }

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const lerp = (a, b, t) => a + (b - a) * t;
  const degToRad = value => value * Math.PI / 180;
  const radToDeg = value => value * 180 / Math.PI;
  const now = () => Date.now();
  const DAY = 86400000;
  const STORAGE_KEY = 'atlasAmerica3D.v1';
  const memoryStorage = new Map();
  function storageGet(key) {
    try { return window.localStorage.getItem(key); }
    catch (_) { return memoryStorage.has(key) ? memoryStorage.get(key) : null; }
  }
  function storageSet(key, value) {
    try { window.localStorage.setItem(key, value); return true; }
    catch (_) { memoryStorage.set(key, value); return false; }
  }
  const SESSION_START = Date.now();
  const countryById = new Map(DATA.countries.map(country => [country.id, country]));
  const countryByIso3 = new Map(DATA.countries.map(country => [country.iso3, country]));
  const featuresByIso3 = new Map(DATA.geojson.features.map(feature => [feature.properties.iso3, feature]));
  const hasWebGLSupport = () => {
    if (new URLSearchParams(location.search).get('force2d') === '1') return false;
    try {
      const canvas = document.createElement('canvas');
      return Boolean(window.WebGLRenderingContext && (canvas.getContext('webgl') || canvas.getContext('experimental-webgl')));
    } catch (_) {
      return false;
    }
  };

  const REGION_ORDER = ['norteamerica', 'centroamerica', 'caribe', 'sudamerica', 'europa', 'africa', 'asia', 'oceania'];
  const STATUS_META = {
    new: { label: 'No estudiado', color: '#71869a', icon: '○' },
    learning: { label: 'En aprendizaje', color: '#6fb7ff', icon: '◔' },
    practice: { label: 'En práctica', color: '#ffcc72', icon: '◑' },
    almost: { label: 'Casi dominado', color: '#b58cff', icon: '◕' },
    mastered: { label: 'Dominado', color: '#68e0a9', icon: '●' },
    review: { label: 'Necesita repaso', color: '#ff7485', icon: '↻' }
  };

  const regionTotalCount = r => DATA.countries.filter(c => c.regionPedagogica === r).length;
  const regionDone = (s, r) => regionTotalCount(r) > 0 && s.summary.regionMastered[r] === regionTotalCount(r);
  const ACHIEVEMENTS = [
    { id: 'first', title: 'Primer país aprendido', description: 'Registra tu primer acierto.', icon: 'icon-pin', test: s => s.summary.correct >= 1 },
    { id: 'north', title: 'América del Norte dominada', description: 'Domina Canadá, EE. UU. y México.', icon: 'icon-globe', test: s => regionDone(s, 'norteamerica') },
    { id: 'central', title: 'Ruta centroamericana', description: 'Domina los 7 países del istmo.', icon: 'icon-route', test: s => regionDone(s, 'centroamerica') },
    { id: 'caribbean', title: 'Experto del Caribe', description: 'Domina los 13 Estados del Caribe.', icon: 'icon-bolt', test: s => regionDone(s, 'caribe') },
    { id: 'south', title: 'Conquistador del Sur', description: 'Domina los 12 países sudamericanos.', icon: 'icon-compass', test: s => regionDone(s, 'sudamerica') },
    { id: 'europe', title: 'Maestro de Europa', description: 'Domina todos los países de Europa.', icon: 'icon-globe', test: s => regionDone(s, 'europa') },
    { id: 'africa', title: 'Experto de África', description: 'Domina todos los países de África.', icon: 'icon-globe', test: s => regionDone(s, 'africa') },
    { id: 'asia', title: 'Sabio de Asia', description: 'Domina todos los países de Asia.', icon: 'icon-globe', test: s => regionDone(s, 'asia') },
    { id: 'oceania', title: 'Navegante de Oceanía', description: 'Domina todos los países de Oceanía.', icon: 'icon-compass', test: s => regionDone(s, 'oceania') },
    { id: 'america', title: 'América completa (35)', description: 'Domina los 35 Estados de América.', icon: 'icon-certificate', test: s => ['norteamerica','centroamerica','caribe','sudamerica'].every(r => regionDone(s, r)) },
    { id: 'world', title: 'Vuelta al mundo', description: 'Domina todos los países del mundo.', icon: 'icon-certificate', test: s => s.summary.mastered === DATA.countries.length },
    { id: 'streak10', title: 'Diez respuestas seguidas', description: 'Alcanza una racha de 10 aciertos.', icon: 'icon-bolt', test: s => s.summary.bestStreak >= 10 },
    { id: 'perfect', title: 'Examen perfecto', description: 'Obtén 100 puntos en una evaluación.', icon: 'icon-exam', test: s => s.history.some(h => h.score === 100) },
    { id: 'noHints', title: 'Sin pistas', description: 'Completa una sesión sin usar ayudas.', icon: 'icon-target', test: s => s.meta.sessionsWithoutHints >= 1 },
    { id: 'speed', title: 'Velocidad geográfica', description: 'Responde correctamente en menos de 3 segundos.', icon: 'icon-bolt', test: s => s.meta.fastCorrect >= 10 }
  ];

  const MODES = {
    'capital-choice': { title: 'Elegir la capital', description: 'Selecciona la capital correcta entre distractores plausibles de la misma región.', icon: 'icon-target', skills: ['Reconocimiento rápido', 'Distractores regionales', 'Corrección explicada'] },
    'country-choice': { title: 'Capital → país', description: 'Identifica qué país corresponde a una capital mostrada.', icon: 'icon-swap', skills: ['Recuperación inversa', 'Asociación bidireccional', 'Capitales similares'] },
    'globe-country': { title: 'Tocar el país', description: 'Localiza el país correcto directamente sobre el globo o el mapa 2D.', icon: 'icon-globe', skills: ['Ubicación espacial', 'Fronteras', 'Memoria visual'] },
    'capital-location': { title: 'Ubicar una capital', description: 'Marca la ubicación aproximada de la capital sobre el globo.', icon: 'icon-pin', skills: ['Coordenadas aproximadas', 'Lectura regional', 'Distancia visual'] },
    'flag-country': { title: 'Bandera → país', description: 'Reconoce el Estado a partir de su bandera.', icon: 'icon-cards', skills: ['Identidad visual', 'Asociación', 'Recuerdo rápido'] },
    'silhouette-country': { title: 'Silueta → país', description: 'Reconoce países con geometría visible a esta escala cartográfica.', icon: 'icon-map', skills: ['Forma territorial', 'Orientación', 'Comparación visual'] },
    'write-capital': { title: 'Escribir la capital', description: 'Escribe la respuesta sin opciones. Se aceptan alias explícitos y tildes opcionales.', icon: 'icon-exam', skills: ['Recuerdo activo', 'Ortografía flexible', 'Sin pistas visuales'] },
    'write-country': { title: 'Escribir el país', description: 'Recibe una capital y escribe el país correspondiente.', icon: 'icon-book', skills: ['Recuperación inversa', 'Nombres completos', 'Alias válidos'] },
    'order-north': { title: 'Ordenar de norte a sur', description: 'Organiza una selección de países según su posición geográfica.', icon: 'icon-route', skills: ['Secuencia espacial', 'Comparación de latitud', 'Contexto continental'] },
    'match-pairs': { title: 'Relacionar pares', description: 'Une países y capitales mediante selección accesible o arrastre.', icon: 'icon-compare', skills: ['Asociación simultánea', 'Barrido visual', 'Memoria de pares'] },
    timed: { title: 'Contrarreloj', description: 'Responde una mezcla de preguntas antes de que finalice el tiempo.', icon: 'icon-bolt', skills: ['Velocidad', 'Precisión bajo tiempo', 'Mezcla dinámica'] },
    survival: { title: 'Supervivencia', description: 'Dispones de tres vidas; cada error consume una.', icon: 'icon-target', skills: ['Consistencia', 'Gestión del riesgo', 'Racha'] },
    perfect: { title: 'Sin errores', description: 'La sesión termina con el primer error. Ideal para consolidación.', icon: 'icon-check', skills: ['Dominio estable', 'Atención', 'Cero tolerancia'] },
    review: { title: 'Repaso de fallos', description: 'Prioriza países débiles, vencidos o con errores recientes.', icon: 'icon-refresh', skills: ['Adaptación', 'Repetición espaciada', 'Corrección de confusiones'] },
    daily: { title: 'Desafío diario', description: 'Conjunto local y reproducible que cambia cada fecha.', icon: 'icon-bolt', skills: ['Hábito', 'Variedad diaria', 'Seguimiento'] },
    voice: { title: 'Respuesta por voz', description: 'Pronuncia la respuesta; si el navegador no reconoce voz, permite escribirla.', icon: 'icon-volume', skills: ['Pronunciación', 'Recuerdo oral', 'Accesibilidad multimodal'] }
  };

  function normalizeText(value = '') {
    return String(value)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/&/g, ' y ')
      .replace(/\b(the|republic of|estado plurinacional de|república de)\b/g, ' ')
      .replace(/[^a-z0-9ñ]+/g, ' ')
      .trim()
      .replace(/\s+/g, ' ');
  }

  function isAcceptedAnswer(input, accepted) {
    const normalized = normalizeText(input);
    if (!normalized) return false;
    return accepted.some(item => normalizeText(item) === normalized);
  }

  function escapeHTML(value = '') {
    return String(value).replace(/[&<>'"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#039;', '"': '&quot;' }[character]));
  }

  function flagEmoji(iso2) {
    const code = (iso2 || "").toLowerCase();
    return `<img class="flag-img" src="https://flagcdn.com/${code}.svg" alt="" loading="lazy" onerror="this.remove()">`;
  }

  function seededRandom(seedText) {
    let hash = 2166136261;
    for (let i = 0; i < seedText.length; i += 1) {
      hash ^= seedText.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return () => {
      hash += 0x6D2B79F5;
      let t = hash;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function shuffle(items, random = Math.random) {
    const result = [...items];
    for (let i = result.length - 1; i > 0; i -= 1) {
      const j = Math.floor(random() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }

  function sample(items, count, random = Math.random) {
    return shuffle(items, random).slice(0, Math.min(count, items.length));
  }

  function formatDuration(seconds) {
    const total = Math.max(0, Math.round(seconds));
    if (total < 60) return `${total} s`;
    const minutes = Math.floor(total / 60);
    const rest = total % 60;
    return `${minutes} min${rest ? ` ${rest} s` : ''}`;
  }

  function formatClock(seconds) {
    const value = Math.max(0, Math.ceil(seconds));
    const min = Math.floor(value / 60).toString().padStart(2, '0');
    const sec = (value % 60).toString().padStart(2, '0');
    return `${min}:${sec}`;
  }

  function formatDate(timestamp) {
    if (!timestamp) return 'Sin registro';
    return new Intl.DateTimeFormat('es-AR', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(timestamp));
  }

  function haversineKm(a, b) {
    const radius = 6371;
    const lat1 = degToRad(a[0]);
    const lat2 = degToRad(b[0]);
    const dLat = lat2 - lat1;
    const dLon = degToRad(b[1] - a[1]);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
    return radius * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  }

  function shortestLonDelta(from, to) {
    return ((to - from + 540) % 360) - 180;
  }

  function countryPool(region = 'all') {
    return DATA.countries.filter(country => region === 'all' || country.regionPedagogica === region);
  }

  function getRegionName(region) {
    return region === 'all' ? 'Toda América' : DATA.regions[region]?.nombre || region;
  }

  function getQuestionCapital(country, seatQuestion = false) {
    if (country.id === 'bolivia' && seatQuestion) {
      return {
        prompt: '¿Cuál es la sede de los órganos Ejecutivo y Legislativo de Bolivia?',
        correct: country.sedeGobierno,
        accepted: [country.sedeGobierno, ...(country.aliasSedeGobierno || [])],
        explanation: 'La Paz es la sede de los órganos Ejecutivo y Legislativo; Sucre es la capital constitucional.'
      };
    }
    const prompt = country.id === 'bolivia'
      ? '¿Cuál es la capital constitucional de Bolivia?'
      : `¿Cuál es la capital de ${country.nombreES}?`;
    return {
      prompt,
      correct: country.capitalPrincipal,
      accepted: [...country.capitalesAceptadas, ...country.aliasCapital],
      explanation: country.id === 'bolivia'
        ? 'Sucre es la capital constitucional; La Paz es la sede de gobierno.'
        : `${country.capitalPrincipal} es la capital de ${country.nombreES}.`
    };
  }

  function getQuestionCountry(country) {
    return {
      prompt: `¿A qué país pertenece la capital ${country.capitalPrincipal}?`,
      correct: country.nombreES,
      accepted: [country.nombreES, country.nombreAlternativo, ...country.aliasPais],
      explanation: `${country.capitalPrincipal} corresponde a ${country.nombreES}.`
    };
  }

  function distractorsFor(country, field, count, random = Math.random) {
    const pool = DATA.countries.filter(candidate => candidate.id !== country.id);
    const sameRegion = pool.filter(candidate => candidate.regionPedagogica === country.regionPedagogica);
    const other = pool.filter(candidate => candidate.regionPedagogica !== country.regionPedagogica);
    const ordered = [...shuffle(sameRegion, random), ...shuffle(other, random)];
    const values = [];
    if (field === 'capital' && country.erroresHabituales?.length) {
      values.push(...shuffle(country.erroresHabituales, random));
    }
    for (const candidate of ordered) {
      values.push(field === 'capital' ? candidate.capitalPrincipal : candidate.nombreES);
    }
    const correctNorm = normalizeText(field === 'capital' ? country.capitalPrincipal : country.nombreES);
    const unique = [];
    const seen = new Set([correctNorm]);
    for (const value of values) {
      const normalized = normalizeText(value);
      if (!normalized || seen.has(normalized)) continue;
      seen.add(normalized);
      unique.push(value);
      if (unique.length >= count) break;
    }
    return unique;
  }

  function statusForProgress(progress) {
    if (!progress || progress.attempts === 0) return 'new';
    const due = progress.nextReview && progress.nextReview <= Date.now();
    if (due && progress.mastery >= 55) return 'review';
    if (progress.mastery >= 82 && progress.attempts >= 5 && progress.accuracy >= .78) return 'mastered';
    if (progress.mastery >= 66) return 'almost';
    if (progress.mastery >= 38) return 'practice';
    return 'learning';
  }

  function computeMastery(progress) {
    if (!progress.attempts) return 0;
    const accuracy = progress.correct / progress.attempts;
    const exposure = Math.min(progress.attempts, 12) / 12;
    const recency = progress.lastAttempt ? Math.max(0, 1 - ((Date.now() - progress.lastAttempt) / (DAY * 35))) : 0;
    const confidence = Math.min(progress.consecutiveCorrect, 5) / 5;
    const speed = progress.averageTime ? Math.max(0, 1 - (progress.averageTime / 18)) : .35;
    const raw = accuracy * 52 + exposure * 20 + confidence * 15 + recency * 8 + speed * 5;
    return Math.round(clamp(raw, 0, 100));
  }

  function defaultCountryProgress() {
    return {
      viewed: 0,
      attempts: 0,
      correct: 0,
      errors: 0,
      accuracy: 0,
      totalTime: 0,
      averageTime: 0,
      lastAttempt: 0,
      lastSeen: 0,
      mastery: 0,
      consecutiveCorrect: 0,
      intervalLevel: 0,
      nextReview: 0,
      perceivedDifficulty: 0,
      wrongAnswers: {}
    };
  }

  function defaultState() {
    return {
      version: 1,
      progress: Object.fromEntries(DATA.countries.map(country => [country.id, defaultCountryProgress()])),
      settings: {
        sound: false,
        volume: .35,
        reducedMotion: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || false,
        highContrast: false,
        fontScale: 1,
        quality: 'balanced',
        autoRotate: true,
        showLabels: true,
        showCapitals: true,
        globeStyle: 'educational'
      },
      history: [],
      achievements: [],
      meta: {
        createdAt: Date.now(),
        lastVisit: Date.now(),
        totalStudySeconds: 0,
        bestStreak: 0,
        currentStreak: 0,
        sessions: 0,
        sessionsWithoutHints: 0,
        fastCorrect: 0,
        dailyCompleted: {}
      }
    };
  }

  class ProgressStore extends EventTarget {
    constructor() {
      super();
      this.state = this.load();
      this.saveTimer = null;
      this.lastTick = Date.now();
      this.tickTimer = window.setInterval(() => this.tick(), 30000);
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) this.tick(true);
        else this.lastTick = Date.now();
      });
      window.addEventListener('beforeunload', () => this.tick(true));
    }

    load() {
      const base = defaultState();
      try {
        const raw = storageGet(STORAGE_KEY);
        if (!raw) return base;
        const parsed = JSON.parse(raw);
        if (!parsed || parsed.version !== 1) return base;
        const merged = {
          ...base,
          ...parsed,
          settings: { ...base.settings, ...(parsed.settings || {}) },
          meta: { ...base.meta, ...(parsed.meta || {}) },
          progress: { ...base.progress }
        };
        for (const country of DATA.countries) {
          merged.progress[country.id] = { ...defaultCountryProgress(), ...(parsed.progress?.[country.id] || {}) };
          const p = merged.progress[country.id];
          p.accuracy = p.attempts ? p.correct / p.attempts : 0;
          p.mastery = computeMastery(p);
        }
        merged.history = Array.isArray(parsed.history) ? parsed.history.slice(-60) : [];
        merged.achievements = Array.isArray(parsed.achievements) ? parsed.achievements : [];
        merged.meta.lastVisit = Date.now();
        return merged;
      } catch (error) {
        return base;
      }
    }

    save(immediate = false) {
      clearTimeout(this.saveTimer);
      const write = () => {
        try {
          storageSet(STORAGE_KEY, JSON.stringify(this.state));
          this.dispatchEvent(new CustomEvent('saved'));
        } catch (error) {
          memoryStorage.set(STORAGE_KEY, JSON.stringify(this.state));
        }
      };
      if (immediate) write();
      else this.saveTimer = window.setTimeout(write, 250);
    }

    tick(immediate = false) {
      const current = Date.now();
      if (!document.hidden) this.state.meta.totalStudySeconds += Math.max(0, Math.round((current - this.lastTick) / 1000));
      this.lastTick = current;
      this.save(immediate);
    }

    markViewed(countryId) {
      const progress = this.state.progress[countryId];
      if (!progress) return;
      progress.viewed += 1;
      progress.lastSeen = Date.now();
      this.save();
      this.dispatchEvent(new CustomEvent('change', { detail: { type: 'view', countryId } }));
    }

    recordAnswer(countryId, { correct, responseTime = 0, mode = 'practice', answer = '', expected = '', hintUsed = false } = {}) {
      const progress = this.state.progress[countryId];
      if (!progress) return;
      progress.attempts += 1;
      progress.totalTime += Math.max(0, responseTime);
      progress.averageTime = progress.totalTime / progress.attempts;
      progress.lastAttempt = Date.now();
      progress.lastSeen = Date.now();
      if (correct) {
        progress.correct += 1;
        progress.consecutiveCorrect += 1;
        progress.intervalLevel = Math.min(progress.intervalLevel + 1, 6);
        const intervals = [0, .04, 1, 3, 7, 14, 30];
        progress.nextReview = Date.now() + intervals[progress.intervalLevel] * DAY;
        this.state.meta.currentStreak += 1;
        this.state.meta.bestStreak = Math.max(this.state.meta.bestStreak, this.state.meta.currentStreak);
        if (responseTime > 0 && responseTime < 3) this.state.meta.fastCorrect += 1;
      } else {
        progress.errors += 1;
        progress.consecutiveCorrect = 0;
        progress.intervalLevel = Math.max(0, progress.intervalLevel - 2);
        progress.nextReview = Date.now() + .01 * DAY;
        this.state.meta.currentStreak = 0;
        if (answer) {
          const key = normalizeText(answer) || String(answer);
          progress.wrongAnswers[key] = (progress.wrongAnswers[key] || 0) + 1;
        }
      }
      progress.accuracy = progress.correct / progress.attempts;
      progress.perceivedDifficulty = clamp((1 - progress.accuracy) * .7 + Math.min(progress.averageTime / 20, 1) * .3, 0, 1);
      progress.mastery = computeMastery(progress);
      this.save();
      this.dispatchEvent(new CustomEvent('change', { detail: { type: 'answer', countryId, correct, mode, expected, hintUsed } }));
      this.checkAchievements();
    }

    finishSession({ usedHints = false } = {}) {
      this.state.meta.sessions += 1;
      if (!usedHints) this.state.meta.sessionsWithoutHints += 1;
      this.save();
      this.checkAchievements();
    }

    addExam(result) {
      this.state.history.push({ ...result, date: Date.now() });
      this.state.history = this.state.history.slice(-60);
      this.save();
      this.dispatchEvent(new CustomEvent('change', { detail: { type: 'exam' } }));
      this.checkAchievements();
    }

    summary() {
      const entries = DATA.countries.map(country => ({ country, progress: this.state.progress[country.id] }));
      const attempts = entries.reduce((sum, item) => sum + item.progress.attempts, 0);
      const correct = entries.reduce((sum, item) => sum + item.progress.correct, 0);
      const seen = entries.filter(item => item.progress.viewed > 0 || item.progress.attempts > 0).length;
      const statusCounts = Object.fromEntries(Object.keys(STATUS_META).map(key => [key, 0]));
      const regionMastered = Object.fromEntries(REGION_ORDER.map(region => [region, 0]));
      let mastered = 0;
      let due = 0;
      for (const item of entries) {
        const status = statusForProgress(item.progress);
        statusCounts[status] += 1;
        if (status === 'mastered') {
          mastered += 1;
          regionMastered[item.country.regionPedagogica] += 1;
        }
        if (status === 'review') due += 1;
      }
      const lastExam = this.state.history.at(-1) || null;
      return {
        attempts,
        correct,
        errors: attempts - correct,
        accuracy: attempts ? correct / attempts : 0,
        seen,
        mastered,
        due,
        statusCounts,
        regionMastered,
        bestStreak: this.state.meta.bestStreak,
        currentStreak: this.state.meta.currentStreak,
        totalStudySeconds: this.state.meta.totalStudySeconds,
        exams: this.state.history.length,
        lastExam
      };
    }

    getWeakCountries(limit = 8, region = 'all') {
      return countryPool(region)
        .map(country => ({ country, progress: this.state.progress[country.id], status: statusForProgress(this.state.progress[country.id]) }))
        .sort((a, b) => {
          const priorityA = (a.status === 'review' ? 120 : 0) + (100 - a.progress.mastery) + a.progress.errors * 3 - a.progress.correct;
          const priorityB = (b.status === 'review' ? 120 : 0) + (100 - b.progress.mastery) + b.progress.errors * 3 - b.progress.correct;
          return priorityB - priorityA;
        })
        .slice(0, limit);
    }

    adaptivePool(region = 'all') {
      const source = countryPool(region);
      const weighted = [];
      for (const country of source) {
        const p = this.state.progress[country.id];
        const status = statusForProgress(p);
        let weight = 1;
        if (status === 'new') weight = 3;
        else if (status === 'learning') weight = 5;
        else if (status === 'practice') weight = 4;
        else if (status === 'almost') weight = 2;
        else if (status === 'review') weight = 7;
        else if (status === 'mastered') weight = 1;
        for (let i = 0; i < weight; i += 1) weighted.push(country);
      }
      return weighted;
    }

    checkAchievements() {
      const context = { summary: this.summary(), history: this.state.history, meta: this.state.meta };
      const newlyUnlocked = [];
      for (const achievement of ACHIEVEMENTS) {
        if (!this.state.achievements.includes(achievement.id) && achievement.test(context)) {
          this.state.achievements.push(achievement.id);
          newlyUnlocked.push(achievement);
        }
      }
      if (newlyUnlocked.length) {
        this.save();
        this.dispatchEvent(new CustomEvent('achievement', { detail: newlyUnlocked }));
      }
    }

    exportData() {
      return JSON.stringify({ product: 'Atlas América 3D', exportedAt: new Date().toISOString(), data: this.state }, null, 2);
    }

    importData(text) {
      const parsed = JSON.parse(text);
      const incoming = parsed?.data || parsed;
      if (!incoming || incoming.version !== 1 || !incoming.progress || !incoming.settings) throw new Error('Formato de progreso no compatible.');
      const base = defaultState();
      this.state = {
        ...base,
        ...incoming,
        settings: { ...base.settings, ...incoming.settings },
        meta: { ...base.meta, ...incoming.meta },
        history: Array.isArray(incoming.history) ? incoming.history.slice(-60) : [],
        achievements: Array.isArray(incoming.achievements) ? incoming.achievements : [],
        progress: { ...base.progress }
      };
      for (const country of DATA.countries) {
        this.state.progress[country.id] = { ...defaultCountryProgress(), ...(incoming.progress[country.id] || {}) };
        const p = this.state.progress[country.id];
        p.accuracy = p.attempts ? p.correct / p.attempts : 0;
        p.mastery = computeMastery(p);
      }
      this.save(true);
      this.dispatchEvent(new CustomEvent('change', { detail: { type: 'import' } }));
    }

    reset() {
      this.state = defaultState();
      this.save(true);
      this.dispatchEvent(new CustomEvent('change', { detail: { type: 'reset' } }));
    }
  }

  class AudioEngine {
    constructor(store) {
      this.store = store;
      this.context = null;
    }

    ensureContext() {
      if (!this.context) {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (AudioContext) this.context = new AudioContext();
      }
      if (this.context?.state === 'suspended') this.context.resume().catch(() => {});
      return this.context;
    }

    tone(type = 'correct') {
      if (!this.store.state.settings.sound) return;
      const context = this.ensureContext();
      if (!context) return;
      const gain = context.createGain();
      const oscillator = context.createOscillator();
      const volume = this.store.state.settings.volume * .08;
      const presets = {
        correct: [620, 820, .15],
        incorrect: [220, 160, .18],
        achievement: [523, 784, .28],
        tick: [420, 420, .05]
      };
      const [start, end, duration] = presets[type] || presets.correct;
      oscillator.type = type === 'incorrect' ? 'sawtooth' : 'sine';
      oscillator.frequency.setValueAtTime(start, context.currentTime);
      oscillator.frequency.exponentialRampToValueAtTime(Math.max(30, end), context.currentTime + duration);
      gain.gain.setValueAtTime(0.0001, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(Math.max(.0001, volume), context.currentTime + .02);
      gain.gain.exponentialRampToValueAtTime(.0001, context.currentTime + duration);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start();
      oscillator.stop(context.currentTime + duration + .02);
    }

    speak(text, options = {}) {
      if (!('speechSynthesis' in window) || !text) return false;
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = options.lang || 'es-AR';
      utterance.rate = options.rate || .92;
      utterance.pitch = options.pitch || 1;
      utterance.volume = clamp(this.store.state.settings.volume || .7, .1, 1);
      const voices = window.speechSynthesis.getVoices();
      const voice = voices.find(item => item.lang.toLowerCase().startsWith('es'));
      if (voice) utterance.voice = voice;
      window.speechSynthesis.speak(utterance);
      return true;
    }
  }

  function svgIcon(id, className = '') {
    return `<svg${className ? ` class="${className}"` : ''} aria-hidden="true"><use href="#${id}"></use></svg>`;
  }

  function hexToRgba(hex, alpha = 1) {
    const clean = hex.replace('#', '');
    const value = parseInt(clean.length === 3 ? clean.split('').map(c => c + c).join('') : clean, 16);
    const red = (value >> 16) & 255;
    const green = (value >> 8) & 255;
    const blue = value & 255;
    return `rgba(${red},${green},${blue},${alpha})`;
  }

  // Sombrea un color hex por un factor de luz (día/noche) devolviendo rgba.
  function shadeHex(hex, factor = 1, alpha = 1) {
    const clean = hex.replace('#', '');
    const value = parseInt(clean.length === 3 ? clean.split('').map(c => c + c).join('') : clean, 16);
    const r = Math.round(clamp(((value >> 16) & 255) * factor, 0, 255));
    const g = Math.round(clamp(((value >> 8) & 255) * factor, 0, 255));
    const b = Math.round(clamp((value & 255) * factor, 0, 255));
    return `rgba(${r},${g},${b},${alpha})`;
  }

  function featureRings(feature) {
    if (!feature?.geometry) return [];
    if (feature.geometry.type === 'Polygon') return feature.geometry.coordinates;
    if (feature.geometry.type === 'MultiPolygon') return feature.geometry.coordinates.flat();
    return [];
  }

  // Área aproximada (bbox mayor, en grados²) de un país; sirve para priorizar etiquetas y elegir el zoom.
  function lngSpanAM(lngs) {
    if (lngs.length < 2) return 0;
    const s = Array.from(new Set(lngs)).sort((a, b) => a - b);
    let maxGap = (s[0] + 360) - s[s.length - 1];
    for (let i = 1; i < s.length; i++) { const g = s[i] - s[i - 1]; if (g > maxGap) maxGap = g; }
    return 360 - maxGap;
  }
  function countryBBoxArea(country) {
    if (!country) return 0;
    if (country.__bboxArea != null) return country.__bboxArea;
    const feature = featuresByIso3.get(country.iso3);
    let area = 0;
    if (feature) {
      let minLat = Infinity, maxLat = -Infinity; const lngs = [];
      for (const ring of featureRings(feature)) for (const [lon, lat] of ring) { lngs.push(lon); if (lat < minLat) minLat = lat; if (lat > maxLat) maxLat = lat; }
      if (lngs.length) area = (maxLat - minLat) * lngSpanAM(lngs);
    }
    country.__bboxArea = area;
    return area;
  }
  // Zoom sugerido para centrar un país según su tamaño (chico → más cerca).
  function zoomForCountry(country) {
    const a = countryBBoxArea(country);
    if (a > 150) return 1.2;
    if (a > 55) return 1.6;
    if (a > 12) return 2.1;
    if (a > 3) return 2.7;
    return 3.1;
  }

  function featurePolygons(feature) {
    if (!feature?.geometry) return [];
    if (feature.geometry.type === 'Polygon') return [feature.geometry.coordinates];
    if (feature.geometry.type === 'MultiPolygon') return feature.geometry.coordinates;
    return [];
  }

  function pointInRing(lon, lat, ring) {
    let inside = false;
    for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index++) {
      let xi = ring[index][0];
      let xj = ring[previous][0];
      const yi = ring[index][1];
      const yj = ring[previous][1];
      while (xi - lon > 180) xi -= 360;
      while (xi - lon < -180) xi += 360;
      while (xj - lon > 180) xj -= 360;
      while (xj - lon < -180) xj += 360;
      const intersects = ((yi > lat) !== (yj > lat)) && (lon < ((xj - xi) * (lat - yi)) / ((yj - yi) || 1e-9) + xi);
      if (intersects) inside = !inside;
    }
    return inside;
  }

  function pointInFeature(lon, lat, feature) {
    for (const polygon of featurePolygons(feature)) {
      if (!polygon[0] || !pointInRing(lon, lat, polygon[0])) continue;
      const inHole = polygon.slice(1).some(hole => pointInRing(lon, lat, hole));
      if (!inHole) return true;
    }
    return false;
  }

  function adjustAmericanLongitude(lon) {
    return lon > -15 ? lon - 360 : lon;
  }

  function projectMap2D(lat, lon, width = 930, height = 700) {
    const adjusted = adjustAmericanLongitude(lon);
    const minLon = -180;
    const maxLon = -28;
    const minLat = -60;
    const maxLat = 84;
    return [
      ((adjusted - minLon) / (maxLon - minLon)) * width,
      ((maxLat - lat) / (maxLat - minLat)) * height
    ];
  }

  function createPath2D(feature, width = 930, height = 700) {
    const chunks = [];
    for (const polygon of featurePolygons(feature)) {
      for (const ring of polygon) {
        let path = '';
        let previous = null;
        for (const coordinate of ring) {
          const lon = adjustAmericanLongitude(coordinate[0]);
          const lat = coordinate[1];
          if (lon < -184 || lon > -24 || lat < -65 || lat > 88) continue;
          const point = projectMap2D(lat, lon, width, height);
          const jump = previous && Math.abs(point[0] - previous[0]) > width * .35;
          path += `${!previous || jump ? 'M' : 'L'}${point[0].toFixed(1)},${point[1].toFixed(1)}`;
          previous = point;
        }
        if (path) chunks.push(`${path}Z`);
      }
    }
    return chunks.join('');
  }

  function renderMap2D(container, options = {}) {
    if (!container) return;
    const {
      selectedId = null,
      onSelect = null,
      statusProvider = null,
      showLabels = true,
      compact = false,
      region = 'all'
    } = options;
    const width = 930;
    const height = compact ? 610 : 700;
    const source = countryPool(region);
    const sourceIds = new Set(source.map(country => country.id));
    const defs = Object.entries(STATUS_META).map(([key, meta], index) => `
      <pattern id="status-${key}-${container.id || 'map'}" patternUnits="userSpaceOnUse" width="${10 + index}" height="${10 + index}" patternTransform="rotate(${index % 2 ? 45 : -45})">
        <rect width="100%" height="100%" fill="${meta.color}" fill-opacity=".62"></rect>
        <path d="M0 0V${10 + index}" stroke="rgba(2,10,20,.45)" stroke-width="2"></path>
      </pattern>`).join('');
    const paths = [];
    const markers = [];
    const labels = [];
    for (const country of source) {
      const feature = featuresByIso3.get(country.iso3);
      const status = statusProvider ? statusProvider(country) : null;
      const color = status ? `url(#status-${status}-${container.id || 'map'})` : DATA.regions[country.regionPedagogica].color;
      if (feature) {
        const d = createPath2D(feature, width, height);
        if (d) paths.push(`<path class="map-country${selectedId === country.id ? ' is-selected' : ''}" data-country-id="${country.id}" tabindex="0" role="button" aria-label="${escapeHTML(country.nombreES)}, capital ${escapeHTML(country.capitalPrincipal)}" d="${d}" fill="${color}" fill-opacity="${status ? '1' : '.66'}"></path>`);
      }
      const [x, y] = projectMap2D(country.coordenadasCapital[0], country.coordenadasCapital[1], width, height);
      const noGeometry = !feature;
      markers.push(`<g class="map-marker-group" data-country-id="${country.id}" tabindex="0" role="button" aria-label="${escapeHTML(country.nombreES)}, capital ${escapeHTML(country.capitalPrincipal)}"><circle class="map-capital" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${noGeometry ? 5.4 : 3.2}" fill="${DATA.regions[country.regionPedagogica].color}"></circle>${noGeometry ? `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="10" fill="none" stroke="${DATA.regions[country.regionPedagogica].color}" stroke-opacity=".55" stroke-dasharray="2 3"></circle>` : ''}</g>`);
      if (showLabels && (noGeometry || compact === false)) {
        const anchor = country.regionPedagogica === 'caribe' ? 'start' : 'middle';
        const dx = country.regionPedagogica === 'caribe' ? 8 : 0;
        const dy = country.regionPedagogica === 'caribe' ? -5 : -7;
        labels.push(`<text class="map-label" x="${(x + dx).toFixed(1)}" y="${(y + dy).toFixed(1)}" text-anchor="${anchor}">${escapeHTML(country.nombreES)}</text>`);
      }
    }
    container.innerHTML = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Mapa 2D de los Estados independientes de América"><defs>${defs}</defs><path d="M0 0H${width}V${height}H0Z" fill="transparent"></path><g>${paths.join('')}</g><g>${markers.join('')}</g><g>${labels.join('')}</g></svg>`;
    const activate = element => {
      const id = element.closest('[data-country-id]')?.dataset.countryId;
      if (id && onSelect) onSelect(countryById.get(id));
    };
    container.onclick = event => activate(event.target);
    container.onkeydown = event => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        activate(event.target);
      }
    };
  }

  function silhouetteSVG(country, options = {}) {
    const feature = featuresByIso3.get(country.iso3);
    if (!feature) {
      return `<div class="silhouette-fallback">${flagEmoji(country.iso2)}<span>Estado insular representado por marcador a esta escala</span></div>`;
    }
    const coordinates = featureRings(feature).flat();
    let minLon = Infinity;
    let maxLon = -Infinity;
    let minLat = Infinity;
    let maxLat = -Infinity;
    coordinates.forEach(([rawLon, lat]) => {
      const lon = adjustAmericanLongitude(rawLon);
      minLon = Math.min(minLon, lon);
      maxLon = Math.max(maxLon, lon);
      minLat = Math.min(minLat, lat);
      maxLat = Math.max(maxLat, lat);
    });
    const width = options.width || 340;
    const height = options.height || 200;
    const padding = 16;
    const scale = Math.min((width - padding * 2) / Math.max(1, maxLon - minLon), (height - padding * 2) / Math.max(1, maxLat - minLat));
    const offsetX = (width - (maxLon - minLon) * scale) / 2;
    const offsetY = (height - (maxLat - minLat) * scale) / 2;
    const paths = [];
    for (const ring of featureRings(feature)) {
      let d = '';
      ring.forEach(([rawLon, lat], index) => {
        const lon = adjustAmericanLongitude(rawLon);
        const x = offsetX + (lon - minLon) * scale;
        const y = offsetY + (maxLat - lat) * scale;
        d += `${index ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`;
      });
      if (d) paths.push(`${d}Z`);
    }
    return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Silueta cartográfica de ${escapeHTML(country.nombreES)}"><path d="${paths.join('')}" fill="${DATA.regions[country.regionPedagogica].color}" fill-opacity=".75" stroke="rgba(231,245,255,.85)" stroke-width="1.4" vector-effect="non-scaling-stroke"></path></svg>`;
  }

  // ==== Globo satelital real con MapLibre GL (proyección de globo + imágenes Esri) ====
  const AMERICAS_BOUNDS = [[-138, -56], [-34, 64]];
  const REGION_VIEW = {
    all: { c: [10, 20], z: 1.35 },
    norteamerica: { c: [-100, 45], z: 2.3 }, centroamerica: { c: [-86, 13], z: 4 }, caribe: { c: [-71, 18], z: 3.7 }, sudamerica: { c: [-60, -18], z: 2.4 },
    europa: { c: [12, 52], z: 2.9 }, africa: { c: [18, 3], z: 2.3 }, asia: { c: [95, 38], z: 2.0 }, oceania: { c: [150, -22], z: 2.6 },
  };
  const REGION_HEX = Object.fromEntries(REGION_ORDER.map(r => [r, DATA.regions[r].color]));
  function regionMatch(prop, fallback) {
    const expr = ['match', ['get', 'region']];
    for (const r of REGION_ORDER) { expr.push(r, REGION_HEX[r]); }
    expr.push(fallback || '#8aa0b4');
    return expr;
  }
  function geomBounds(feature) {
    let b = [Infinity, Infinity, -Infinity, -Infinity];
    for (const ring of featureRings(feature)) for (const [lon, lat] of ring) {
      if (lon < b[0]) b[0] = lon; if (lat < b[1]) b[1] = lat; if (lon > b[2]) b[2] = lon; if (lat > b[3]) b[3] = lat;
    }
    return b;
  }

  class GlobeRenderer extends EventTarget {
    constructor(stage, store) {
      super();
      this.stage = stage;
      this.store = store;
      this.selectedId = null;
      this.compareIds = [];
      this.regionFilter = 'all';
      this.interactionMode = 'explore';
      this.questionCountry = null;
      this.routeMode = false;
      this.style = store.state.settings.globeStyle || 'educational';
      this.showLabels = store.state.settings.showLabels !== false;
      this.showCapitals = store.state.settings.showCapitals !== false;
      this.hoveredId = null;
      this.spin = store.state.settings.autoRotate !== false;
      this.paused = false;
      this.ready = false;
      this.available = typeof maplibregl !== 'undefined';
      this._spinRAF = 0;
      this._lastInteract = 0;
      this._buildData();
      this._initMap();
      this.renderLegend();
      this.resizeObserver = new ResizeObserver(() => this.resize());
      this.resizeObserver.observe(stage);
    }

    _buildData() {
      this.countriesFC = {
        type: 'FeatureCollection',
        features: DATA.geojson.features.map(f => {
          const c = countryByIso3.get(f.properties.iso3);
          return { type: 'Feature', geometry: f.geometry, properties: Object.assign({}, f.properties, { cid: c ? c.id : f.properties.iso3, region: c ? c.regionPedagogica : 'sur', name: c ? c.nombreES : f.properties.iso3 }) };
        })
      };
      this.capitalsFC = {
        type: 'FeatureCollection',
        features: DATA.countries.map(c => ({ type: 'Feature', properties: { cid: c.id, name: c.capitalPrincipal, region: c.regionPedagogica, country: c.nombreES }, geometry: { type: 'Point', coordinates: [c.coordenadasCapital[1], c.coordenadasCapital[0]] } }))
      };
      this.labelsFC = {
        type: 'FeatureCollection',
        features: DATA.countries.map(c => ({ type: 'Feature', properties: { cid: c.id, name: c.nombreES, region: c.regionPedagogica, area: countryBBoxArea(c) }, geometry: { type: 'Point', coordinates: [c.coordenadasPais[1], c.coordenadasPais[0]] } }))
      };
    }

    _mapHost() {
      let host = this.stage.querySelector('#globeMap');
      if (!host) {
        host = document.createElement('div');
        host.id = 'globeMap';
        host.className = 'globe-map';
        this.stage.insertBefore(host, this.stage.firstChild);
      }
      return host;
    }

    _initMap() {
      if (!this.available) {
        this.stage.classList.add('is-fallback');
        const s = $('#globeStatusText'); if (s) s.textContent = 'No se pudo cargar el mapa 3D · usá la vista 2D accesible';
        return;
      }
      const brightness = this.style === 'night' ? 0.6 : 1;
      try {
        this.map = new maplibregl.Map({
          container: this._mapHost(),
          attributionControl: { compact: true },
          style: {
            version: 8,
            projection: { type: 'globe' },
            glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
            sources: {
              sat: { type: 'raster', tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'], tileSize: 256, maxzoom: 19, attribution: 'Imágenes: Esri, Maxar, Earthstar Geographics · Fronteras: Natural Earth' }
            },
            layers: [
              { id: 'bg', type: 'background', paint: { 'background-color': '#05101f' } },
              { id: 'sat', type: 'raster', source: 'sat', paint: { 'raster-brightness-max': brightness, 'raster-saturation': 0, 'raster-fade-duration': 250 } }
            ],
            sky: { 'atmosphere-blend': ['interpolate', ['linear'], ['zoom'], 0, 1, 5, 0.5, 7, 0] }
          },
          center: [-80, 8],
          zoom: 2.1,
          minZoom: 1,
          maxZoom: 16,
          dragRotate: false,
          pitchWithRotate: false
        });
      } catch (error) {
        console.warn('MapLibre no disponible:', error);
        this.available = false;
        this.stage.classList.add('is-fallback');
        return;
      }
      this.map.on('load', () => this._onLoad());
      this.map.on('error', e => { const msg = e && e.error && e.error.message; if (msg) console.warn('Mapa:', msg); });
      ['dragstart', 'zoomstart', 'rotatestart', 'mousedown', 'touchstart', 'wheel'].forEach(ev => this.map.on(ev, () => { this._lastInteract = performance.now(); }));
    }

    _onLoad() {
      const map = this.map;
      map.addSource('countries', { type: 'geojson', data: this.countriesFC, promoteId: 'cid' });
      map.addSource('capitals', { type: 'geojson', data: this.capitalsFC });
      map.addSource('labels', { type: 'geojson', data: this.labelsFC });
      map.addSource('conn', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      map.addSource('pick', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });

      map.addLayer({
        id: 'country-fill', type: 'fill', source: 'countries',
        paint: {
          'fill-color': regionMatch('region'),
          'fill-opacity': ['case', ['boolean', ['feature-state', 'selected'], false], 0.5, ['boolean', ['feature-state', 'hover'], false], 0.32, this.style === 'political' ? 0.34 : 0.1]
        }
      });
      map.addLayer({
        id: 'country-line', type: 'line', source: 'countries',
        paint: {
          'line-color': ['case', ['boolean', ['feature-state', 'selected'], false], '#ffffff', regionMatch('region')],
          'line-width': ['case', ['boolean', ['feature-state', 'selected'], false], 2.6, ['boolean', ['feature-state', 'hover'], false], 1.6, 0.9],
          'line-opacity': 0.9
        }
      });
      map.addLayer({ id: 'conn-line', type: 'line', source: 'conn', paint: { 'line-color': '#7fd0ff', 'line-width': 1.8, 'line-dasharray': [2, 1.6], 'line-opacity': 0.9 } });
      map.addLayer({
        id: 'capital-dot', type: 'circle', source: 'capitals',
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 2, 3, 6, 5, 10, 7],
          'circle-color': '#ffd773', 'circle-stroke-color': '#3a2a05', 'circle-stroke-width': 1.2, 'circle-opacity': 0.95
        }
      });
      map.addLayer({
        id: 'capital-label', type: 'symbol', source: 'capitals',
        layout: { 'text-field': ['get', 'name'], 'text-font': ['Open Sans Semibold'], 'text-size': ['interpolate', ['linear'], ['zoom'], 3, 10, 6, 13], 'text-offset': [0, 1.1], 'text-anchor': 'top', 'text-optional': true, 'text-allow-overlap': false },
        paint: { 'text-color': '#ffe9b0', 'text-halo-color': 'rgba(4,10,20,0.9)', 'text-halo-width': 1.6 },
        minzoom: 3.4
      });
      map.addLayer({
        id: 'country-label', type: 'symbol', source: 'labels',
        layout: {
          'text-field': ['get', 'name'], 'text-font': ['Open Sans Semibold'],
          'text-size': ['interpolate', ['linear'], ['zoom'], 2, 11, 5, 15, 8, 18],
          'symbol-sort-key': ['-', 200, ['get', 'area']],
          'text-allow-overlap': false, 'text-padding': 4, 'text-max-width': 8
        },
        paint: { 'text-color': '#ffffff', 'text-halo-color': 'rgba(3,10,20,0.92)', 'text-halo-width': 2, 'text-halo-blur': 0.4 }
      });

      map.addLayer({ id: 'pick-halo', type: 'circle', source: 'pick', paint: { 'circle-radius': 14, 'circle-color': ['match', ['get', 'kind'], 'cap', 'rgba(52,211,153,.22)', 'rgba(255,90,122,.22)'], 'circle-stroke-color': ['match', ['get', 'kind'], 'cap', '#34d399', '#ff5a7a'], 'circle-stroke-width': 2 } });
      map.addLayer({ id: 'pick-dot', type: 'circle', source: 'pick', paint: { 'circle-radius': 5.5, 'circle-color': ['match', ['get', 'kind'], 'cap', '#34d399', '#ff5a7a'], 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 1.6 } });
      // Interacciones
      map.on('mousemove', 'country-fill', e => {
        if (!e.features.length) return;
        const cid = e.features[0].properties.cid;
        if (this.hoveredId && this.hoveredId !== cid) map.setFeatureState({ source: 'countries', id: this.hoveredId }, { hover: false });
        this.hoveredId = cid;
        map.setFeatureState({ source: 'countries', id: cid }, { hover: true });
        map.getCanvas().style.cursor = 'pointer';
        const country = countryById.get(cid);
        if (country) this._showTooltip(e.point, country);
      });
      map.on('mouseleave', 'country-fill', () => {
        if (this.hoveredId) map.setFeatureState({ source: 'countries', id: this.hoveredId }, { hover: false });
        this.hoveredId = null;
        map.getCanvas().style.cursor = '';
        this._hideTooltip();
      });
      map.on('click', e => {
        if (this.interactionMode === 'pick-location') {
          this.dispatchEvent(new CustomEvent('location-pick', { detail: { lat: e.lngLat.lat, lon: e.lngLat.lng } }));
          this._showPick([e.lngLat.lng, e.lngLat.lat]);
          return;
        }
        const feats = map.queryRenderedFeatures(e.point, { layers: ['country-fill', 'capital-dot'] });
        if (!feats.length) return;
        const country = countryById.get(feats[0].properties.cid);
        if (!country) return;
        if (this.interactionMode === 'pick-country') this.dispatchEvent(new CustomEvent('country-pick', { detail: country }));
        else this.selectCountry(country.id, { fly: true, emit: true });
      });

      this.ready = true;
      const loader = $('#globeLoader'); if (loader) loader.classList.add('is-hidden');
      const status = $('#globeStatusText'); if (status) status.textContent = 'Globo satelital · arrastra para rotar, rueda para acercar';
      // aplicar estado inicial
      this._applyLabels(); this._applyCapitals(); this._applyStyle();
      if (this.selectedId) this.selectCountry(this.selectedId, { fly: true, emit: false });
      else this.fitRegion(this.regionFilter);
      if (this.routeMode) this._drawRoute();
      // controles del toolbar del globo
      $('#zoomIn')?.addEventListener('click', () => this.map.zoomIn());
      $('#zoomOut')?.addEventListener('click', () => this.map.zoomOut());
      $('#resetView')?.addEventListener('click', () => this.reset());
      $('#toggleGlobeMotion')?.addEventListener('click', () => this.togglePause());
      this._startSpin();
    }

    _showTooltip(point, country) {
      const tip = $('#globeTooltip'); if (!tip) return;
      tip.hidden = false;
      tip.innerHTML = `<strong>${escapeHTML(country.nombreES)}</strong><span>${escapeHTML(country.capitalPrincipal)}</span>`;
      tip.style.left = point.x + 'px';
      tip.style.top = point.y + 'px';
    }
    _hideTooltip() { const tip = $('#globeTooltip'); if (tip) tip.hidden = true; }
    _showPick(mark) {
      if (!this.ready || !this.map.getSource('pick')) return;
      const feats = [{ type: 'Feature', properties: { kind: 'mark' }, geometry: { type: 'Point', coordinates: mark } }];
      const q = this.questionCountry;
      if (q && q.__revealLocation) {
        const cap = [q.coordenadasCapital[1], q.coordenadasCapital[0]];
        feats.push({ type: 'Feature', properties: { kind: 'cap' }, geometry: { type: 'Point', coordinates: cap } });
        this.map.getSource('conn')?.setData({ type: 'FeatureCollection', features: [{ type: 'Feature', geometry: { type: 'LineString', coordinates: [mark, cap] } }] });
      }
      this.map.getSource('pick').setData({ type: 'FeatureCollection', features: feats });
    }

    // ---- API pública (compatible con la app) ----
    resize() { if (this.map) this.map.resize(); }

    setRegionFilter(region) {
      this.regionFilter = REGION_ORDER.includes(region) ? region : 'all';
      this.renderLegend();
      if (this.ready && !this.selectedId) this.fitRegion(this.regionFilter);
    }

    fitRegion(region) {
      if (!this.ready) return;
      const V = REGION_VIEW[region] || REGION_VIEW.all;
      this.map.flyTo({ center: V.c, zoom: V.z, duration: 1000 });
    }

    selectCountry(id, options = {}) {
      const country = countryById.get(id);
      if (!country) return;
      if (this.selectedId && this.ready) this.map.setFeatureState({ source: 'countries', id: this.selectedId }, { selected: false });
      this.selectedId = id;
      if (this.ready) {
        this.map.setFeatureState({ source: 'countries', id }, { selected: true });
        this._drawConnector(country);
        if (options.fly !== false) this._frameCountry(country);
      }
      if (options.emit) this.dispatchEvent(new CustomEvent('select', { detail: country }));
    }

    _frameCountry(country) {
      const f = featuresByIso3.get(country.iso3);
      if (f) {
        const b = geomBounds(f);
        if (b[0] > -Infinity && (b[2] - b[0]) <= 180) { this.map.fitBounds([[b[0], b[1]], [b[2], b[3]]], { padding: 70, duration: 950, maxZoom: 7.6 }); return; }
      }
      this.map.flyTo({ center: [country.coordenadasPais[1], country.coordenadasPais[0]], zoom: zoomForCountry(country), duration: 900 });
    }

    _drawConnector(country) {
      if (!this.map.getSource('conn')) return;
      this.map.getSource('conn').setData({
        type: 'FeatureCollection',
        features: [{ type: 'Feature', geometry: { type: 'LineString', coordinates: [[country.coordenadasPais[1], country.coordenadasPais[0]], [country.coordenadasCapital[1], country.coordenadasCapital[0]]] } }]
      });
    }

    flyTo(lat, lon, zoom = 1.35, duration = 900) {
      if (!this.ready) return;
      const mz = clamp(2.3 + Math.log2(Math.max(0.4, zoom)) * 2.6, 1.4, 9);
      this.map.flyTo({ center: [lon, lat], zoom: mz, duration });
    }

    focusCountries(ids) {
      const list = ids.map(id => countryById.get(id)).filter(Boolean);
      if (!list.length || !this.ready) return;
      let b = [Infinity, Infinity, -Infinity, -Infinity];
      list.forEach(c => { const f = featuresByIso3.get(c.iso3); if (!f) return; const g = geomBounds(f); b[0] = Math.min(b[0], g[0]); b[1] = Math.min(b[1], g[1]); b[2] = Math.max(b[2], g[2]); b[3] = Math.max(b[3], g[3]); });
      if (b[0] !== Infinity) this.map.fitBounds([[b[0], b[1]], [b[2], b[3]]], { padding: 70, duration: 950, maxZoom: 6 });
    }

    setCompare(ids = []) {
      this.compareIds = ids.filter(id => countryById.has(id)).slice(0, 2);
      this.selectedId = this.compareIds[0] || null;
      if (!this.ready) return;
      if (this.compareIds.length === 2) {
        const a = countryById.get(this.compareIds[0]), b = countryById.get(this.compareIds[1]);
        this.map.getSource('conn')?.setData({ type: 'FeatureCollection', features: [{ type: 'Feature', geometry: { type: 'LineString', coordinates: [[a.coordenadasCapital[1], a.coordenadasCapital[0]], [b.coordenadasCapital[1], b.coordenadasCapital[0]]] } }] });
        this.focusCountries(this.compareIds);
      }
    }

    setStyle(style) { this.style = ['educational', 'political', 'night'].includes(style) ? style : 'educational'; if (this.ready) this._applyStyle(); }
    _applyStyle() {
      const bright = this.style === 'night' ? 0.55 : 1;
      const sat = this.style === 'political' ? -0.55 : this.style === 'night' ? -0.2 : 0;
      this.map.setPaintProperty('sat', 'raster-brightness-max', bright);
      this.map.setPaintProperty('sat', 'raster-saturation', sat);
      const baseOpacity = this.style === 'political' ? 0.36 : this.style === 'night' ? 0.18 : 0.1;
      this.map.setPaintProperty('country-fill', 'fill-opacity', ['case', ['boolean', ['feature-state', 'selected'], false], 0.5, ['boolean', ['feature-state', 'hover'], false], 0.32, baseOpacity]);
    }

    setLabels(value) { this.showLabels = Boolean(value); if (this.ready) this._applyLabels(); }
    _applyLabels() { const v = this.showLabels ? 'visible' : 'none'; ['country-label'].forEach(l => this.map.getLayer(l) && this.map.setLayoutProperty(l, 'visibility', v)); }

    setCapitals(value) { this.showCapitals = Boolean(value); if (this.ready) this._applyCapitals(); }
    _applyCapitals() { const v = this.showCapitals ? 'visible' : 'none'; ['capital-dot', 'capital-label'].forEach(l => this.map.getLayer(l) && this.map.setLayoutProperty(l, 'visibility', v)); }

    setRouteMode(value) { this.routeMode = Boolean(value); if (this.ready) this.routeMode ? this._drawRoute() : this._clearRoute(); }
    _drawRoute() {
      const path = ['canada', 'estados-unidos', 'mexico', 'guatemala', 'panama', 'colombia', 'peru', 'bolivia', 'argentina'].map(id => countryById.get(id)).filter(Boolean);
      const coords = path.map(c => [c.coordenadasCapital[1], c.coordenadasCapital[0]]);
      this.map.getSource('conn')?.setData({ type: 'FeatureCollection', features: [{ type: 'Feature', geometry: { type: 'LineString', coordinates: coords } }] });
    }
    _clearRoute() { if (!this.selectedId) this.map.getSource('conn')?.setData({ type: 'FeatureCollection', features: [] }); }

    setInteractionMode(mode = 'explore', country = null) {
      this.interactionMode = mode;
      this.questionCountry = country;
      if (this.stage) this.stage.dataset.interaction = mode;
      const status = $('#globeStatusText');
      if (status) {
        if (mode === 'pick-country') status.textContent = 'Pregunta activa · tocá el país correcto';
        else if (mode === 'pick-location') status.textContent = 'Pregunta activa · marcá la ubicación aproximada';
        else status.textContent = this.available ? 'Globo satelital · arrastra para rotar, rueda para acercar' : 'Vista 2D accesible disponible';
      }
      if (this.ready && this.map.getSource('conn')) { this.map.getSource('conn').setData({ type: 'FeatureCollection', features: [] }); this.map.getSource('pick')?.setData({ type: 'FeatureCollection', features: [] }); }
    }

    flash(type = 'correct') {
      this.stage.classList.remove('flash-correct', 'flash-error');
      void this.stage.offsetWidth;
      this.stage.classList.add(type === 'correct' ? 'flash-correct' : 'flash-error');
      window.setTimeout(() => this.stage.classList.remove('flash-correct', 'flash-error'), 550);
    }

    reset() {
      if (this.selectedId && this.ready) this.map.setFeatureState({ source: 'countries', id: this.selectedId }, { selected: false });
      this.selectedId = null;
      this.compareIds = [];
      if (this.ready) { this.map.getSource('conn')?.setData({ type: 'FeatureCollection', features: [] }); this.fitRegion(this.regionFilter); }
      this.spin = this.store.state.settings.autoRotate !== false;
    }

    togglePause(force) {
      this.paused = typeof force === 'boolean' ? force : !this.paused;
      this.stage.classList.toggle('paused', this.paused);
      const button = $('#toggleGlobeMotion');
      if (button) { button.setAttribute('aria-pressed', String(this.paused)); button.innerHTML = `${svgIcon(this.paused ? 'icon-play' : 'icon-pause')}<span class="sr-only">${this.paused ? 'Reanudar' : 'Pausar'} rotación</span>`; }
      return this.paused;
    }

    // Rotación suave del globo cuando está inactivo
    _startSpin() {
      if (this._spinRAF) return;
      const tick = () => {
        this._spinRAF = requestAnimationFrame(tick);
        if (!this.ready || this.paused || this.store.state.settings.reducedMotion) return;
        if (!this.spin || this.interactionMode !== 'explore') return;
        if (performance.now() - this._lastInteract < 2600) return;
        if (this.map.getZoom() > 3.2 || this.map.isMoving() || this.selectedId) return;
        const c = this.map.getCenter();
        this.map.setCenter([c.lng - 0.12, c.lat]);
      };
      this._spinRAF = requestAnimationFrame(tick);
    }

    renderLegend() {
      const legend = $('#globeLegend'); if (!legend) return;
      legend.innerHTML = REGION_ORDER.map(r => `<span class="legend-item"><span class="legend-swatch" style="background:${DATA.regions[r].color}"></span>${DATA.regions[r].nombre}</span>`).join('');
    }

    destroy() {
      if (this._spinRAF) cancelAnimationFrame(this._spinRAF);
      this.resizeObserver.disconnect();
      if (this.map) this.map.remove();
    }
  }

  function shortestLongitudeDelta(from, to) {
    let delta = to - from;
    while (delta > 180) delta -= 360;
    while (delta < -180) delta += 360;
    return delta;
  }

  class LearningController {
    constructor(app) {
      this.app = app;
      this.deck = [];
      this.index = 0;
      this.started = false;
      this.playing = false;
      this.timer = 0;
      this.quickAnswered = false;
      $('#learnRegion').addEventListener('change', () => this.reset());
      $('#learnPlay').addEventListener('click', () => this.toggle());
      $('#learnPrev').addEventListener('click', () => this.previous());
      $('#learnNext').addEventListener('click', () => this.next());
      this.reset();
    }

    reset() {
      this.stop();
      const region = $('#learnRegion').value;
      this.deck = [...countryPool(region)].sort((a, b) => a.orden - b.orden);
      this.index = 0;
      this.started = false;
      this.quickAnswered = false;
      $('#guidedCard').innerHTML = `<div class="guided-placeholder">${svgIcon('icon-route')}<h2>Recorrido preparado</h2><p>${this.deck.length} países ordenados geográficamente. Presiona Iniciar para comenzar.</p></div>`;
      $('#quickCheck').hidden = true;
      this.renderProgress();
      this.updatePlayButton();
    }

    toggle() {
      if (!this.started) {
        this.started = true;
        this.showCurrent();
      }
      this.playing = !this.playing;
      if (this.playing) this.schedule();
      else clearTimeout(this.timer);
      this.updatePlayButton();
    }

    stop() {
      this.playing = false;
      clearTimeout(this.timer);
      this.updatePlayButton();
    }

    schedule() {
      clearTimeout(this.timer);
      if (!this.playing) return;
      this.timer = window.setTimeout(() => this.next(true), this.app.store.state.settings.reducedMotion ? 9000 : 7200);
    }

    updatePlayButton() {
      const button = $('#learnPlay');
      if (!button) return;
      const label = !this.started ? 'Iniciar' : this.playing ? 'Pausar' : 'Continuar';
      button.innerHTML = `${svgIcon(this.playing ? 'icon-pause' : 'icon-play')}${label}`;
    }

    previous() {
      if (!this.deck.length) return;
      this.stop();
      this.started = true;
      this.index = (this.index - 1 + this.deck.length) % this.deck.length;
      $('#quickCheck').hidden = true;
      this.showCurrent();
    }

    next(automatic = false) {
      if (!this.deck.length) return;
      if (!this.started) {
        this.started = true;
        this.showCurrent();
        return;
      }
      const nextIndex = this.index + 1;
      if (nextIndex >= this.deck.length) {
        this.stop();
        this.index = this.deck.length - 1;
        this.renderCompletion();
        return;
      }
      this.index = nextIndex;
      if (this.index > 0 && this.index % 4 === 0) {
        this.stop();
        this.showQuickCheck(this.deck[this.index - 1]);
      } else {
        this.showCurrent();
        if (automatic) this.schedule();
      }
    }

    showCurrent() {
      const country = this.deck[this.index];
      if (!country) return;
      this.app.store.markViewed(country.id);
      this.app.mountGlobe($('#learnGlobeSlot'), { routeMode: false, interaction: 'explore', region: $('#learnRegion').value });
      this.app.globe.selectCountry(country.id, { fly: true, emit: false, zoom: country.regionPedagogica === 'caribe' ? 1.6 : 1.42 });
      const region = DATA.regions[country.regionPedagogica];
      $('#guidedCard').innerHTML = `
        <div class="guided-content" style="--region-color:${region.color};--region-soft:${region.colorSuave}">
          <div class="guided-visual"><span class="guided-flag" role="img" aria-label="Bandera de ${escapeHTML(country.nombreES)}">${flagEmoji(country.iso2)}</span></div>
          <div class="guided-copy">
            <span class="tour-index">${this.index + 1} de ${this.deck.length} · ${escapeHTML(region.nombre)}</span>
            <h2>${escapeHTML(country.nombreES)}</h2>
            <p class="guided-capital">Capital: <strong>${escapeHTML(country.capitalPrincipal)}</strong></p>
            <p>${escapeHTML(country.descripcionBreve)}</p>
            <div class="mnemonic"><strong>Asociación</strong><span>${escapeHTML(country.ayudaMemoria)}</span></div>
            ${country.id === 'bolivia' ? `<div class="country-note"><strong>Caso especial:</strong> ${escapeHTML(country.tipoCapital)}.</div>` : ''}
            <div class="guided-actions">
              <button class="button button-secondary button-small" type="button" data-guide-action="speak">${svgIcon('icon-volume')}Escuchar</button>
              <button class="button button-secondary button-small" type="button" data-guide-action="practice">${svgIcon('icon-target')}Practicar</button>
              <button class="button button-ghost button-small" type="button" data-guide-action="review">${svgIcon('icon-refresh')}Añadir a repaso</button>
            </div>
          </div>
        </div>`;
      $('#guidedCard').onclick = event => {
        const action = event.target.closest('[data-guide-action]')?.dataset.guideAction;
        if (action === 'speak') this.app.audio.speak(`${country.nombreES}. Capital: ${country.capitalPrincipal}.`);
        if (action === 'practice') this.app.practice.startWithCountries([country], 'capital-choice');
        if (action === 'review') {
          const progress = this.app.store.state.progress[country.id];
          progress.nextReview = Date.now();
          this.app.store.save();
          this.app.toast(`${country.nombreES} quedó marcado para repaso.`, 'info');
        }
      };
      if ($('#learnAutoSpeak').checked) this.app.audio.speak(`${country.nombreES}. Capital: ${country.capitalPrincipal}.`);
      this.renderProgress();
      this.app.announce(`${country.nombreES}. Capital ${country.capitalPrincipal}.`);
    }

    showQuickCheck(country) {
      const question = getQuestionCapital(country);
      const options = shuffle([question.correct, ...distractorsFor(country, 'capital', 3)]);
      const panel = $('#quickCheck');
      panel.hidden = false;
      panel.innerHTML = `
        <div><span class="section-kicker">Comprobación rápida</span><h2>${escapeHTML(question.prompt)}</h2><p>Responde para continuar el recorrido.</p></div>
        <div class="quick-options">${options.map(option => `<button type="button" class="answer-button" data-answer="${escapeHTML(option)}">${escapeHTML(option)}</button>`).join('')}</div>
        <div class="quiz-feedback" aria-live="polite"></div>`;
      delete panel.dataset.answered;
      panel.scrollIntoView({ behavior: this.app.store.state.settings.reducedMotion ? 'auto' : 'smooth', block: 'nearest' });
      panel.onclick = event => {
        if (event.target.closest('[data-continue]')) {
          panel.hidden = true;
          delete panel.dataset.answered;
          this.showCurrent();
          return;
        }
        const button = event.target.closest('[data-answer]');
        if (!button || panel.dataset.answered === 'true') return;
        const answer = button.dataset.answer;
        const correct = normalizeText(answer) === normalizeText(question.correct);
        panel.dataset.answered = 'true';
        $$('.answer-button', panel).forEach(item => {
          item.disabled = true;
          if (normalizeText(item.dataset.answer) === normalizeText(question.correct)) item.classList.add('correct');
          else if (item === button) item.classList.add('incorrect');
        });
        const feedback = $('.quiz-feedback', panel);
        feedback.className = `quiz-feedback ${correct ? 'correct' : 'incorrect'}`;
        feedback.innerHTML = `${svgIcon(correct ? 'icon-check' : 'icon-warning')}<span>${correct ? 'Correcto.' : 'Casi.'} ${escapeHTML(question.explanation)}</span><button class="button button-small button-primary" type="button" data-continue>Continuar</button>`;
        this.app.store.recordAnswer(country.id, { correct, responseTime: 4, mode: 'guided', answer, expected: question.correct });
        this.app.audio.tone(correct ? 'correct' : 'incorrect');
      };
    }

    renderProgress() {
      const total = this.deck.length || 1;
      const current = this.started ? this.index + 1 : 0;
      $('#tourProgressLabel').textContent = this.started ? `${DATA.regions[this.deck[this.index]?.regionPedagogica]?.nombre || 'Toda América'} · recorrido activo` : 'Recorrido sin iniciar';
      $('#tourProgressCount').textContent = `${current} / ${total}`;
      $('#tourProgressBar').style.width = `${(current / total) * 100}%`;
      $('#tourDots').innerHTML = this.deck.map((country, index) => `<button class="tour-dot${index < current ? ' is-complete' : ''}${index === this.index && this.started ? ' is-current' : ''}" type="button" data-index="${index}" aria-label="Ir a ${escapeHTML(country.nombreES)}" title="${escapeHTML(country.nombreES)}"></button>`).join('');
      $('#tourDots').onclick = event => {
        const button = event.target.closest('[data-index]');
        if (!button) return;
        this.stop();
        this.started = true;
        this.index = Number(button.dataset.index);
        this.showCurrent();
      };
    }

    renderCompletion() {
      const regionLabel = $('#learnRegion').selectedOptions[0].textContent;
      $('#guidedCard').innerHTML = `<div class="guided-placeholder">${svgIcon('icon-certificate')}<h2>Recorrido completado</h2><p>Terminaste ${escapeHTML(regionLabel)}. Continúa con tarjetas o practica los países vistos.</p><button class="button button-primary" type="button" data-route="cards">Ir a tarjetas</button></div>`;
      this.renderProgress();
      this.app.audio.tone('achievement');
      this.app.toast('Recorrido completado. El progreso quedó guardado.', 'success');
    }
  }

  class CardsController {
    constructor(app) {
      this.app = app;
      this.deck = [];
      this.index = 0;
      this.flipped = false;
      this.startedAt = performance.now();
      $('#cardRegion').addEventListener('change', () => this.buildDeck());
      $('#cardMode').addEventListener('change', () => this.buildDeck());
      $('#shuffleCards').addEventListener('click', () => this.buildDeck(true));
      $('#flashcard').addEventListener('click', () => this.flip());
      $('#flashcard').addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); this.flip(); }
      });
      $('#cardRating').addEventListener('click', event => {
        const rating = event.target.closest('[data-rating]')?.dataset.rating;
        if (rating) this.rate(rating);
      });
      this.buildDeck();
    }

    buildDeck(forceShuffle = false) {
      const region = $('#cardRegion').value;
      const source = countryPool(region);
      if ($('#cardMode').value === 'adaptive') {
        this.deck = [...source].sort((a, b) => {
          const pa = this.app.store.state.progress[a.id];
          const pb = this.app.store.state.progress[b.id];
          const priorityA = (statusForProgress(pa) === 'review' ? 200 : 0) + (100 - pa.mastery) + Math.random() * 20;
          const priorityB = (statusForProgress(pb) === 'review' ? 200 : 0) + (100 - pb.mastery) + Math.random() * 20;
          return priorityB - priorityA;
        });
      } else {
        this.deck = forceShuffle ? shuffle(source) : [...source].sort((a, b) => a.orden - b.orden);
      }
      this.index = 0;
      this.flipped = false;
      this.render();
    }

    modeForCard(country) {
      const selected = $('#cardMode').value;
      if (selected !== 'adaptive') return selected;
      const possibilities = ['country-capital', 'capital-country', 'flag-country', 'location-country'];
      if (featuresByIso3.has(country.iso3)) possibilities.push('silhouette-country');
      return possibilities[(country.orden + this.index) % possibilities.length];
    }

    render() {
      const country = this.deck[this.index];
      if (!country) return;
      const mode = this.modeForCard(country);
      const region = DATA.regions[country.regionPedagogica];
      let front = '';
      let frontLabel = '';
      if (mode === 'country-capital') { frontLabel = '¿Cuál es la capital?'; front = `<strong class="card-main">${escapeHTML(country.nombreES)}</strong><span class="card-sub">Recuerda la ciudad capital</span>`; }
      if (mode === 'capital-country') { frontLabel = '¿A qué país pertenece?'; front = `<strong class="card-main">${escapeHTML(country.capitalPrincipal)}</strong><span class="card-sub">Identifica el Estado</span>`; }
      if (mode === 'flag-country') { frontLabel = 'Reconoce la bandera'; front = `<span class="card-flag" role="img" aria-label="Bandera para identificar">${flagEmoji(country.iso2)}</span><span class="card-sub">¿De qué país es?</span>`; }
      if (mode === 'silhouette-country') { frontLabel = 'Reconoce la silueta'; front = `<span class="card-silhouette">${silhouetteSVG(country, { width: 300, height: 175 })}</span><span class="card-sub">¿Qué país es?</span>`; }
      if (mode === 'location-country') {
        const [x, y] = projectMap2D(country.coordenadasPais[0], country.coordenadasPais[1], 320, 190);
        frontLabel = 'Reconoce la ubicación';
        front = `<svg class="card-location-map" viewBox="0 0 320 190" role="img" aria-label="Ubicación aproximada en América"><path d="M10 10H310V180H10Z" fill="rgba(11,30,49,.42)" stroke="rgba(255,255,255,.12)"/><circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="8" fill="${region.color}"/><circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="16" fill="none" stroke="${region.color}" stroke-dasharray="3 4"/></svg><span class="card-sub">¿Qué país ocupa esta posición?</span>`;
      }
      const answerTitle = mode === 'country-capital' ? country.capitalPrincipal : country.nombreES;
      $('#flashcardFront').innerHTML = `<span class="card-label">${frontLabel}</span>${front}`;
      $('#flashcardBack').innerHTML = `
        <span class="card-label">Respuesta</span>
        <div class="card-back-grid"><span class="card-flag">${flagEmoji(country.iso2)}</span><div><strong class="card-main">${escapeHTML(answerTitle)}</strong><span class="card-sub">${escapeHTML(country.nombreES)} · ${escapeHTML(country.capitalPrincipal)}</span></div></div>
        <div class="mnemonic"><strong>Ayuda de memoria</strong><span>${escapeHTML(country.ayudaMemoria)}</span></div>
        <span class="region-badge" style="--region-color:${region.color};--region-soft:${region.colorSuave}">${escapeHTML(region.nombre)}</span>`;
      $('#flashcard').classList.remove('is-flipped');
      $('#flashcard').setAttribute('aria-pressed', 'false');
      $('#cardRating').hidden = true;
      this.ensureSpeakButton(country);
      $('#cardCounter').textContent = `${this.index + 1} / ${this.deck.length}`;
      $('#cardProgressBar').style.width = `${((this.index + 1) / this.deck.length) * 100}%`;
      this.flipped = false;
      this.startedAt = performance.now();
      this.app.store.markViewed(country.id);
    }

    ensureSpeakButton(country) {
      let button = $('#cardSpeakButton');
      if (!button) {
        button = document.createElement('button');
        button.id = 'cardSpeakButton';
        button.className = 'button button-secondary button-small card-speak-button';
        button.type = 'button';
        button.hidden = true;
        $('#cardRating').before(button);
      }
      button.innerHTML = `${svgIcon('icon-volume')}Escuchar país y capital`;
      button.onclick = event => {
        event.stopPropagation();
        this.app.audio.speak(`${country.nombreES}. Capital: ${country.capitalPrincipal}.`);
      };
      button.hidden = !this.flipped;
    }

    flip() {
      const country = this.deck[this.index];
      if (!country) return;
      this.flipped = !this.flipped;
      $('#flashcard').classList.toggle('is-flipped', this.flipped);
      $('#flashcard').setAttribute('aria-pressed', String(this.flipped));
      $('#cardRating').hidden = !this.flipped;
      this.ensureSpeakButton(country);
      $('#cardSpeakButton').hidden = !this.flipped;
      if (this.flipped) this.app.announce(`Respuesta: ${country.nombreES}, capital ${country.capitalPrincipal}.`);
    }

    rate(rating) {
      const country = this.deck[this.index];
      if (!country || !this.flipped) return;
      const responseTime = (performance.now() - this.startedAt) / 1000;
      const correct = rating !== 'hard';
      this.app.store.recordAnswer(country.id, { correct, responseTime, mode: 'cards', answer: rating, expected: country.capitalPrincipal });
      if (rating === 'unsure') {
        const progress = this.app.store.state.progress[country.id];
        progress.nextReview = Date.now() + .08 * DAY;
        progress.intervalLevel = Math.max(0, progress.intervalLevel - 1);
        this.app.store.save();
      }
      this.app.audio.tone(correct ? 'correct' : 'incorrect');
      this.index += 1;
      if (this.index >= this.deck.length) {
        this.index = 0;
        this.deck = shuffle(this.deck);
        this.app.store.finishSession({ usedHints: rating !== 'easy' });
        this.app.toast('Mazo completado. Comienza una nueva vuelta adaptativa.', 'success');
      }
      this.render();
    }
  }

  class PracticeController {
    constructor(app) {
      this.app = app;
      this.active = false;
      this.config = null;
      this.questions = [];
      this.index = 0;
      this.correct = 0;
      this.score = 0;
      this.streak = 0;
      this.bestStreak = 0;
      this.lives = 3;
      this.errors = [];
      this.usedHints = false;
      this.answered = false;
      this.questionStarted = 0;
      this.sessionStarted = 0;
      this.timer = 0;
      this.remaining = 0;
      this.matchState = null;
      this.customCountries = null;
      $('#practiceMode').addEventListener('change', () => this.renderPreview());
      $('#practiceDifficulty').addEventListener('change', () => this.renderPreview());
      $('#practiceForm').addEventListener('submit', event => {
        event.preventDefault();
        this.startFromForm();
      });
      this.app.globe.addEventListener('country-pick', event => this.onCountryPick(event.detail));
      this.app.globe.addEventListener('location-pick', event => this.onLocationPick(event.detail));
      this.renderPreview();
    }

    renderPreview() {
      const mode = MODES[$('#practiceMode').value] || MODES['capital-choice'];
      const difficulty = $('#practiceDifficulty').selectedOptions[0].textContent;
      $('#practiceModePreview').innerHTML = `
        <div class="mode-preview-icon">${svgIcon(mode.icon === 'icon-map' ? 'icon-globe' : mode.icon)}</div>
        <span class="section-kicker">Vista previa · ${escapeHTML(difficulty)}</span>
        <h2>${escapeHTML(mode.title)}</h2>
        <p>${escapeHTML(mode.description)}</p>
        <div class="mode-feature-list">${mode.skills.map(skill => `<div class="mode-feature">${svgIcon('icon-check')}<span>${escapeHTML(skill)}</span></div>`).join('')}</div>
        <div class="method-note">${svgIcon('icon-info')}<div><strong>Actualiza el dominio local</strong><p>Cada respuesta modifica precisión, tiempo medio y próxima recomendación de repaso.</p></div></div>`;
    }

    startFromForm() {
      this.start({
        mode: $('#practiceMode').value,
        region: $('#practiceRegion').value,
        difficulty: $('#practiceDifficulty').value,
        count: Number($('#practiceCount').value),
        time: Number($('#practiceTime').value),
        hints: $('#practiceHints').checked,
        immediate: $('#practiceImmediate').checked,
        sound: $('#practiceSound').checked
      });
    }

    startWithCountries(countries, mode = 'capital-choice') {
      this.app.route('practice');
      this.customCountries = countries;
      this.start({ mode, region: 'all', difficulty: 'intermediate', count: countries.length, time: 0, hints: true, immediate: true, sound: this.app.store.state.settings.sound }, countries);
    }

    start(config, explicitCountries = null) {
      this.stopTimer();
      this.active = true;
      this.config = { ...config };
      this.index = 0;
      this.correct = 0;
      this.score = 0;
      this.streak = 0;
      this.bestStreak = 0;
      this.lives = 3;
      this.errors = [];
      this.usedHints = false;
      this.answered = false;
      this.sessionStarted = performance.now();
      const dateKey = new Date().toISOString().slice(0, 10);
      const random = config.mode === 'daily' ? seededRandom(`atlas-${dateKey}-${config.region}`) : Math.random;
      let pool = explicitCountries || countryPool(config.region);
      if (config.mode === 'review') {
        const weak = this.app.store.getWeakCountries(Math.max(config.count, 10), config.region).map(item => item.country);
        pool = weak.length ? weak : pool;
      }
      if (config.mode === 'silhouette-country') pool = pool.filter(country => featuresByIso3.has(country.iso3));
      if (!pool.length) pool = countryPool('all');
      let count = config.mode === 'daily' ? 10 : config.count;
      if (explicitCountries) count = explicitCountries.length;
      const selected = [];
      while (selected.length < count) selected.push(...shuffle(pool, random));
      selected.length = count;
      this.questions = selected.map((country, index) => this.createQuestion(country, this.resolveMode(config.mode, country, index, random), random, index));
      this.remaining = config.time || (config.mode === 'timed' ? 60 : 0);
      $('#practiceSetup').hidden = true;
      $('#practiceArena').hidden = false;
      if (this.remaining > 0) this.startTimer();
      this.renderQuestion();
    }

    resolveMode(mode, country, index, random) {
      if (!['timed', 'survival', 'perfect', 'review', 'daily'].includes(mode)) return mode;
      const mixture = ['capital-choice', 'country-choice', 'write-capital', 'flag-country'];
      if (featuresByIso3.has(country.iso3)) mixture.push('silhouette-country');
      if (this.config.difficulty === 'advanced' || this.config.difficulty === 'expert') mixture.push('write-country');
      return mixture[Math.floor(random() * mixture.length)];
    }

    createQuestion(country, kind, random = Math.random, index = 0) {
      const optionCount = this.config.difficulty === 'beginner' ? 3 : 4;
      const capital = getQuestionCapital(country);
      const reverse = getQuestionCountry(country);
      if (kind === 'capital-choice') return { kind, country, ...capital, options: shuffle([capital.correct, ...distractorsFor(country, 'capital', optionCount - 1, random)], random) };
      if (kind === 'country-choice') return { kind, country, ...reverse, options: shuffle([reverse.correct, ...distractorsFor(country, 'country', optionCount - 1, random)], random) };
      if (kind === 'flag-country') return { kind, country, ...reverse, prompt: '¿A qué país pertenece esta bandera?', options: shuffle([reverse.correct, ...distractorsFor(country, 'country', optionCount - 1, random)], random) };
      if (kind === 'silhouette-country') return { kind, country, ...reverse, prompt: '¿Qué país corresponde a esta silueta cartográfica?', options: shuffle([reverse.correct, ...distractorsFor(country, 'country', optionCount - 1, random)], random) };
      if (kind === 'write-capital' || kind === 'voice') return { kind, country, ...capital };
      if (kind === 'write-country') return { kind, country, ...reverse };
      if (kind === 'globe-country') return { kind, country, correct: country.nombreES, accepted: [country.nombreES, ...country.aliasPais], prompt: `Selecciona ${country.nombreES} en el globo`, explanation: `${country.nombreES} se encuentra en ${DATA.regions[country.regionPedagogica].nombre}.` };
      if (kind === 'capital-location') return { kind, country, correct: country.capitalPrincipal, accepted: country.capitalesAceptadas, prompt: `Marca la ubicación aproximada de ${country.capitalPrincipal}`, explanation: `${country.capitalPrincipal} se ubica aproximadamente en ${country.coordenadasCapital[0].toFixed(1)}° de latitud y ${Math.abs(country.coordenadasCapital[1]).toFixed(1)}° O.` };
      if (kind === 'order-north') {
        const candidates = sample(countryPool(this.config.region), Math.min(5, countryPool(this.config.region).length), random);
        return { kind, country: candidates[0], countries: shuffle(candidates, random), correctOrder: [...candidates].sort((a, b) => b.coordenadasPais[0] - a.coordenadasPais[0]), prompt: 'Ordena los países de norte a sur', explanation: 'La secuencia se determina por la latitud aproximada del centro de cada país.' };
      }
      if (kind === 'match-pairs') {
        const candidates = sample(countryPool(this.config.region), Math.min(5, countryPool(this.config.region).length), random);
        return { kind, country: candidates[0], countries: candidates, capitals: shuffle(candidates.map(item => ({ id: item.id, label: item.capitalPrincipal })), random), prompt: 'Relaciona cada país con su capital', explanation: 'Cada par correcto queda bloqueado hasta completar el tablero.' };
      }
      return { kind: 'capital-choice', country, ...capital, options: shuffle([capital.correct, ...distractorsFor(country, 'capital', 3, random)], random) };
    }

    startTimer() {
      this.stopTimer();
      this.timer = window.setInterval(() => {
        this.remaining = Math.max(0, this.remaining - .25);
        this.updateTop();
        if (this.remaining <= 0) this.finish('time');
      }, 250);
    }

    stopTimer() {
      clearInterval(this.timer);
      this.timer = 0;
    }

    questionVisual(question) {
      if (question.kind === 'flag-country') return `<div class="question-visual"><span class="question-flag" role="img" aria-label="Bandera para reconocer">${flagEmoji(question.country.iso2)}</span></div>`;
      if (question.kind === 'silhouette-country') return `<div class="question-visual question-silhouette">${silhouetteSVG(question.country, { width: 420, height: 230 })}</div>`;
      return '';
    }

    renderQuestion() {
      if (!this.active) return;
      this.app.parkGlobe();
      const question = this.questions[this.index];
      if (!question) return this.finish('complete');
      this.answered = false;
      this.matchState = null;
      this.questionStarted = performance.now();
      const mode = MODES[question.kind] || MODES['capital-choice'];
      const special = this.config.mode === 'survival' ? `<span>${svgIcon('icon-target')} ${this.lives} vidas</span>` : this.config.mode === 'perfect' ? `<span>${svgIcon('icon-check')} sin errores</span>` : `<span>${svgIcon(mode.icon === 'icon-map' ? 'icon-globe' : mode.icon)} ${escapeHTML(mode.title)}</span>`;
      $('#practiceArena').innerHTML = `
        <div class="quiz-shell">
          <div class="quiz-top">
            <div class="quiz-progress-block"><div class="quiz-progress-label"><strong>Pregunta ${this.index + 1} de ${this.questions.length}</strong><span>${Math.round(((this.index) / this.questions.length) * 100)}%</span></div><div class="linear-progress tiny"><span style="width:${(this.index / this.questions.length) * 100}%"></span></div></div>
            <div class="quiz-stat">${special}</div>
            <div class="quiz-stat" data-timer>${this.remaining > 0 ? formatClock(this.remaining) : `Racha ${this.streak}`}</div>
            <button class="icon-button" type="button" data-exit-practice aria-label="Salir de la práctica">${svgIcon('icon-close')}</button>
          </div>
          <div class="quiz-body"><div class="question-card" id="practiceQuestionBody"></div></div>
          <div class="quiz-footer"><button class="button button-secondary button-small" type="button" data-hint ${!this.config.hints ? 'hidden' : ''}>${svgIcon('icon-info')}Pista</button><div class="quiz-feedback" id="practiceFeedback" aria-live="polite"></div><button class="button button-primary button-small" type="button" data-next-practice hidden>Siguiente${svgIcon('icon-next')}</button></div>
        </div>`;
      this.renderQuestionBody(question);
      this.bindArena(question);
      this.updateTop();
    }

    renderQuestionBody(question) {
      const body = $('#practiceQuestionBody');
      const meta = `<div class="question-meta"><span>${escapeHTML(DATA.regions[question.country.regionPedagogica].nombre)}</span><span>${escapeHTML(this.config.difficulty)}</span></div>`;
      if (['capital-choice', 'country-choice', 'flag-country', 'silhouette-country'].includes(question.kind)) {
        body.innerHTML = `${meta}${this.questionVisual(question)}<h2>${escapeHTML(question.prompt)}</h2><div class="answer-grid">${question.options.map(option => `<button class="answer-button" type="button" data-answer="${escapeHTML(option)}">${escapeHTML(option)}</button>`).join('')}</div>`;
        return;
      }
      if (['write-capital', 'write-country', 'voice'].includes(question.kind)) {
        body.innerHTML = `${meta}<h2>${escapeHTML(question.prompt)}</h2><form class="written-answer" data-written-form><label class="field"><span>Tu respuesta</span><input type="text" id="practiceWrittenInput" autocomplete="off" spellcheck="false" required placeholder="Escribe una respuesta exacta"></label>${question.kind === 'voice' ? `<button class="button button-secondary" type="button" data-voice-start>${svgIcon('icon-volume')}Responder por voz</button>` : ''}<button class="button button-primary" type="submit">Comprobar</button></form><p class="answer-note">Se ignoran mayúsculas, puntuación y tildes; solo se aceptan variantes definidas.</p>`;
        window.setTimeout(() => $('#practiceWrittenInput')?.focus(), 40);
        return;
      }
      if (question.kind === 'globe-country' || question.kind === 'capital-location') {
        body.innerHTML = `${meta}<h2>${escapeHTML(question.prompt)}</h2><p class="answer-note">Puedes girar y acercar el globo antes de responder.</p><div class="quiz-map-slot" id="practiceMapSlot"></div>`;
        this.app.mountGlobe($('#practiceMapSlot'), { region: this.config.region, routeMode: false, interaction: question.kind === 'globe-country' ? 'pick-country' : 'pick-location', questionCountry: question.country, labels: question.kind === 'globe-country' && this.config.difficulty === 'beginner', capitals: false });
        if (question.kind === 'capital-location') this.app.globe.flyTo(question.country.coordenadasPais[0], question.country.coordenadasPais[1], this.config.difficulty === 'beginner' ? 1.15 : .95, 500);
        else this.app.globe.flyTo(12, -90, .88, 450);
        return;
      }
      if (question.kind === 'order-north') {
        body.innerHTML = `${meta}<h2>${escapeHTML(question.prompt)}</h2><p class="answer-note">Usa los botones para cambiar la posición. La fila superior es la más septentrional.</p><div class="order-list" id="orderList">${question.countries.map((country, index) => this.orderItem(country, index, question.countries.length)).join('')}</div><button class="button button-primary" type="button" data-check-order>Comprobar orden</button>`;
        return;
      }
      if (question.kind === 'match-pairs') {
        this.matchState = { selectedCountry: null, selectedCapital: null, matched: new Set(), mistakes: 0 };
        body.innerHTML = `${meta}<h2>${escapeHTML(question.prompt)}</h2><p class="answer-note">Selecciona primero un país y luego una capital. También funciona con teclado.</p><div class="match-board"><div class="match-column">${question.countries.map(country => `<button class="match-item" type="button" data-match-side="country" data-id="${country.id}">${escapeHTML(country.nombreES)}</button>`).join('')}</div><div class="match-column">${question.capitals.map(item => `<button class="match-item" type="button" data-match-side="capital" data-id="${item.id}">${escapeHTML(item.label)}</button>`).join('')}</div></div>`;
      }
    }

    orderItem(country, index, total) {
      return `<div class="order-item" data-order-id="${country.id}"><span class="order-index">${index + 1}</span><strong>${escapeHTML(country.nombreES)}</strong><button class="icon-button" type="button" data-move="up" ${index === 0 ? 'disabled' : ''} aria-label="Subir ${escapeHTML(country.nombreES)}">${svgIcon('icon-prev')}</button><button class="icon-button" type="button" data-move="down" ${index === total - 1 ? 'disabled' : ''} aria-label="Bajar ${escapeHTML(country.nombreES)}">${svgIcon('icon-next')}</button></div>`;
    }

    bindArena(question) {
      const arena = $('#practiceArena');
      arena.onclick = event => {
        if (event.target.closest('[data-exit-practice]')) return this.exit();
        if (event.target.closest('[data-hint]')) return this.showHint(question);
        if (event.target.closest('[data-next-practice]')) return this.next();
        const answerButton = event.target.closest('[data-answer]');
        if (answerButton) return this.answer(question, answerButton.dataset.answer, normalizeText(answerButton.dataset.answer) === normalizeText(question.correct));
        const move = event.target.closest('[data-move]');
        if (move) return this.moveOrder(move.closest('[data-order-id]'), move.dataset.move);
        if (event.target.closest('[data-check-order]')) return this.checkOrder(question);
        const match = event.target.closest('[data-match-side]');
        if (match) return this.handleMatch(question, match);
        if (event.target.closest('[data-voice-start]')) return this.startVoice(question);
      };
      const form = $('[data-written-form]', arena);
      form?.addEventListener('submit', event => {
        event.preventDefault();
        const value = $('#practiceWrittenInput').value;
        this.answer(question, value, isAcceptedAnswer(value, question.accepted));
      });
    }

    updateTop() {
      const timer = $('[data-timer]', $('#practiceArena'));
      if (!timer) return;
      timer.textContent = this.remaining > 0 ? formatClock(this.remaining) : `Racha ${this.streak}`;
    }

    answer(question, answer, correct, options = {}) {
      if (this.answered || !this.active) return;
      this.answered = true;
      const responseTime = Math.max(.1, (performance.now() - this.questionStarted) / 1000);
      const hintUsed = Boolean(question.hintUsed);
      const points = correct ? Math.round(1000 * (hintUsed ? .7 : 1) * clamp(1.18 - responseTime / 40, .55, 1.15)) : 0;
      if (correct) {
        this.correct += 1;
        this.streak += 1;
        this.bestStreak = Math.max(this.bestStreak, this.streak);
        this.score += points;
      } else {
        this.streak = 0;
        if (this.config.mode === 'survival') this.lives -= 1;
        this.errors.push({ countryId: question.country.id, prompt: question.prompt, answer: String(answer || 'Sin respuesta'), expected: question.correct, explanation: question.explanation });
      }
      const records = options.perCountry || [{ country: question.country, correct }];
      for (const record of records) {
        this.app.store.recordAnswer(record.country.id, { correct: record.correct, responseTime, mode: this.config.mode, answer: String(answer || ''), expected: question.correct, hintUsed });
      }
      if (this.config.sound || this.app.store.state.settings.sound) this.app.audio.tone(correct ? 'correct' : 'incorrect');
      this.app.globe.flash(correct ? 'correct' : 'error');
      const feedback = $('#practiceFeedback');
      feedback.className = `quiz-feedback ${correct ? 'correct' : 'incorrect'}`;
      feedback.innerHTML = `${svgIcon(correct ? 'icon-check' : 'icon-warning')}<span><strong>${correct ? `Correcto · +${points} puntos` : 'Respuesta incorrecta'}.</strong> ${escapeHTML(question.explanation || `La respuesta era ${question.correct}.`)}</span>`;
      const answerButtons = $$('.answer-button', $('#practiceArena'));
      answerButtons.forEach(button => {
        button.disabled = true;
        if (normalizeText(button.dataset.answer) === normalizeText(question.correct)) button.classList.add('correct');
        else if (normalizeText(button.dataset.answer) === normalizeText(answer)) button.classList.add('incorrect');
      });
      $('[data-hint]', $('#practiceArena'))?.setAttribute('disabled', '');
      const nextButton = $('[data-next-practice]', $('#practiceArena'));
      if (nextButton) {
        nextButton.hidden = false;
        nextButton.innerHTML = this.index >= this.questions.length - 1 ? `Ver resultado${svgIcon('icon-arrow')}` : `Siguiente${svgIcon('icon-next')}`;
      }
      this.updateTop();
      if ((this.config.mode === 'perfect' && !correct) || (this.config.mode === 'survival' && this.lives <= 0)) {
        window.setTimeout(() => this.finish(this.config.mode === 'perfect' ? 'error' : 'lives'), 900);
      } else if (!this.config.immediate) {
        window.setTimeout(() => this.next(), 650);
      }
    }

    showHint(question) {
      if (this.answered || question.hintUsed) return;
      question.hintUsed = true;
      this.usedHints = true;
      let hint = `Pertenece a ${DATA.regions[question.country.regionPedagogica].nombre}.`;
      if (question.kind.includes('capital') || question.kind === 'write-capital') hint += ` Comienza con “${question.country.capitalPrincipal[0]}”.`;
      if (question.kind.includes('country') || question.kind === 'write-country') hint += ` El país comienza con “${question.country.nombreES[0]}”.`;
      if (question.kind === 'order-north') hint = 'Compara la latitud del centro aproximado de cada país; Canadá siempre queda al norte del conjunto continental.';
      if (question.kind === 'match-pairs') hint = `Busca primero el par ${question.countries[0].nombreES} — ${question.countries[0].capitalPrincipal}.`;
      const feedback = $('#practiceFeedback');
      feedback.className = 'quiz-feedback';
      feedback.innerHTML = `${svgIcon('icon-info')}<span><strong>Pista:</strong> ${escapeHTML(hint)} La puntuación máxima de esta pregunta se reduce.</span>`;
    }

    moveOrder(item, direction) {
      if (this.answered || !item) return;
      const sibling = direction === 'up' ? item.previousElementSibling : item.nextElementSibling;
      if (!sibling) return;
      const list = item.parentElement;
      if (direction === 'up') list.insertBefore(item, sibling);
      else list.insertBefore(sibling, item);
      [...list.children].forEach((row, index, rows) => {
        $('.order-index', row).textContent = index + 1;
        const up = $('[data-move="up"]', row);
        const down = $('[data-move="down"]', row);
        up.disabled = index === 0;
        down.disabled = index === rows.length - 1;
      });
    }

    checkOrder(question) {
      if (this.answered) return;
      const actual = [...$('#orderList').children].map(item => item.dataset.orderId);
      const expected = question.correctOrder.map(country => country.id);
      const perCountry = question.correctOrder.map((country, index) => ({ country, correct: actual[index] === country.id }));
      const correct = actual.every((id, index) => id === expected[index]);
      const answer = actual.map(id => countryById.get(id).nombreES).join(' → ');
      question.correct = question.correctOrder.map(country => country.nombreES).join(' → ');
      this.answer(question, answer, correct, { perCountry });
    }

    handleMatch(question, button) {
      if (this.answered || button.classList.contains('is-matched')) return;
      const side = button.dataset.matchSide;
      const currentSelected = $(`.match-item.is-selected[data-match-side="${side}"]`, $('#practiceArena'));
      currentSelected?.classList.remove('is-selected');
      button.classList.add('is-selected');
      if (side === 'country') this.matchState.selectedCountry = button;
      else this.matchState.selectedCapital = button;
      const { selectedCountry, selectedCapital } = this.matchState;
      if (!selectedCountry || !selectedCapital) return;
      const match = selectedCountry.dataset.id === selectedCapital.dataset.id;
      if (match) {
        selectedCountry.classList.remove('is-selected');
        selectedCapital.classList.remove('is-selected');
        selectedCountry.classList.add('is-matched');
        selectedCapital.classList.add('is-matched');
        selectedCountry.disabled = true;
        selectedCapital.disabled = true;
        this.matchState.matched.add(selectedCountry.dataset.id);
        this.app.audio.tone('correct');
      } else {
        this.matchState.mistakes += 1;
        selectedCountry.classList.add('incorrect');
        selectedCapital.classList.add('incorrect');
        window.setTimeout(() => {
          selectedCountry.classList.remove('is-selected', 'incorrect');
          selectedCapital.classList.remove('is-selected', 'incorrect');
        }, 450);
      }
      this.matchState.selectedCountry = null;
      this.matchState.selectedCapital = null;
      if (this.matchState.matched.size === question.countries.length) {
        question.correct = 'Todos los pares correctos';
        const perCountry = question.countries.map(country => ({ country, correct: true }));
        this.answer(question, `${question.countries.length} pares`, this.matchState.mistakes === 0, { perCountry });
      }
    }

    onCountryPick(country) {
      if (!this.active || this.answered) return;
      const question = this.questions[this.index];
      if (question?.kind !== 'globe-country') return;
      const correct = country.id === question.country.id;
      this.app.globe.selectedId = country.id;
      this.answer(question, country.nombreES, correct);
    }

    onLocationPick(location) {
      if (!this.active || this.answered) return;
      const question = this.questions[this.index];
      if (question?.kind !== 'capital-location') return;
      const distance = haversineKm([location.lat, location.lon], question.country.coordenadasCapital);
      const thresholds = { beginner: 1200, intermediate: 700, advanced: 380, expert: 220 };
      const threshold = thresholds[this.config.difficulty] || 700;
      question.country.__revealLocation = true;
      question.explanation = `${question.country.capitalPrincipal} estaba a ${Math.round(distance).toLocaleString('es-AR')} km de tu marca. El margen de esta dificultad era ${threshold.toLocaleString('es-AR')} km.`;
      this.answer(question, `${location.lat.toFixed(2)}, ${location.lon.toFixed(2)}`, distance <= threshold);
    }

    startVoice(question) {
      const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!Recognition) {
        this.app.toast('Este navegador no ofrece reconocimiento de voz. Puedes escribir la respuesta.', 'warning');
        $('#practiceWrittenInput')?.focus();
        return;
      }
      const recognition = new Recognition();
      recognition.lang = 'es-AR';
      recognition.interimResults = false;
      recognition.maxAlternatives = 3;
      const button = $('[data-voice-start]', $('#practiceArena'));
      button.disabled = true;
      button.textContent = 'Escuchando…';
      recognition.onresult = event => {
        const alternatives = [...event.results[0]].map(item => item.transcript);
        const accepted = alternatives.find(value => isAcceptedAnswer(value, question.accepted)) || alternatives[0];
        $('#practiceWrittenInput').value = accepted;
        this.answer(question, accepted, alternatives.some(value => isAcceptedAnswer(value, question.accepted)));
      };
      recognition.onerror = () => this.app.toast('No se pudo reconocer la respuesta. Intenta escribirla.', 'warning');
      recognition.onend = () => { if (button) { button.disabled = false; button.innerHTML = `${svgIcon('icon-volume')}Responder por voz`; } };
      recognition.start();
    }

    next() {
      if (!this.active) return;
      const current = this.questions[this.index];
      if (current?.country) delete current.country.__revealLocation;
      this.app.globe.setInteractionMode('explore');
      this.index += 1;
      if (this.index >= this.questions.length) this.finish('complete');
      else this.renderQuestion();
    }

    finish(reason = 'complete') {
      if (!this.active) return;
      this.app.parkGlobe();
      this.active = false;
      this.stopTimer();
      this.app.globe.setInteractionMode('explore');
      const current = this.questions[this.index];
      if (current?.country) delete current.country.__revealLocation;
      this.app.store.finishSession({ usedHints: this.usedHints });
      if (this.config.mode === 'daily') this.app.store.state.meta.dailyCompleted[new Date().toISOString().slice(0, 10)] = { score: this.score, correct: this.correct, total: this.questions.length };
      this.app.store.save();
      const answered = Math.min(this.questions.length, this.index + (this.answered ? 1 : 0));
      const accuracy = answered ? Math.round((this.correct / answered) * 100) : 0;
      const message = reason === 'time' ? 'Se terminó el tiempo.' : reason === 'lives' ? 'Se agotaron las tres vidas.' : reason === 'error' ? 'El modo sin errores terminó.' : 'Sesión completada.';
      $('#practiceArena').innerHTML = `
        <div class="quiz-result">
          <div class="result-hero" style="--score:${accuracy};--result-color:${accuracy >= 70 ? 'var(--success)' : 'var(--caribe)'};--result-soft:${accuracy >= 70 ? 'rgba(104,224,169,.12)' : 'rgba(255,191,105,.12)'}">
            <div class="result-score"><strong>${accuracy}%</strong></div><div><span class="section-kicker">${escapeHTML(message)}</span><h2>${accuracy >= 80 ? 'Dominio sólido' : accuracy >= 60 ? 'Buen avance' : 'Conviene reforzar'}</h2><p>Tu resultado ya actualizó el repaso adaptativo de cada país.</p></div>
          </div>
          <div class="result-grid"><div class="result-stat"><span>Aciertos</span><strong>${this.correct} / ${answered}</strong></div><div class="result-stat"><span>Puntos</span><strong>${this.score.toLocaleString('es-AR')}</strong></div><div class="result-stat"><span>Mejor racha</span><strong>${this.bestStreak}</strong></div><div class="result-stat"><span>Tiempo</span><strong>${formatDuration((performance.now() - this.sessionStarted) / 1000)}</strong></div></div>
          ${this.errors.length ? `<div class="result-errors"><h3>Errores para repasar</h3>${this.errors.slice(0, 12).map(error => `<div class="error-row"><span>${flagEmoji(countryById.get(error.countryId).iso2)}</span><div><strong>${escapeHTML(error.prompt)}</strong><span>Tu respuesta: ${escapeHTML(error.answer)} · Correcta: ${escapeHTML(error.expected)}</span></div></div>`).join('')}</div>` : '<div class="method-note">' + svgIcon('icon-check') + '<div><strong>Sin errores registrados</strong><p>Mantén la retención con una nueva sesión dentro de unos días.</p></div></div>'}
          <div class="result-actions"><button class="button button-primary" type="button" data-practice-again>${svgIcon('icon-refresh')}Repetir modo</button><button class="button button-secondary" type="button" data-practice-errors ${this.errors.length ? '' : 'disabled'}>${svgIcon('icon-target')}Solo mis errores</button><button class="button button-ghost" type="button" data-practice-setup>Configurar otra</button></div>
        </div>`;
      $('#practiceArena').onclick = event => {
        if (event.target.closest('[data-practice-again]')) this.start(this.config);
        if (event.target.closest('[data-practice-errors]') && this.errors.length) this.startWithCountries([...new Set(this.errors.map(error => error.countryId))].map(id => countryById.get(id)), 'capital-choice');
        if (event.target.closest('[data-practice-setup]')) this.exit();
      };
      this.app.updateSummaryUI();
    }

    exit() {
      this.app.parkGlobe();
      this.active = false;
      this.stopTimer();
      this.app.globe.setInteractionMode('explore');
      $('#practiceArena').hidden = true;
      $('#practiceSetup').hidden = false;
      this.app.mountGlobe($('#homeGlobeSlot'), { region: 'all', routeMode: true, interaction: 'explore' });
    }
  }

  class ExamController {
    constructor(app) {
      this.app = app;
      this.active = false;
      this.paused = false;
      this.config = null;
      this.questions = [];
      this.index = 0;
      this.answers = [];
      this.startedAt = 0;
      this.questionStarted = 0;
      this.remaining = 0;
      this.timer = 0;
      this.lastTick = 0;
      this.answered = false;
      $('#examForm').addEventListener('submit', event => {
        event.preventDefault();
        this.startFromForm();
      });
      $('#randomizeSeed').addEventListener('click', () => {
        $('#examSeed').value = this.generateSeed();
        this.renderOverview();
      });
      ['examRegion','examCount','examDuration','examDifficulty','examPass','examFeedback'].forEach(id => $(`#${id}`).addEventListener('change', () => this.renderOverview()));
      $$('[name="examType"]').forEach(input => input.addEventListener('change', () => this.renderOverview()));
      this.app.globe.addEventListener('location-pick', event => this.onLocationPick(event.detail));
      this.renderOverview();
    }

    generateSeed() {
      const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
      let result = 'AM-';
      crypto.getRandomValues(new Uint8Array(6)).forEach(value => { result += alphabet[value % alphabet.length]; });
      return result;
    }

    renderOverview() {
      const types = $$('[name="examType"]:checked').map(input => input.value);
      const region = $('#examRegion').selectedOptions[0].textContent;
      const count = Number($('#examCount').value);
      const duration = Number($('#examDuration').value);
      $('#examOverview').innerHTML = `
        <div class="exam-overview-icon">${svgIcon('icon-exam')}</div>
        <span class="section-kicker">Resumen antes de comenzar</span>
        <h2>${count} preguntas · ${escapeHTML(region)}</h2>
        <p>${types.length ? types.map(type => ({ choice: 'selección', written: 'escritura', location: 'ubicación' }[type])).join(' + ') : 'Selecciona al menos un tipo de pregunta'}.</p>
        <div class="exam-overview-stats"><div><span>Tiempo</span><strong>${duration ? formatDuration(duration) : 'Libre'}</strong></div><div><span>Aprobación</span><strong>${$('#examPass').value}%</strong></div><div><span>Dificultad</span><strong>${escapeHTML($('#examDifficulty').selectedOptions[0].textContent)}</strong></div><div><span>Corrección</span><strong>${$('#examFeedback').value === 'deferred' ? 'Al final' : 'Inmediata'}</strong></div></div>
        <div class="method-note">${svgIcon('icon-info')}<div><strong>Preguntas sin ambigüedad</strong><p>Bolivia se evalúa como capital constitucional o sede de gobierno mediante un enunciado explícito.</p></div></div>`;
    }

    startFromForm() {
      const types = $$('[name="examType"]:checked').map(input => input.value);
      if (!types.length) {
        this.app.toast('Selecciona al menos un tipo de pregunta.', 'warning');
        return;
      }
      const seed = $('#examSeed').value.trim() || this.generateSeed();
      $('#examSeed').value = seed;
      this.start({
        region: $('#examRegion').value,
        count: Number($('#examCount').value),
        duration: Number($('#examDuration').value),
        difficulty: $('#examDifficulty').value,
        pass: Number($('#examPass').value),
        feedback: $('#examFeedback').value,
        types,
        seed
      });
    }

    start(config) {
      this.stopTimer();
      this.config = config;
      this.active = true;
      this.paused = false;
      this.index = 0;
      this.answers = [];
      this.answered = false;
      this.startedAt = performance.now();
      this.remaining = config.duration;
      const random = seededRandom(config.seed);
      const pool = countryPool(config.region);
      const selected = [];
      if (config.region === 'all' && config.count === 35) selected.push(...shuffle([...pool].sort((a, b) => a.orden - b.orden), random));
      else {
        while (selected.length < config.count) selected.push(...shuffle(pool, random));
        selected.length = config.count;
      }
      this.questions = selected.map((country, index) => this.createQuestion(country, config.types[index % config.types.length], random, index));
      $('#examSetup').hidden = true;
      $('#examArena').hidden = false;
      if (this.remaining > 0) this.startTimer();
      this.renderQuestion();
    }

    createQuestion(country, type, random, index) {
      const reverse = index % 3 === 1;
      const optionCount = this.config.difficulty === 'beginner' ? 3 : 4;
      if (type === 'location') {
        return { type, country, prompt: `Marca la ubicación aproximada de ${country.capitalPrincipal}, capital de ${country.nombreES}`, correct: country.capitalPrincipal, accepted: country.capitalesAceptadas, explanation: `${country.capitalPrincipal} es la capital de ${country.nombreES}.` };
      }
      if (country.id === 'bolivia' && index % 2 === 1) {
        const prompt = '¿Qué ciudad es sede de los órganos Ejecutivo y Legislativo de Bolivia?';
        const answer = 'La Paz';
        if (type === 'choice') return { type, country, prompt, correct: answer, accepted: country.aliasSedeGobierno, options: shuffle([answer, 'Sucre', 'Santa Cruz de la Sierra', 'Cochabamba'], random), explanation: 'La Paz es la sede de los órganos Ejecutivo y Legislativo; Sucre es la capital constitucional.' };
        return { type, country, prompt, correct: answer, accepted: country.aliasSedeGobierno, explanation: 'La Paz es la sede de los órganos Ejecutivo y Legislativo; Sucre es la capital constitucional.' };
      }
      const base = reverse ? getQuestionCountry(country) : getQuestionCapital(country);
      if (type === 'choice') {
        const field = reverse ? 'country' : 'capital';
        return { type, country, ...base, options: shuffle([base.correct, ...distractorsFor(country, field, optionCount - 1, random)], random) };
      }
      return { type, country, ...base };
    }

    startTimer() {
      this.lastTick = performance.now();
      this.timer = window.setInterval(() => {
        if (this.paused || !this.active) { this.lastTick = performance.now(); return; }
        const current = performance.now();
        this.remaining = Math.max(0, this.remaining - (current - this.lastTick) / 1000);
        this.lastTick = current;
        this.updateTimer();
        if (this.remaining <= 0) this.finish('time');
      }, 250);
    }

    stopTimer() {
      clearInterval(this.timer);
      this.timer = 0;
    }

    renderQuestion() {
      this.app.parkGlobe();
      const question = this.questions[this.index];
      if (!question) return this.finish('complete');
      this.answered = false;
      this.questionStarted = performance.now();
      $('#examArena').innerHTML = `
        <div class="quiz-shell exam-quiz-shell">
          <div class="quiz-top">
            <div class="quiz-progress-block"><div class="quiz-progress-label"><strong>Pregunta ${this.index + 1} de ${this.questions.length}</strong><span>Semilla ${escapeHTML(this.config.seed)}</span></div><div class="linear-progress tiny"><span style="width:${(this.index / this.questions.length) * 100}%"></span></div></div>
            <div class="quiz-stat"><span>${svgIcon('icon-exam')} Examen</span></div>
            <div class="quiz-stat" id="examTimerDisplay">${this.config.duration ? formatClock(this.remaining) : formatDuration((performance.now() - this.startedAt) / 1000)}</div>
            <button class="icon-button" type="button" data-pause-exam aria-label="Pausar evaluación">${svgIcon('icon-pause')}</button>
          </div>
          <div class="quiz-body"><div class="question-card" id="examQuestionBody"></div><div class="exam-pause-overlay" id="examPauseOverlay" hidden><div>${svgIcon('icon-pause')}<h2>Evaluación pausada</h2><p>El temporizador está detenido.</p><button class="button button-primary" type="button" data-resume-exam>Continuar</button></div></div></div>
          <div class="quiz-footer"><button class="button button-ghost button-small" type="button" data-cancel-exam>Cancelar</button><div class="quiz-feedback" id="examFeedbackMessage" aria-live="polite"></div><button class="button button-primary button-small" type="button" data-next-exam hidden>Siguiente${svgIcon('icon-next')}</button></div>
        </div>`;
      const body = $('#examQuestionBody');
      const meta = `<div class="question-meta"><span>${escapeHTML(DATA.regions[question.country.regionPedagogica].nombre)}</span><span>${question.type === 'choice' ? 'Selección' : question.type === 'written' ? 'Escritura' : 'Ubicación'}</span></div>`;
      if (question.type === 'choice') {
        body.innerHTML = `${meta}<h2>${escapeHTML(question.prompt)}</h2><div class="answer-grid">${question.options.map(option => `<button class="answer-button" type="button" data-exam-answer="${escapeHTML(option)}">${escapeHTML(option)}</button>`).join('')}</div>`;
      } else if (question.type === 'written') {
        body.innerHTML = `${meta}<h2>${escapeHTML(question.prompt)}</h2><form data-exam-written class="written-answer"><label class="field"><span>Respuesta</span><input id="examWrittenInput" type="text" autocomplete="off" spellcheck="false" required></label><button class="button button-primary" type="submit">Registrar</button></form><p class="answer-note">No hay pistas en evaluación. La validación acepta únicamente alias documentados.</p>`;
        window.setTimeout(() => $('#examWrittenInput')?.focus(), 40);
      } else {
        body.innerHTML = `${meta}<h2>${escapeHTML(question.prompt)}</h2><p class="answer-note">Selecciona un punto sobre el globo. El margen depende de la dificultad.</p><div class="quiz-map-slot" id="examMapSlot"></div>`;
        this.app.mountGlobe($('#examMapSlot'), { region: this.config.region, routeMode: false, interaction: 'pick-location', questionCountry: question.country, labels: false, capitals: false });
        this.app.globe.flyTo(question.country.coordenadasPais[0], question.country.coordenadasPais[1], this.config.difficulty === 'beginner' ? 1.1 : .92, 450);
      }
      this.bindArena(question);
      this.updateTimer();
    }

    bindArena(question) {
      const arena = $('#examArena');
      arena.onclick = event => {
        const answerButton = event.target.closest('[data-exam-answer]');
        if (answerButton) this.answer(question, answerButton.dataset.examAnswer, normalizeText(answerButton.dataset.examAnswer) === normalizeText(question.correct));
        if (event.target.closest('[data-next-exam]')) this.next();
        if (event.target.closest('[data-pause-exam]')) this.togglePause();
        if (event.target.closest('[data-resume-exam]')) this.togglePause(false);
        if (event.target.closest('[data-cancel-exam]')) this.cancel();
      };
      $('[data-exam-written]', arena)?.addEventListener('submit', event => {
        event.preventDefault();
        const value = $('#examWrittenInput').value;
        this.answer(question, value, isAcceptedAnswer(value, question.accepted));
      });
    }

    updateTimer() {
      const display = $('#examTimerDisplay');
      if (display) display.textContent = this.config.duration ? formatClock(this.remaining) : formatDuration((performance.now() - this.startedAt) / 1000);
    }

    togglePause(force) {
      if (!this.active) return;
      this.paused = typeof force === 'boolean' ? force : !this.paused;
      $('#examPauseOverlay').hidden = !this.paused;
      const button = $('[data-pause-exam]', $('#examArena'));
      if (button) {
        button.setAttribute('aria-label', this.paused ? 'Reanudar evaluación' : 'Pausar evaluación');
        button.innerHTML = svgIcon(this.paused ? 'icon-play' : 'icon-pause');
      }
      this.app.globe.togglePause(this.paused);
      if (!this.paused) this.lastTick = performance.now();
    }

    answer(question, answer, correct, details = {}) {
      if (!this.active || this.answered || this.paused) return;
      this.answered = true;
      const responseTime = Math.max(.1, (performance.now() - this.questionStarted) / 1000);
      const record = { countryId: question.country.id, region: question.country.regionPedagogica, type: question.type, prompt: question.prompt, answer: String(answer || 'Sin respuesta'), expected: question.correct, correct, responseTime, explanation: question.explanation, ...details };
      this.answers.push(record);
      this.app.store.recordAnswer(question.country.id, { correct, responseTime, mode: 'exam', answer: record.answer, expected: question.correct, hintUsed: false });
      if (this.app.store.state.settings.sound) this.app.audio.tone(correct ? 'correct' : 'incorrect');
      if (this.config.feedback === 'immediate') {
        const feedback = $('#examFeedbackMessage');
        feedback.className = `quiz-feedback ${correct ? 'correct' : 'incorrect'}`;
        feedback.innerHTML = `${svgIcon(correct ? 'icon-check' : 'icon-warning')}<span>${correct ? 'Correcto.' : `Incorrecto. Respuesta: ${escapeHTML(question.correct)}.`} ${escapeHTML(question.explanation)}</span>`;
        $$('.answer-button', $('#examArena')).forEach(button => {
          button.disabled = true;
          if (normalizeText(button.dataset.examAnswer) === normalizeText(question.correct)) button.classList.add('correct');
          else if (button === document.activeElement) button.classList.add('incorrect');
        });
      } else {
        const feedback = $('#examFeedbackMessage');
        feedback.className = 'quiz-feedback';
        feedback.innerHTML = `${svgIcon('icon-check')}<span>Respuesta registrada. La corrección se mostrará al finalizar.</span>`;
        $$('.answer-button', $('#examArena')).forEach(button => { button.disabled = true; });
      }
      const next = $('[data-next-exam]', $('#examArena'));
      next.hidden = false;
      next.innerHTML = this.index === this.questions.length - 1 ? `Finalizar${svgIcon('icon-arrow')}` : `Siguiente${svgIcon('icon-next')}`;
    }

    onLocationPick(location) {
      if (!this.active || this.answered || this.paused) return;
      const question = this.questions[this.index];
      if (question?.type !== 'location') return;
      const distance = haversineKm([location.lat, location.lon], question.country.coordenadasCapital);
      const thresholds = { beginner: 1300, intermediate: 750, advanced: 400, expert: 230 };
      const threshold = thresholds[this.config.difficulty];
      question.country.__revealLocation = this.config.feedback === 'immediate';
      question.explanation = `Distancia a ${question.country.capitalPrincipal}: ${Math.round(distance).toLocaleString('es-AR')} km; margen: ${threshold.toLocaleString('es-AR')} km.`;
      this.answer(question, `${location.lat.toFixed(2)}, ${location.lon.toFixed(2)}`, distance <= threshold, { distance: Math.round(distance), threshold });
    }

    next() {
      const current = this.questions[this.index];
      if (current?.country) delete current.country.__revealLocation;
      this.app.globe.setInteractionMode('explore');
      this.index += 1;
      if (this.index >= this.questions.length) this.finish('complete');
      else this.renderQuestion();
    }

    finish(reason = 'complete') {
      if (!this.active) return;
      this.app.parkGlobe();
      this.active = false;
      this.paused = false;
      this.stopTimer();
      this.app.globe.setInteractionMode('explore');
      const unanswered = this.questions.length - this.answers.length;
      if (reason === 'time' && unanswered > 0) {
        for (let index = this.answers.length; index < this.questions.length; index += 1) {
          const question = this.questions[index];
          this.answers.push({ countryId: question.country.id, region: question.country.regionPedagogica, type: question.type, prompt: question.prompt, answer: 'Sin respuesta', expected: question.correct, correct: false, responseTime: 0, explanation: question.explanation });
          this.app.store.recordAnswer(question.country.id, { correct: false, responseTime: 0, mode: 'exam', answer: 'Sin respuesta', expected: question.correct, hintUsed: false });
        }
      }
      const correctCount = this.answers.filter(answer => answer.correct).length;
      const score = Math.round((correctCount / this.questions.length) * 100);
      const totalTime = Math.max(1, Math.round((performance.now() - this.startedAt) / 1000));
      let currentStreak = 0;
      let maxStreak = 0;
      this.answers.forEach(answer => { currentStreak = answer.correct ? currentStreak + 1 : 0; maxStreak = Math.max(maxStreak, currentStreak); });
      const regionStats = Object.fromEntries(REGION_ORDER.map(region => [region, { total: 0, correct: 0 }]));
      this.answers.forEach(answer => { regionStats[answer.region].total += 1; if (answer.correct) regionStats[answer.region].correct += 1; });
      const result = { score, correct: correctCount, total: this.questions.length, duration: totalTime, seed: this.config.seed, pass: score >= this.config.pass, regionStats, difficulty: this.config.difficulty };
      this.app.store.addExam(result);
      this.app.store.finishSession({ usedHints: false });
      this.renderResult(result, reason);
      this.app.updateSummaryUI();
    }

    renderResult(result, reason) {
      const errors = this.answers.filter(answer => !answer.correct);
      const weakest = REGION_ORDER
        .map(region => ({ region, accuracy: result.regionStats[region].total ? result.regionStats[region].correct / result.regionStats[region].total : 1 }))
        .sort((a, b) => a.accuracy - b.accuracy)[0];
      const title = result.pass ? 'Evaluación aprobada' : 'Aún no alcanzaste el objetivo';
      const intro = reason === 'time' ? 'El tiempo finalizó y las preguntas sin responder se registraron como incorrectas.' : result.pass ? 'Tu resultado demuestra una base consistente; revisa los errores para consolidarla.' : 'El mapa de errores indica exactamente qué región conviene reforzar.';
      $('#examArena').innerHTML = `
        <div class="quiz-result">
          <div class="result-hero" style="--score:${result.score};--result-color:${result.pass ? 'var(--success)' : 'var(--danger)'};--result-soft:${result.pass ? 'rgba(104,224,169,.13)' : 'rgba(255,116,133,.12)'}"><div class="result-score"><strong>${result.score}</strong></div><div><span class="section-kicker">${result.pass ? 'APROBADO' : 'PENDIENTE'} · mínimo ${this.config.pass}</span><h2>${title}</h2><p>${intro}</p></div></div>
          <div class="result-grid"><div class="result-stat"><span>Aciertos</span><strong>${result.correct} / ${result.total}</strong></div><div class="result-stat"><span>Tiempo total</span><strong>${formatDuration(result.duration)}</strong></div><div class="result-stat"><span>Racha máxima</span><strong>${this.computeMaxStreak()}</strong></div><div class="result-stat"><span>Semilla</span><strong>${escapeHTML(result.seed)}</strong></div></div>
          <section class="result-errors"><h3>Precisión por región</h3><div class="region-result-grid">${REGION_ORDER.map(region => { const stat = result.regionStats[region]; const value = stat.total ? Math.round(stat.correct / stat.total * 100) : 0; return `<div class="region-progress-item"><div><strong>${escapeHTML(DATA.regions[region].nombre)}</strong><span>${stat.correct}/${stat.total}</span></div><div class="linear-progress"><span style="width:${value}%;background:${DATA.regions[region].color}"></span></div></div>`; }).join('')}</div></section>
          <div class="method-note">${svgIcon('icon-route')}<div><strong>Recomendación personalizada</strong><p>Refuerza ${escapeHTML(DATA.regions[weakest.region].nombre)} y repite únicamente las ${errors.length} respuestas incorrectas antes de generar otro examen.</p></div></div>
          ${errors.length ? `<section class="result-errors"><h3>Lista de errores</h3>${errors.map(error => `<div class="error-row"><span>${flagEmoji(countryById.get(error.countryId).iso2)}</span><div><strong>${escapeHTML(error.prompt)}</strong><span>Tu respuesta: ${escapeHTML(error.answer)} · Correcta: ${escapeHTML(error.expected)}</span></div></div>`).join('')}</section>` : `<div class="method-note">${svgIcon('icon-certificate')}<div><strong>Examen perfecto</strong><p>No se registraron errores en esta evaluación.</p></div></div>`}
          <div class="result-actions"><button class="button button-primary" type="button" data-exam-errors ${errors.length ? '' : 'disabled'}>${svgIcon('icon-target')}Repetir solo mis errores</button><button class="button button-secondary" type="button" data-exam-new>${svgIcon('icon-refresh')}Generar otra evaluación</button><button class="button button-ghost" type="button" data-exam-study>${svgIcon('icon-cards')}Volver a estudiar</button></div>
        </div>`;
      $('#examArena').onclick = event => {
        if (event.target.closest('[data-exam-errors]') && errors.length) this.app.practice.startWithCountries([...new Set(errors.map(error => error.countryId))].map(id => countryById.get(id)), 'capital-choice');
        if (event.target.closest('[data-exam-new]')) this.resetToSetup();
        if (event.target.closest('[data-exam-study]')) this.app.route('cards');
      };
    }

    computeMaxStreak() {
      let current = 0;
      let max = 0;
      this.answers.forEach(answer => { current = answer.correct ? current + 1 : 0; max = Math.max(max, current); });
      return max;
    }

    cancel() {
      if (!this.active) return;
      this.app.parkGlobe();
      this.active = false;
      this.stopTimer();
      this.app.globe.setInteractionMode('explore');
      this.resetToSetup();
      this.app.toast('Evaluación cancelada; las respuestas ya registradas conservaron su progreso.', 'info');
    }

    resetToSetup() {
      this.active = false;
      this.stopTimer();
      $('#examArena').hidden = true;
      $('#examSetup').hidden = false;
      this.app.mountGlobe($('#homeGlobeSlot'), { region: 'all', routeMode: true, interaction: 'explore' });
      this.renderOverview();
    }
  }

  class AtlasApp {
    constructor() {
      this.store = new ProgressStore();
      this.audio = new AudioEngine(this.store);
      this.globe = new GlobeRenderer($('#globeStage'), this.store);
      this.currentRoute = 'home';
      this.selectedCountry = null;
      this.autoTourTimer = 0;
      this.autoTourIndex = 0;
      this.map2dActive = false;
      this.renderStaticContent();
      this.bindGlobalEvents();
      this.applySettings();
      this.practice = new PracticeController(this);
      this.exam = new ExamController(this);
      this.learning = new LearningController(this);
      this.cards = new CardsController(this);
      this.globe.addEventListener('select', event => this.openCountry(event.detail, this.currentRoute !== 'explore'));
      this.store.addEventListener('change', () => this.updateSummaryUI());
      this.store.addEventListener('saved', () => this.updateSaveState());
      this.store.addEventListener('storage-error', () => this.toast('El navegador no pudo guardar el progreso.', 'warning'));
      this.store.addEventListener('achievement', event => this.unlockAchievements(event.detail));
      this.updateSummaryUI();
      this.route(location.hash.replace('#/', '') || 'home', false);
      window.addEventListener('hashchange', () => this.route(location.hash.replace('#/', '') || 'home', false));
      window.addEventListener('resize', () => {
        if (this.currentRoute === 'progress') this.drawHistoryChart();
      });
    }

    renderStaticContent() {
      this.renderHomeRegions();
      this.renderCountryTable();
      this.populateCompareSelectors();
      this.renderConfusions();
      this.renderReference();
      this.renderMapLegends();
      $('#reviewDate').textContent = DATA.fechaRevision;
    }

    renderHomeRegions() {
      $('#homeRegionPath').innerHTML = REGION_ORDER.map((region, index) => {
        const countries = countryPool(region);
        return `<button class="region-path-card" type="button" data-learn-region="${region}" style="--region-color:${DATA.regions[region].color};--region-soft:${DATA.regions[region].colorSuave}"><span class="region-number">0${index + 1}</span><span><strong>${escapeHTML(DATA.regions[region].nombre)}</strong><small>${countries.length} Estados · ${escapeHTML(DATA.regions[region].descripcion)}</small></span>${svgIcon('icon-arrow')}</button>`;
      }).join('');
      $('#homeRegionPath').addEventListener('click', event => {
        const button = event.target.closest('[data-learn-region]');
        if (!button) return;
        $('#learnRegion').value = button.dataset.learnRegion;
        this.learning?.reset();
        this.route('learn');
      });
    }

    renderCountryTable(filter = '') {
      const query = normalizeText(filter);
      const rows = DATA.countries
        .filter(country => !query || [country.nombreES, country.capitalPrincipal, country.iso2, country.iso3, country.nombreAlternativo].some(value => normalizeText(value).includes(query)))
        .sort((a, b) => a.orden - b.orden)
        .map(country => `<tr><td><span class="table-country">${flagEmoji(country.iso2)} <strong>${escapeHTML(country.nombreES)}</strong></span></td><td>${escapeHTML(country.capitalPrincipal)}${country.id === 'bolivia' ? '<small>Capital constitucional</small>' : ''}</td><td>${escapeHTML(DATA.regions[country.regionPedagogica].nombre)}</td><td><code>${country.iso2} · ${country.iso3}</code></td><td><button class="text-button" type="button" data-table-country="${country.id}">Ver ficha</button></td></tr>`).join('');
      $('#countryTableBody').innerHTML = rows || '<tr><td colspan="5">No se encontraron coincidencias.</td></tr>';
    }

    populateCompareSelectors() {
      const options = [...DATA.countries].sort((a, b) => a.nombreES.localeCompare(b.nombreES, 'es')).map(country => `<option value="${country.id}">${escapeHTML(country.nombreES)} — ${escapeHTML(country.capitalPrincipal)}</option>`).join('');
      $('#compareA').innerHTML = options;
      $('#compareB').innerHTML = options;
      $('#compareA').value = 'canada';
      $('#compareB').value = 'argentina';
    }

    renderConfusions() {
      $('#confusionGrid').innerHTML = DATA.confusiones.map(item => `<article class="confusion-card"><span class="section-kicker">Diferencia clave</span><h2>${escapeHTML(item.titulo)}</h2><div class="confusion-pair"><div class="confusion-side">${escapeHTML(item.a)}</div>${svgIcon('icon-swap')}<div class="confusion-side">${escapeHTML(item.b)}</div></div><p>${escapeHTML(item.explicacion)}</p>${item.paisId ? `<button class="text-button" type="button" data-confusion-country="${item.paisId}">Ver en el atlas ${svgIcon('icon-arrow')}</button>` : ''}</article>`).join('');
    }

    renderReference() {
      $('#glossaryGrid').innerHTML = DATA.glosario.map(([term, definition]) => `<article class="glossary-item"><h2>${escapeHTML(term)}</h2><p>${escapeHTML(definition)}</p></article>`).join('');
      $('#sourcesList').innerHTML = DATA.fuentes.map(source => `<article class="source-item"><div><h2>${escapeHTML(source.nombre)}</h2><p>${escapeHTML(source.uso)}</p></div><a class="button button-secondary button-small" href="${escapeHTML(source.url)}" target="_blank" rel="noreferrer">Abrir fuente${svgIcon('icon-arrow')}</a></article>`).join('');
    }

    renderMapLegends() {
      const regionLegend = REGION_ORDER.map(region => `<span class="legend-item"><span class="legend-swatch" style="background:${DATA.regions[region].color}"></span>${DATA.regions[region].nombre}</span>`).join('');
      $('#map2dLegend').innerHTML = regionLegend;
      $('#masteryLegend').innerHTML = Object.entries(STATUS_META).map(([key, meta]) => `<span class="legend-item"><span class="legend-swatch status-${key}" style="background:${meta.color}"></span>${meta.icon} ${meta.label}</span>`).join('');
    }

    bindGlobalEvents() {
      document.addEventListener('click', event => {
        const routeButton = event.target.closest('[data-route]');
        if (routeButton) {
          event.preventDefault();
          this.route(routeButton.dataset.route);
        }
        const tableButton = event.target.closest('[data-table-country]');
        if (tableButton) this.openCountry(countryById.get(tableButton.dataset.tableCountry), true);
        const confusionButton = event.target.closest('[data-confusion-country]');
        if (confusionButton) this.openCountry(countryById.get(confusionButton.dataset.confusionCountry), true);
      });
      $$('.nav-item').forEach(item => item.addEventListener('click', () => this.closeMobileMenu()));
      $('#menuToggle').addEventListener('click', () => {
        const open = !$('#sidebar').classList.contains('is-open');
        $('#sidebar').classList.toggle('is-open', open);
        $('#menuToggle').setAttribute('aria-expanded', String(open));
      });
      $('#settingsButton').addEventListener('click', () => this.openSettings());
      $('#helpButton')?.addEventListener('click', () => { const dialog = $('#helpDialog'); if (dialog?.showModal) dialog.showModal(); else dialog?.setAttribute('open', ''); });
      $('#pauseAllButton').addEventListener('click', () => this.toggleAllMotion());
      $('#globalSearch').addEventListener('input', event => this.search(event.target.value));
      $('#globalSearch').addEventListener('keydown', event => this.searchKeydown(event));
      document.addEventListener('click', event => {
        if (!event.target.closest('.global-search')) this.closeSearch();
      });
      $('#countryTableSearch').addEventListener('input', event => this.renderCountryTable(event.target.value));
      $('#view3dButton').addEventListener('click', () => this.setExploreView('3d'));
      $('#view2dButton').addEventListener('click', () => this.setExploreView('2d'));
      $('#exploreRegion').addEventListener('change', () => this.updateExploreRegion());
      $('#globeStyle').addEventListener('change', event => {
        this.globe.setStyle(event.target.value);
        this.store.state.settings.globeStyle = event.target.value;
        this.store.save();
      });
      $('#toggleLabels').addEventListener('change', event => {
        this.globe.setLabels(event.target.checked);
        this.store.state.settings.showLabels = event.target.checked;
        this.store.save();
      });
      $('#toggleCapitals').addEventListener('change', event => {
        this.globe.setCapitals(event.target.checked);
        this.store.state.settings.showCapitals = event.target.checked;
        this.store.save();
      });
      $('#autoTourButton').addEventListener('click', () => this.toggleAutoTour());
      $('#dailyShortcut').addEventListener('click', () => {
        $('#practiceMode').value = 'daily';
        this.practice.renderPreview();
        this.route('practice');
      });
      $('#compareRun').addEventListener('click', () => this.renderComparison());
      $('#compareSwap').addEventListener('click', () => {
        const first = $('#compareA').value;
        $('#compareA').value = $('#compareB').value;
        $('#compareB').value = first;
        this.renderComparison();
      });
      $('#compareA').addEventListener('change', () => this.renderComparison());
      $('#compareB').addEventListener('change', () => this.renderComparison());
      $('#exportButton').addEventListener('click', () => this.exportProgress());
      $('#exportFromProgress').addEventListener('click', () => this.exportProgress());
      $('#importInput').addEventListener('change', event => this.importProgress(event));
      $('#resetDataButton').addEventListener('click', () => this.openResetDialog());
      $('#confirmReset').addEventListener('click', () => {
        this.store.reset();
        $('#confirmDialog').close();
        this.applySettings();
        this.renderProgress();
        this.toast('Todos los datos locales fueron reiniciados.', 'success');
      });
      $('#reviewWeakButton').addEventListener('click', () => {
        $('#practiceMode').value = 'review';
        this.practice.renderPreview();
        this.route('practice');
      });
      $('#certificateButton').addEventListener('click', () => this.openCertificate());
      $('#closeCertificate').addEventListener('click', () => $('#certificateDialog').close());
      $('#printCertificate').addEventListener('click', () => window.print());
      this.bindReferenceTabs();
      this.bindSettingsControls();
    }

    bindReferenceTabs() {
      const tabs = [$('#glossaryTab'), $('#sourcesTab'), $('#methodTab')];
      tabs.forEach((tab, index) => tab.addEventListener('click', () => {
        tabs.forEach((item, itemIndex) => {
          const selected = index === itemIndex;
          item.setAttribute('aria-selected', String(selected));
          item.tabIndex = selected ? 0 : -1;
          $(`#${item.getAttribute('aria-controls')}`).hidden = !selected;
        });
      }));
    }

    bindSettingsControls() {
      const mapping = {
        settingAutoRotate: ['autoRotate', 'checked'],
        settingReducedMotion: ['reducedMotion', 'checked'],
        settingHighContrast: ['highContrast', 'checked'],
        settingQuality: ['quality', 'value'],
        settingFontScale: ['fontScale', 'value'],
        settingSound: ['sound', 'checked'],
        settingVolume: ['volume', 'value']
      };
      Object.entries(mapping).forEach(([id, [key, property]]) => {
        $(`#${id}`).addEventListener('input', event => {
          const raw = event.target[property];
          this.store.state.settings[key] = ['fontScale', 'volume'].includes(key) ? Number(raw) : raw;
          this.applySettings();
          this.store.save();
        });
      });
      $('#settingsDialog').addEventListener('close', () => this.store.save(true));
    }

    route(route, updateHash = true) {
      const valid = ['home','explore','learn','cards','practice','exam','progress','compare','confusions','reference'];
      if (!valid.includes(route)) route = 'home';
      this.currentRoute = route;
      $$('.page').forEach(page => { page.hidden = page.dataset.page !== route; });
      $$('.nav-item').forEach(item => {
        const active = item.dataset.route === route;
        item.classList.toggle('is-active', active);
        if (active) item.setAttribute('aria-current', 'page');
        else item.removeAttribute('aria-current');
      });
      if (updateHash && location.hash !== `#/${route}`) history.pushState(null, '', `#/${route}`);
      this.closeMobileMenu();
      this.stopAutoTour();
      if (route === 'home') {
        this.mountGlobe($('#homeGlobeSlot'), { region: 'all', routeMode: true, interaction: 'explore' });
        this.globe.reset();
      } else if (route === 'explore') {
        if (this.map2dActive) this.setExploreView('2d');
        else this.mountGlobe($('#exploreGlobeSlot'), { region: $('#exploreRegion').value, routeMode: false, interaction: 'explore' });
      } else if (route === 'learn') {
        this.mountGlobe($('#learnGlobeSlot'), { region: $('#learnRegion').value, routeMode: false, interaction: 'explore' });
      } else if (route === 'compare') {
        this.mountGlobe($('#compareGlobeSlot'), { region: 'all', routeMode: false, interaction: 'explore' });
        this.renderComparison();
      } else if (route === 'progress') {
        this.hideGlobe();
        this.renderProgress();
      } else if ((route === 'practice' && this.practice?.active) || (route === 'exam' && this.exam?.active)) {
        // El controlador conserva el globo en la pregunta activa.
      } else {
        this.hideGlobe();
      }
      $('#mainContent').focus({ preventScroll: true });
      window.scrollTo({ top: 0, behavior: this.store.state.settings.reducedMotion ? 'auto' : 'smooth' });
    }

    mountGlobe(slot, options = {}) {
      if (!slot) return;
      const stage = document.getElementById('globeStage');
      if (!stage) return;
      stage.hidden = false;
      if (stage.parentElement !== slot) slot.appendChild(stage);
      this.globe.setRegionFilter(options.region || 'all');
      this.globe.setRouteMode(Boolean(options.routeMode));
      this.globe.setInteractionMode(options.interaction || 'explore', options.questionCountry || null);
      this.globe.setLabels(options.labels ?? this.store.state.settings.showLabels);
      this.globe.setCapitals(options.capitals ?? this.store.state.settings.showCapitals);
      this.globe.setStyle(this.store.state.settings.globeStyle);
      window.requestAnimationFrame(() => this.globe.resize());
    }

    parkGlobe() {
      const stage = document.getElementById('globeStage');
      const parking = document.getElementById('homeGlobeSlot');
      if (stage && parking && stage.parentElement !== parking) parking.appendChild(stage);
      if (stage) stage.hidden = true;
      this.globe.setInteractionMode('explore');
    }

    hideGlobe() {
      const stage = document.getElementById('globeStage');
      if (stage) stage.hidden = true;
      this.globe.setInteractionMode('explore');
    }

    closeMobileMenu() {
      $('#sidebar').classList.remove('is-open');
      $('#menuToggle').setAttribute('aria-expanded', 'false');
    }

    search(query) {
      const normalized = normalizeText(query);
      const results = $('#searchResults');
      if (!normalized) return this.closeSearch();
      const matches = DATA.countries.filter(country => [country.nombreES, country.nombreAlternativo, country.capitalPrincipal, country.iso2, country.iso3, ...country.aliasPais, ...country.aliasCapital].some(value => normalizeText(value).includes(normalized))).slice(0, 8);
      results.innerHTML = matches.length ? matches.map((country, index) => `<button class="search-result${index === 0 ? ' is-selected' : ''}" type="button" role="option" aria-selected="${index === 0}" data-search-country="${country.id}"><span class="flag">${flagEmoji(country.iso2)}</span><span><strong>${escapeHTML(country.nombreES)}</strong><small>${escapeHTML(country.capitalPrincipal)} · ${country.iso3}</small></span><span class="region-mini" style="background:${DATA.regions[country.regionPedagogica].color}"></span></button>`).join('') : '<div class="search-result"><span>No se encontraron países ni capitales.</span></div>';
      results.hidden = false;
      $('#globalSearch').setAttribute('aria-expanded', 'true');
      $$('[data-search-country]', results).forEach(button => button.addEventListener('click', () => {
        this.openCountry(countryById.get(button.dataset.searchCountry), true);
        $('#globalSearch').value = '';
        this.closeSearch();
      }));
    }

    searchKeydown(event) {
      const options = $$('[data-search-country]', $('#searchResults'));
      if (!options.length) return;
      let index = options.findIndex(option => option.classList.contains('is-selected'));
      if (event.key === 'ArrowDown') index = (index + 1) % options.length;
      else if (event.key === 'ArrowUp') index = (index - 1 + options.length) % options.length;
      else if (event.key === 'Enter') {
        event.preventDefault();
        options[Math.max(0, index)]?.click();
        return;
      } else if (event.key === 'Escape') return this.closeSearch();
      else return;
      event.preventDefault();
      options.forEach((option, optionIndex) => {
        option.classList.toggle('is-selected', optionIndex === index);
        option.setAttribute('aria-selected', String(optionIndex === index));
      });
      options[index]?.scrollIntoView({ block: 'nearest' });
    }

    closeSearch() {
      $('#searchResults').hidden = true;
      $('#globalSearch').setAttribute('aria-expanded', 'false');
    }

    openCountry(country, goExplore = true) {
      if (!country) return;
      this.selectedCountry = country;
      if (goExplore) this.route('explore');
      if (!this.map2dActive) this.mountGlobe($('#exploreGlobeSlot'), { region: $('#exploreRegion').value, routeMode: false, interaction: 'explore' });
      this.globe.selectCountry(country.id, { fly: true, emit: false, zoom: country.regionPedagogica === 'caribe' ? 1.65 : 1.4 });
      this.store.markViewed(country.id);
      this.renderCountryDetails(country);
      if (this.map2dActive) this.renderExplore2D();
      this.announce(`${country.nombreES}. Capital: ${country.capitalPrincipal}.`);
    }

    renderCountryDetails(country) {
      const region = DATA.regions[country.regionPedagogica];
      const progress = this.store.state.progress[country.id];
      const status = statusForProgress(progress);
      $('#countryEmptyState').hidden = true;
      const details = $('#countryDetails');
      details.hidden = false;
      details.innerHTML = `
        <div class="country-hero" style="--region-color:${region.color};--region-soft:${region.colorSuave}"><div class="country-hero-top"><span class="region-badge" style="--region-color:${region.color};--region-soft:${region.colorSuave}">${escapeHTML(region.nombre)}</span><span class="status-badge status-${status}">${STATUS_META[status].icon} ${STATUS_META[status].label}</span></div><span class="country-flag" role="img" aria-label="Bandera de ${escapeHTML(country.nombreES)}">${flagEmoji(country.iso2)}</span><h2>${escapeHTML(country.nombreES)}</h2><p class="country-capital">${svgIcon('icon-pin')} Capital: <strong>${escapeHTML(country.capitalPrincipal)}</strong></p></div>
        <div class="country-body"><dl class="country-facts"><div><dt>ISO alfa-2</dt><dd>${country.iso2}</dd></div><div><dt>ISO alfa-3</dt><dd>${country.iso3}</dd></div><div><dt>Ubicación aproximada</dt><dd>${Math.abs(country.coordenadasPais[0]).toFixed(1)}° ${country.coordenadasPais[0] >= 0 ? 'N' : 'S'} · ${Math.abs(country.coordenadasPais[1]).toFixed(1)}° O</dd></div><div><dt>Dominio local</dt><dd>${progress.mastery}%</dd></div></dl><p class="country-note">${escapeHTML(country.descripcionBreve)}</p><div class="mnemonic"><strong>Ayuda mnemotécnica</strong><span>${escapeHTML(country.ayudaMemoria)}</span></div>${country.id === 'bolivia' ? `<div class="method-note">${svgIcon('icon-info')}<div><strong>Capitalidad precisa</strong><p>Sucre es la capital constitucional. La Paz es la sede de los órganos Ejecutivo y Legislativo.</p></div></div>` : ''}<div class="country-actions"><button class="button button-secondary button-small" type="button" data-country-action="speak">${svgIcon('icon-volume')}Escuchar</button><button class="button button-secondary button-small" type="button" data-country-action="practice">${svgIcon('icon-target')}Practicar</button><button class="button button-ghost button-small" type="button" data-country-action="review">${svgIcon('icon-refresh')}Añadir a repaso</button><button class="button button-primary button-small" type="button" data-country-action="compare">${svgIcon('icon-compare')}Comparar</button></div></div>`;
      details.onclick = event => {
        const action = event.target.closest('[data-country-action]')?.dataset.countryAction;
        if (action === 'speak') this.audio.speak(`${country.nombreES}. Capital: ${country.capitalPrincipal}.`);
        if (action === 'practice') this.practice.startWithCountries([country], 'capital-choice');
        if (action === 'review') {
          progress.nextReview = Date.now();
          this.store.save();
          this.toast(`${country.nombreES} quedó priorizado para repaso.`, 'info');
        }
        if (action === 'compare') {
          $('#compareA').value = country.id;
          if ($('#compareB').value === country.id) $('#compareB').value = country.id === 'canada' ? 'argentina' : 'canada';
          this.route('compare');
        }
      };
    }

    setExploreView(mode) {
      this.map2dActive = mode === '2d';
      $('#view3dButton').classList.toggle('is-active', !this.map2dActive);
      $('#view2dButton').classList.toggle('is-active', this.map2dActive);
      $('#view3dButton').setAttribute('aria-pressed', String(!this.map2dActive));
      $('#view2dButton').setAttribute('aria-pressed', String(this.map2dActive));
      $('#exploreGlobeSlot').hidden = this.map2dActive;
      $('#explore2dPanel').hidden = !this.map2dActive;
      if (this.map2dActive) {
        this.hideGlobe();
        this.renderExplore2D();
      } else {
        this.mountGlobe($('#exploreGlobeSlot'), { region: $('#exploreRegion').value, routeMode: false, interaction: 'explore' });
        if (this.selectedCountry) this.globe.selectCountry(this.selectedCountry.id, { fly: true, emit: false });
      }
    }

    renderExplore2D() {
      renderMap2D($('#exploreMap2d'), { selectedId: this.selectedCountry?.id, region: $('#exploreRegion').value, showLabels: true, onSelect: country => this.openCountry(country, false) });
    }

    updateExploreRegion() {
      const region = $('#exploreRegion').value;
      this.globe.setRegionFilter(region);
      if (this.map2dActive) this.renderExplore2D();
      else {
        const focus = { norte: [48, -100, 1.2], central: [15, -87, 2.5], caribe: [18, -72, 2.25], sur: [-15, -60, 1.15], all: [10, -83, 1.05] }[region];
        this.globe.flyTo(focus[0], focus[1], focus[2], 1000);
      }
    }

    toggleAutoTour() {
      if (this.autoTourTimer) return this.stopAutoTour();
      const pool = countryPool($('#exploreRegion').value).sort((a, b) => a.orden - b.orden);
      this.autoTourIndex = 0;
      const run = () => {
        const country = pool[this.autoTourIndex % pool.length];
        this.openCountry(country, false);
        this.autoTourIndex += 1;
      };
      run();
      this.autoTourTimer = window.setInterval(run, this.store.state.settings.reducedMotion ? 6000 : 3800);
      $('#autoTourButton').innerHTML = `${svgIcon('icon-pause')}Detener recorrido`;
    }

    stopAutoTour() {
      clearInterval(this.autoTourTimer);
      this.autoTourTimer = 0;
      if ($('#autoTourButton')) $('#autoTourButton').innerHTML = `${svgIcon('icon-play')}Recorrido automático`;
    }

    renderComparison() {
      const first = countryById.get($('#compareA').value);
      const second = countryById.get($('#compareB').value);
      if (!first || !second) return;
      if (first.id === second.id) {
        $('#compareResult').innerHTML = `<div class="empty-state">${svgIcon('icon-warning')}<h2>Selecciona dos países distintos</h2><p>El comparador necesita dos Estados diferentes.</p></div>`;
        return;
      }
      const distance = Math.round(haversineKm(first.coordenadasCapital, second.coordenadasCapital));
      const card = country => `<article class="compare-country"><div class="compare-country-head"><span class="flag">${flagEmoji(country.iso2)}</span><div><h2>${escapeHTML(country.nombreES)}</h2><p>${escapeHTML(DATA.regions[country.regionPedagogica].nombre)}</p></div></div><div class="compare-facts"><div><span>Capital</span><strong>${escapeHTML(country.capitalPrincipal)}</strong></div><div><span>Códigos</span><strong>${country.iso2} · ${country.iso3}</strong></div><div><span>Latitud capital</span><strong>${Math.abs(country.coordenadasCapital[0]).toFixed(2)}° ${country.coordenadasCapital[0] >= 0 ? 'N' : 'S'}</strong></div><div><span>Error habitual</span><strong>${escapeHTML(country.erroresHabituales?.[0] || 'Sin caso destacado')}</strong></div></div></article>`;
      $('#compareResult').innerHTML = `${card(first)}<div class="distance-card"><span>${svgIcon('icon-route')}</span><div><strong>${distance.toLocaleString('es-AR')} km</strong><small>Distancia ortodrómica aproximada entre ${escapeHTML(first.capitalPrincipal)} y ${escapeHTML(second.capitalPrincipal)}</small></div></div>${card(second)}<div class="method-note">${svgIcon('icon-info')}<div><strong>Lectura comparada</strong><p>${first.regionPedagogica === second.regionPedagogica ? 'Ambos países pertenecen a la misma región pedagógica.' : `${first.nombreES} pertenece a ${DATA.regions[first.regionPedagogica].nombre} y ${second.nombreES} a ${DATA.regions[second.regionPedagogica].nombre}.`}</p></div></div>`;
      if (this.currentRoute === 'compare') {
        this.mountGlobe($('#compareGlobeSlot'), { region: 'all', routeMode: false, interaction: 'explore', labels: true, capitals: true });
        this.globe.setCompare([first.id, second.id]);
      }
    }

    openSettings() {
      const settings = this.store.state.settings;
      $('#settingAutoRotate').checked = settings.autoRotate;
      $('#settingReducedMotion').checked = settings.reducedMotion;
      $('#settingHighContrast').checked = settings.highContrast;
      $('#settingQuality').value = settings.quality;
      $('#settingFontScale').value = settings.fontScale;
      $('#settingSound').checked = settings.sound;
      $('#settingVolume').value = settings.volume;
      $('#fontScaleOutput').textContent = `${Math.round(settings.fontScale * 100)}%`;
      const dialog = $('#settingsDialog');
      if (typeof dialog.showModal === 'function') dialog.showModal();
      else dialog.setAttribute('open', '');
    }

    applySettings() {
      const settings = this.store.state.settings;
      document.documentElement.style.setProperty('--font-scale', settings.fontScale);
      document.body.classList.toggle('reduced-motion', settings.reducedMotion);
      document.body.classList.toggle('high-contrast', settings.highContrast);
      $('#fontScaleOutput').textContent = `${Math.round(settings.fontScale * 100)}%`;
      this.globe.autoRotate = settings.autoRotate;
      this.globe.setStyle(settings.globeStyle);
      this.globe.setLabels(settings.showLabels);
      this.globe.setCapitals(settings.showCapitals);
      $('#toggleLabels').checked = settings.showLabels;
      $('#toggleCapitals').checked = settings.showCapitals;
      $('#globeStyle').value = settings.globeStyle;
      this.globe.resize();
    }

    toggleAllMotion() {
      const paused = this.globe.togglePause();
      document.body.classList.toggle('paused', paused);
      const button = $('#pauseAllButton');
      button.setAttribute('aria-pressed', String(paused));
      button.innerHTML = `${svgIcon(paused ? 'icon-play' : 'icon-pause')}<span class="sr-only">${paused ? 'Reanudar' : 'Pausar'} movimientos</span>`;
      this.toast(paused ? 'Movimientos y rotación pausados.' : 'Movimientos reanudados.', 'info');
    }

    exportProgress() {
      const blob = new Blob([this.store.exportData()], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `atlas-america-progreso-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      URL.revokeObjectURL(url);
      this.toast('Copia de progreso exportada.', 'success');
    }

    async importProgress(event) {
      const file = event.target.files?.[0];
      if (!file) return;
      try {
        this.store.importData(await file.text());
        this.applySettings();
        this.updateSummaryUI();
        this.toast('Progreso importado correctamente.', 'success');
      } catch (error) {
        this.toast(error.message || 'El archivo no es compatible.', 'warning');
      } finally {
        event.target.value = '';
      }
    }

    openResetDialog() {
      const dialog = $('#confirmDialog');
      if (typeof dialog.showModal === 'function') dialog.showModal();
      else dialog.setAttribute('open', '');
    }

    openCertificate() {
      if (this.store.summary().mastered < 35) return;
      $('#certificateDate').textContent = new Intl.DateTimeFormat('es-AR', { dateStyle: 'long' }).format(new Date());
      const dialog = $('#certificateDialog');
      if (typeof dialog.showModal === 'function') dialog.showModal();
      else dialog.setAttribute('open', '');
    }

    updateSummaryUI() {
      const summary = this.store.summary();
      $('#topMastered').textContent = summary.mastered;
      $('#homeSeen').textContent = `${summary.seen} / ${DATA.countries.length}`;
      $('#homeAccuracy').textContent = summary.attempts ? `${Math.round(summary.accuracy * 100)}%` : '—';
      $('#homeStreak').textContent = summary.bestStreak;
      $('#homeDue').textContent = summary.due;
      const averageMastery = Math.round(DATA.countries.reduce((sum, country) => sum + this.store.state.progress[country.id].mastery, 0) / DATA.countries.length);
      $('#heroProgressRing').style.setProperty('--progress', averageMastery);
      $('#heroProgressPercent').textContent = `${averageMastery}%`;
      if (!summary.seen) {
        $('#heroProgressTitle').textContent = 'Tu recorrido comienza aquí';
        $('#heroProgressText').textContent = 'Explora un país para iniciar tu historial de aprendizaje.';
      } else if (summary.mastered === DATA.countries.length) {
        $('#heroProgressTitle').textContent = `¡Dominaste los ${DATA.countries.length} países!`;
        $('#heroProgressText').textContent = 'Mantén la memoria activa con repasos espaciados y nuevos exámenes.';
      } else {
        $('#heroProgressTitle').textContent = `${summary.mastered} países dominados · ${summary.seen} estudiados`;
        $('#heroProgressText').textContent = summary.due ? `Tienes ${summary.due} repasos prioritarios.` : 'Tu próxima sesión adaptativa ya está preparada.';
      }
      const today = new Date().toISOString().slice(0, 10);
      const daily = this.store.state.meta.dailyCompleted[today];
      $('#dailyStatus').textContent = daily ? `Completado · ${daily.correct}/${daily.total}` : 'Disponible';
      if (this.currentRoute === 'progress') this.renderProgress();
      if (this.selectedCountry) this.renderCountryDetails(this.selectedCountry);
    }

    updateSaveState() {
      const chip = $('.mastery-chip');
      chip?.classList.add('is-saved');
      window.setTimeout(() => chip?.classList.remove('is-saved'), 500);
    }

    renderProgress() {
      const summary = this.store.summary();
      const metrics = [
        ['icon-globe', 'Progreso global', `${Math.round(DATA.countries.reduce((sum, country) => sum + this.store.state.progress[country.id].mastery, 0) / DATA.countries.length)}%`],
        ['icon-certificate', 'Países dominados', `${summary.mastered} / ${DATA.countries.length}`],
        ['icon-check', 'Precisión general', summary.attempts ? `${Math.round(summary.accuracy * 100)}%` : '—'],
        ['icon-bolt', 'Mejor racha', summary.bestStreak],
        ['icon-route', 'Tiempo de estudio', formatDuration(summary.totalStudySeconds)],
        ['icon-exam', 'Evaluaciones', summary.exams]
      ];
      $('#progressMetrics').innerHTML = metrics.map(([icon, label, value]) => `<article class="metric-card"><span class="metric-icon">${svgIcon(icon)}</span><div><span>${escapeHTML(label)}</span><strong>${escapeHTML(value)}</strong></div></article>`).join('');
      renderMap2D($('#masteryMap'), { showLabels: false, compact: true, statusProvider: country => statusForProgress(this.store.state.progress[country.id]), onSelect: country => this.openCountry(country, true) });
      $('#regionProgressList').innerHTML = REGION_ORDER.map(region => {
        const countries = countryPool(region);
        const average = Math.round(countries.reduce((sum, country) => sum + this.store.state.progress[country.id].mastery, 0) / countries.length);
        const mastered = countries.filter(country => statusForProgress(this.store.state.progress[country.id]) === 'mastered').length;
        return `<div class="region-progress-item"><div><span class="region-mini" style="background:${DATA.regions[region].color}"></span><strong>${escapeHTML(DATA.regions[region].nombre)}</strong><span>${mastered}/${countries.length} dominados · ${average}%</span></div><div class="linear-progress"><span style="width:${average}%;background:${DATA.regions[region].color}"></span></div></div>`;
      }).join('');
      const weak = this.store.getWeakCountries(8);
      $('#weakCountries').innerHTML = weak.map(({ country, progress, status }) => `<button class="weak-country" type="button" data-weak-country="${country.id}"><span class="flag">${flagEmoji(country.iso2)}</span><span><strong>${escapeHTML(country.nombreES)}</strong><span>${STATUS_META[status].label} · ${progress.mastery}% de dominio</span></span><span class="mastery-pill">${progress.errors} errores</span></button>`).join('');
      $('#weakCountries').onclick = event => {
        const button = event.target.closest('[data-weak-country]');
        if (button) this.openCountry(countryById.get(button.dataset.weakCountry), true);
      };
      $('#achievementsGrid').innerHTML = ACHIEVEMENTS.map(achievement => {
        const unlocked = this.store.state.achievements.includes(achievement.id);
        return `<article class="achievement${unlocked ? '' : ' is-locked'}"><span class="achievement-icon">${svgIcon(achievement.icon)}</span><strong>${escapeHTML(achievement.title)}</strong><span>${escapeHTML(achievement.description)}</span>${unlocked ? '<small>Desbloqueado</small>' : '<small>Pendiente</small>'}</article>`;
      }).join('');
      $('#certificateButton').disabled = summary.mastered < 35;
      this.drawHistoryChart();
    }

    drawHistoryChart() {
      const canvas = $('#historyChart');
      if (!canvas || this.currentRoute !== 'progress') return;
      const history = this.store.state.history;
      $('#historyEmpty').hidden = history.length > 0;
      canvas.hidden = history.length === 0;
      if (!history.length) return;
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(600, Math.round(rect.width * dpr));
      canvas.height = Math.round(300 * dpr);
      const ctx = canvas.getContext('2d');
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const width = canvas.width / dpr;
      const height = canvas.height / dpr;
      ctx.clearRect(0, 0, width, height);
      const padding = { left: 42, right: 18, top: 22, bottom: 34 };
      const plotWidth = width - padding.left - padding.right;
      const plotHeight = height - padding.top - padding.bottom;
      ctx.font = '11px system-ui';
      ctx.fillStyle = 'rgba(194,214,229,.68)';
      ctx.strokeStyle = 'rgba(255,255,255,.09)';
      ctx.lineWidth = 1;
      for (let value = 0; value <= 100; value += 25) {
        const y = padding.top + plotHeight * (1 - value / 100);
        ctx.beginPath(); ctx.moveTo(padding.left, y); ctx.lineTo(width - padding.right, y); ctx.stroke();
        ctx.fillText(String(value), 10, y + 4);
      }
      const points = history.map((entry, index) => ({ x: padding.left + (history.length === 1 ? plotWidth / 2 : index / (history.length - 1) * plotWidth), y: padding.top + plotHeight * (1 - entry.score / 100), score: entry.score }));
      const gradient = ctx.createLinearGradient(0, padding.top, 0, height - padding.bottom);
      gradient.addColorStop(0, 'rgba(79,195,255,.28)');
      gradient.addColorStop(1, 'rgba(79,195,255,0)');
      ctx.beginPath();
      points.forEach((point, index) => index ? ctx.lineTo(point.x, point.y) : ctx.moveTo(point.x, point.y));
      ctx.lineTo(points.at(-1).x, height - padding.bottom);
      ctx.lineTo(points[0].x, height - padding.bottom);
      ctx.closePath();
      ctx.fillStyle = gradient;
      ctx.fill();
      ctx.beginPath();
      points.forEach((point, index) => index ? ctx.lineTo(point.x, point.y) : ctx.moveTo(point.x, point.y));
      ctx.strokeStyle = '#4fc3ff';
      ctx.lineWidth = 2.5;
      ctx.stroke();
      points.forEach(point => {
        ctx.beginPath(); ctx.arc(point.x, point.y, 4.5, 0, Math.PI * 2); ctx.fillStyle = '#eaf8ff'; ctx.fill();
        ctx.fillStyle = 'rgba(231,246,255,.85)'; ctx.fillText(String(point.score), point.x - 7, point.y - 10);
      });
    }

    unlockAchievements(items) {
      items.forEach((achievement, index) => window.setTimeout(() => {
        this.audio.tone('achievement');
        this.toast(`Logro desbloqueado: ${achievement.title}`, 'success');
      }, index * 450));
    }

    toast(message, type = 'info') {
      const toast = document.createElement('div');
      toast.className = `toast ${type}`;
      toast.innerHTML = `<span class="toast-icon">${svgIcon(type === 'success' ? 'icon-check' : type === 'warning' ? 'icon-warning' : 'icon-info')}</span><span>${escapeHTML(message)}</span>`;
      $('#toastRegion').appendChild(toast);
      requestAnimationFrame(() => toast.classList.add('is-open'));
      window.setTimeout(() => {
        toast.classList.remove('is-open');
        window.setTimeout(() => toast.remove(), 260);
      }, 3600);
    }

    announce(message) {
      $('#liveRegion').textContent = '';
      window.setTimeout(() => { $('#liveRegion').textContent = message; }, 20);
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    try {
      window.atlasAmericaApp = new AtlasApp();
      try {
        if (!localStorage.getItem('atlas_guide_seen')) {
          const dialog = document.getElementById('helpDialog');
          if (dialog?.showModal) window.setTimeout(() => { try { dialog.showModal(); } catch (e) {} }, 800);
          localStorage.setItem('atlas_guide_seen', '1');
        }
      } catch (e) {}
    } catch (error) {
      console.error('No se pudo iniciar Atlas América 3D:', error);
      const main = $('#mainContent') || document.body;
      main.innerHTML = `<section class="page"><div class="panel empty-state"><span class="empty-orbit">${svgIcon('icon-warning')}</span><h1>No se pudo iniciar la aplicación</h1><p>${escapeHTML(error.message || 'Error inesperado')}</p><button class="button button-primary" type="button" onclick="location.reload()">Reintentar</button></div></section>`;
    }
  });
})();
