/* Modelo de datos, persistencia y agregaciones del presupuesto 2027 */
'use strict';

const YEAR = 2027;
const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const MONTHS_SHORT = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const STORAGE_KEY = 'presupuesto-2027-v1';

const TYPES = { ingreso: 'Ingreso', gasto: 'Gasto', ahorro: 'Ahorro / Inversión' };
const GROUPS = { necesidad: 'Necesidad', deseo: 'Deseo' };

const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
const zeros = () => new Array(12).fill(0);

function defaultCategories() {
  const c = (name, type, group = '', fixed = false) => ({ id: uid(), name, type, group, fixed });
  return [
    c('Salario', 'ingreso', '', true),
    c('Ingresos extra', 'ingreso'),
    c('Vivienda (arriendo / hipoteca)', 'gasto', 'necesidad', true),
    c('Servicios públicos', 'gasto', 'necesidad', true),
    c('Internet y telefonía', 'gasto', 'necesidad', true),
    c('Alimentación / mercado', 'gasto', 'necesidad'),
    c('Transporte', 'gasto', 'necesidad'),
    c('Salud y seguros', 'gasto', 'necesidad', true),
    c('Educación', 'gasto', 'necesidad', true),
    c('Deudas y créditos', 'gasto', 'necesidad', true),
    c('Restaurantes', 'gasto', 'deseo'),
    c('Entretenimiento', 'gasto', 'deseo'),
    c('Ropa y cuidado personal', 'gasto', 'deseo'),
    c('Suscripciones', 'gasto', 'deseo', true),
    c('Viajes', 'gasto', 'deseo'),
    c('Fondo de emergencia', 'ahorro'),
    c('Inversión', 'ahorro'),
  ];
}

function emptyState() {
  const categories = defaultCategories();
  const plan = {};
  categories.forEach(cat => { plan[cat.id] = zeros(); });
  return {
    version: 1,
    settings: { currency: 'USD', savingsGoal: 20, emergencyFund: 0, tolerance: 5 },
    categories,
    plan,
    transactions: [],
  };
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return normalizeState(JSON.parse(raw));
  } catch (e) { /* almacenamiento no disponible o dañado */ }
  return null;
}

function saveState(state) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); return true; }
  catch (e) { return false; }
}

function normalizeState(s) {
  const base = emptyState();
  if (!s || !Array.isArray(s.categories)) throw new Error('Formato no válido');
  const out = {
    version: 1,
    settings: Object.assign({}, base.settings, s.settings || {}),
    categories: s.categories.map(c => ({
      id: String(c.id || uid()), name: String(c.name || 'Sin nombre'),
      type: TYPES[c.type] ? c.type : 'gasto',
      group: c.type === 'gasto' ? (GROUPS[c.group] ? c.group : 'necesidad') : '',
      fixed: !!c.fixed,
    })),
    plan: {},
    transactions: [],
  };
  if (s.isExample) out.isExample = true;
  out.categories.forEach(c => {
    const p = (s.plan && s.plan[c.id]) || [];
    out.plan[c.id] = zeros().map((_, i) => Number(p[i]) || 0);
  });
  const ids = new Set(out.categories.map(c => c.id));
  (s.transactions || []).forEach(t => {
    if (!ids.has(t.catId) || !/^2027-\d{2}-\d{2}$/.test(t.date)) return;
    out.transactions.push({ id: String(t.id || uid()), date: t.date, catId: t.catId, amount: Number(t.amount) || 0, note: String(t.note || '') });
  });
  return out;
}

/* ---------- Guardado en la cuenta (solo dentro de claude.ai) ----------
 * Fuera de claude.ai no existe window.claude y todo queda en localStorage.
 * Dentro, el estado completo se guarda como un documento privado del usuario,
 * así el presupuesto es el mismo en el celular y en el computador. */
const Cloud = {
  doc: null, active: false, lastJson: null, pending: null, writing: false, timer: null, status: () => {},

  async start({ onRemote, localState, onStatus }) {
    this.status = onStatus;
    onStatus('Guardado en este navegador', '');
    if (!(window.claude && typeof window.claude.use === 'function')) return;
    let db = null, user = null;
    try { [db, user] = await Promise.all([window.claude.use('db'), window.claude.use('user')]); } catch (e) { /* sin capacidad */ }
    if (!db || !user) return;
    const id = await user.id().catch(() => null);
    if (!id) return;
    this.doc = db.doc('data/users/' + id + '/presupuesto-2027');
    onStatus('Conectando con tu cuenta…', '');
    let confirmed = false;
    const timeout = setTimeout(() => { if (!confirmed) onStatus('Tu cuenta no responde todavía; se guarda en este navegador', 'warn'); }, 10000);
    this.doc.onSnapshot(snap => {
      const d = snap.exists ? snap.data() : null;
      if (d && typeof d.json === 'string') {
        if (d.json !== this.lastJson) {
          this.lastJson = d.json;
          try { const st = normalizeState(JSON.parse(d.json)); saveState(st); onRemote(st); } catch (e) { /* documento dañado: se ignora */ }
        }
      }
      if (!snap.metadata.fromCache && !confirmed) {
        confirmed = true; clearTimeout(timeout); this.active = true;
        if (!d) this.save(localState()); // primera vez: sube lo que hay en este navegador
        onStatus('Guardado en tu cuenta', 'good');
      }
    }, () => {
      clearTimeout(timeout); this.active = false;
      onStatus('Sin conexión con tu cuenta; se guarda en este navegador', 'warn');
    });
  },

  save(state) {
    if (!this.doc || !this.active) return false;
    this.pending = JSON.stringify(state);
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), 700);
    return true;
  },

  async flush() {
    if (this.writing || this.pending == null) return;
    const json = this.pending; this.pending = null;
    if (json === this.lastJson) return;
    this.writing = true; this.lastJson = json;
    this.status('Guardando…', '');
    try {
      await this.doc.set({ json, updatedAt: new Date().toISOString() });
      this.status('Guardado en tu cuenta', 'good');
    } catch (e) {
      const full = e && (e.code === 'quota_exceeded' || e.code === 'invalid_argument');
      this.status(full ? 'Tu cuenta no admite más datos: exporta un respaldo' : 'No se pudo guardar en tu cuenta; quedó en este navegador', 'warn');
    } finally {
      this.writing = false;
      if (this.pending != null) this.flush();
    }
  },
};

/* ---------- Datos de ejemplo (deterministas) ---------- */
function exampleState() {
  const s = emptyState();
  s.settings.emergencyFund = 6500;
  let seed = 2027;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  const byName = n => s.categories.find(c => c.name === n);
  const base = {
    'Salario': 3200, 'Ingresos extra': 250,
    'Vivienda (arriendo / hipoteca)': 950, 'Servicios públicos': 140, 'Internet y telefonía': 65,
    'Alimentación / mercado': 480, 'Transporte': 190, 'Salud y seguros': 130, 'Educación': 110,
    'Deudas y créditos': 260, 'Restaurantes': 160, 'Entretenimiento': 90, 'Ropa y cuidado personal': 90,
    'Suscripciones': 35, 'Viajes': 0, 'Fondo de emergencia': 300, 'Inversión': 200,
  };
  Object.entries(base).forEach(([name, v]) => {
    const cat = byName(name);
    s.plan[cat.id] = zeros().map(() => v);
  });
  // Estacionalidad: primas en junio y diciembre, viajes en julio y diciembre
  s.plan[byName('Ingresos extra').id][5] = 1600;
  s.plan[byName('Ingresos extra').id][11] = 1600;
  s.plan[byName('Viajes').id][6] = 900;
  s.plan[byName('Viajes').id][11] = 700;
  s.plan[byName('Ropa y cuidado personal').id][11] = 220;
  s.plan[byName('Educación').id][0] = 450;

  // Movimientos reales: enero a septiembre de 2027
  const lastMonth = 8;
  s.categories.forEach(cat => {
    for (let m = 0; m <= lastMonth; m++) {
      const p = s.plan[cat.id][m];
      if (!p) continue;
      let real;
      if (cat.fixed) real = p;
      else if (cat.type === 'ingreso') real = p * (0.8 + rnd() * 0.4);
      else if (cat.type === 'ahorro') real = p * (rnd() < 0.25 ? 0.5 : 1);
      else real = p * (0.85 + rnd() * 0.35 + (cat.group === 'deseo' ? 0.08 : 0));
      const parts = cat.fixed || cat.type !== 'gasto' ? 1 : 1 + Math.floor(rnd() * 3);
      let rest = Math.round(real);
      for (let k = 0; k < parts; k++) {
        const amount = k === parts - 1 ? rest : Math.round(rest * (0.3 + rnd() * 0.3));
        rest -= amount;
        const day = cat.fixed ? 5 : 1 + Math.floor(rnd() * 27);
        s.transactions.push({
          id: uid(), catId: cat.id, amount,
          date: `${YEAR}-${String(m + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
          note: parts > 1 ? `${cat.name} (${k + 1}/${parts})` : cat.name,
        });
      }
    }
  });
  s.transactions.sort((a, b) => a.date.localeCompare(b.date));
  return s;
}

/* ---------- Agregaciones ---------- */
const monthOf = date => Number(date.slice(5, 7)) - 1;

/** Devuelve matrices de plan y real por categoría y por bloque (12 meses). */
function aggregate(state) {
  const real = {};
  state.categories.forEach(c => { real[c.id] = zeros(); });
  const monthsWithData = new Set();
  state.transactions.forEach(t => {
    if (!real[t.catId]) return;
    const m = monthOf(t.date);
    real[t.catId][m] += t.amount;
    monthsWithData.add(m);
  });

  const blocks = () => ({ ingreso: zeros(), gasto: zeros(), ahorro: zeros(), necesidad: zeros(), deseo: zeros(), fijo: zeros(), variable: zeros() });
  const P = blocks(), R = blocks();
  state.categories.forEach(c => {
    for (let m = 0; m < 12; m++) {
      const p = state.plan[c.id][m], r = real[c.id][m];
      P[c.type][m] += p; R[c.type][m] += r;
      if (c.type === 'gasto') {
        P[c.group][m] += p; R[c.group][m] += r;
        const k = c.fixed ? 'fijo' : 'variable';
        P[k][m] += p; R[k][m] += r;
      }
    }
  });
  const balance = (B) => zeros().map((_, m) => B.ingreso[m] - B.gasto[m] - B.ahorro[m]);
  P.balance = balance(P); R.balance = balance(R);
  const cutoff = monthsWithData.size ? Math.max(...monthsWithData) : -1;
  return { realByCat: real, P, R, monthsWithData, cutoff };
}

const sumOver = (arr, months) => months.reduce((acc, m) => acc + (arr[m] || 0), 0);
const range = (a, b) => { const r = []; for (let i = a; i <= b; i++) r.push(i); return r; };
