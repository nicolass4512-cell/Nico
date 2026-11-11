/* Interfaz principal del gestor de presupuesto 2027 */
'use strict';

// Primera visita: se abre con datos de ejemplo claramente marcados
let state = loadState() || Object.assign(exampleState(), { isExample: true });

const ui = { view: 'resumen', kpiPeriod: 'ytd', movMonth: 'all', movCat: 'all', modalMonth: null };

/* ---------- Utilidades ---------- */
const $ = (sel, root = document) => root.querySelector(sel);
let moneyFmt;
function buildFormatter() {
  try { moneyFmt = new Intl.NumberFormat('es', { style: 'currency', currency: state.settings.currency, maximumFractionDigits: 0 }); }
  catch (e) { moneyFmt = new Intl.NumberFormat('es', { maximumFractionDigits: 0 }); }
}
const money = v => moneyFmt.format(Math.round(v || 0));
const signed = v => `<span class="${v >= 0 ? 'pos' : 'neg'}">${money(v)}</span>`;
const catById = id => state.categories.find(c => c.id === id);

function persist() {
  const local = saveState(state);
  const cloud = Cloud.save(state);
  if (!local && !cloud) toast('No se pudo guardar (almacenamiento bloqueado). Exporta tus datos.');
}
function setSyncStatus(text, level) {
  const el = $('#sync');
  if (!el) return;
  el.textContent = text;
  el.className = 'sync ' + (level || '');
}
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg; t.classList.remove('hidden');
  clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.add('hidden'), 2600);
}
async function download(name, content, type) {
  // Dentro de claude.ai las descargas pasan por la capacidad "downloads"
  const dl = window.claude && window.claude.use ? await window.claude.use('downloads').catch(() => null) : null;
  if (dl) {
    try { await dl.save({ filename: name, data: content }); toast('Archivo listo'); }
    catch (e) { if (e && e.code !== 'declined') toast('No se pudo descargar el archivo en esta vista'); }
    return;
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([content], { type }));
  a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/* Diálogo propio (confirm/prompt no están disponibles en todas las vistas) */
function askDialog({ title, body = '', fields = '', ok = 'Aceptar', danger = false }) {
  return new Promise(resolve => {
    const box = $('#dialog');
    box.innerHTML = `<form class="dialog-box" id="dialog-form">
      <h3>${title}</h3>${body ? `<p>${body}</p>` : ''}${fields}
      <div class="btn-row" style="justify-content:flex-end">
        <button type="button" class="btn" id="dialog-cancel">Cancelar</button>
        <button type="submit" class="btn ${danger ? 'danger-solid' : 'primary'}" id="dialog-ok">${ok}</button></div></form>`;
    box.classList.remove('hidden');
    const form = $('#dialog-form');
    const close = v => { box.classList.add('hidden'); box.innerHTML = ''; resolve(v); };
    $('#dialog-cancel').onclick = () => close(null);
    form.onsubmit = e => { e.preventDefault(); close(Object.fromEntries(new FormData(form))); };
    (form.querySelector('input,select') || $('#dialog-ok')).focus();
  });
}
const badge = (status, text) => `<span class="badge ${status}">${text}</span>`;
const STATUS_TEXT = { good: 'En meta', warn: 'Alerta', bad: 'Crítico', none: 'Sin datos' };
const colorOf = st => ({ good: 'var(--good)', warn: 'var(--warn)', bad: 'var(--bad)' }[st] || 'var(--plan)');
function progress(real, plan, invert) {
  const r = plan ? real / plan : 0;
  const st = !plan ? 'none' : invert ? (r >= 1 ? 'good' : r >= 0.75 ? 'warn' : 'bad') : (r <= 1 ? 'good' : r <= 1.05 ? 'warn' : 'bad');
  return `<div class="bar"><span style="width:${Math.min(100, r * 100)}%;background:${colorOf(st)}"></span></div>`;
}
function monthStatus(agg, m) {
  if (!agg.monthsWithData.has(m)) return 'none';
  const tol = (state.settings.tolerance || 0) / 100;
  const p = agg.P.gasto[m], r = agg.R.gasto[m];
  if (!p) return r ? 'bad' : 'good';
  return r <= p ? 'good' : r <= p * (1 + tol) ? 'warn' : 'bad';
}

/* ---------- Navegación ---------- */
$('#tabs').addEventListener('click', e => {
  const b = e.target.closest('button[data-view]');
  if (!b) return;
  ui.view = b.dataset.view;
  document.querySelectorAll('#tabs button').forEach(x => x.classList.toggle('active', x === b));
  document.querySelectorAll('.view').forEach(v => v.classList.toggle('active', v.id === 'view-' + ui.view));
  render();
  window.scrollTo(0, 0);
});

function render() {
  buildFormatter();
  const agg = aggregate(state);
  ({ resumen: renderResumen, meses: renderMeses, plan: renderPlan, movs: renderMovs, kpi: renderKPI, config: renderConfig })[ui.view](agg);
  if (ui.modalMonth != null) renderMonthModal(agg, ui.modalMonth);
}

/* ---------- Resumen ---------- */
function renderResumen(agg) {
  const { P, R, cutoff } = agg;
  const all = range(0, 11), ytd = cutoff >= 0 ? range(0, cutoff) : [];
  const k = computeKPIs(state, agg, cutoff >= 0 ? ytd : all, money);
  const proj = k.kpis.find(x => x.name.startsWith('Proyección'));
  const noPlan = state.categories.every(c => state.plan[c.id].every(v => !v));
  const label = cutoff >= 0 ? `Real Ene–${MONTHS_SHORT[cutoff]}` : 'Sin registros reales aún';

  const stat = (lbl, plan, real, cls) => `<div class="stat"><div class="label">${lbl}</div>
    <div class="value ${cls || ''}">${money(plan)}</div>
    <div class="hint">Plan anual · ${label}: <b>${money(real)}</b></div></div>`;

  const cumP = [], cumR = [];
  all.reduce((a, m) => { cumP.push(a + P.balance[m] + P.ahorro[m]); return a + P.balance[m] + P.ahorro[m]; }, 0);
  all.reduce((a, m) => { const v = a + R.balance[m] + R.ahorro[m]; cumR.push(m <= cutoff ? v : null); return v; }, 0);

  const row = (name, arrP, arrR, invert) => {
    const tP = sumOver(arrP, all), tR = sumOver(arrR, all);
    return `<tr class="group-row"><td colspan="14">${name}</td></tr>
      <tr><td>Plan</td>${all.map(m => `<td>${money(arrP[m])}</td>`).join('')}<td><b>${money(tP)}</b></td></tr>
      <tr><td>Real</td>${all.map(m => `<td>${agg.monthsWithData.has(m) ? money(arrR[m]) : '<span class="muted">—</span>'}</td>`).join('')}<td><b>${money(tR)}</b></td></tr>
      <tr><td>Diferencia</td>${all.map(m => {
        if (!agg.monthsWithData.has(m)) return '<td class="muted">—</td>';
        const d = arrR[m] - arrP[m];
        return `<td class="${(invert ? d <= 0 : d >= 0) ? 'pos' : 'neg'}">${money(d)}</td>`;
      }).join('')}<td></td></tr>`;
  };

  $('#view-resumen').innerHTML = `
    ${state.isExample ? `<div class="notice"><div><b>Estás viendo datos de ejemplo.</b> Explora las pestañas y, cuando quieras, empieza tu propio presupuesto 2027 (se conservan las categorías, con montos en cero).</div>
      <button class="btn primary" data-action="start-own">Empezar mi presupuesto</button></div>`
    : noPlan ? `<div class="notice"><div><b>¡Bienvenido!</b> Programa tu presupuesto en <i>Planificación</i> y registra lo real en <i>Movimientos</i>.</div>
      <button class="btn" data-goto="plan">Ir a Planificación</button></div>` : ''}
    <div class="grid grid-4" style="margin-bottom:18px">
      ${stat('Ingresos', P.ingreso.reduce((a, b) => a + b, 0), sumOver(R.ingreso, ytd))}
      ${stat('Gastos', P.gasto.reduce((a, b) => a + b, 0), sumOver(R.gasto, ytd))}
      ${stat('Ahorro e inversión', P.ahorro.reduce((a, b) => a + b, 0), sumOver(R.ahorro, ytd))}
      <div class="stat"><div class="label">Proyección de saldo libre al cierre</div>
        <div class="value ${proj.status === 'bad' ? 'neg' : 'pos'}">${proj.value}</div>
        <div class="hint">${proj.target}</div></div>
    </div>
    <div class="grid grid-2">
      <div class="card"><h3>Gastos mensuales: plan vs. real</h3>
        ${barChart([{ name: 'Plan', color: 'var(--plan)', values: P.gasto }, { name: 'Real', color: 'var(--expense)', values: all.map(m => agg.monthsWithData.has(m) ? R.gasto[m] : 0) }], MONTHS_SHORT, { format: money })}</div>
      <div class="card"><h3>Ahorro acumulado (ingresos − gastos)</h3>
        ${lineChart([{ name: 'Plan', color: 'var(--plan)', values: cumP, dashed: true }, { name: 'Real', color: 'var(--saving)', values: cumR }], MONTHS_SHORT, { format: money })}</div>
    </div>
    <div class="card">
      <div class="card-head"><h2>Vista anual 2027 — todos los meses</h2>
        <span class="small muted">Saldo libre = ingresos − gastos − ahorro programado</span></div>
      <div class="table-wrap"><table>
        <thead><tr><th>Concepto</th>${MONTHS_SHORT.map(m => `<th>${m}</th>`).join('')}<th>Total</th></tr></thead>
        <tbody>
          ${row('Ingresos', P.ingreso, R.ingreso, false)}
          ${row('Gastos', P.gasto, R.gasto, true)}
          ${row('Ahorro e inversión', P.ahorro, R.ahorro, false)}
          ${row('Saldo libre', P.balance, R.balance, false)}
          <tr class="total-row"><td>Estado del mes</td>${all.map(m => `<td>${badge(monthStatus(agg, m), STATUS_TEXT[monthStatus(agg, m)])}</td>`).join('')}<td></td></tr>
        </tbody></table></div>
    </div>
    <div class="card"><div class="card-head"><h3>Indicadores clave (${cutoff >= 0 ? 'acumulado Ene–' + MONTHS_SHORT[cutoff] : 'plan anual'})</h3>
      <button class="btn sm" data-goto="kpi">Ver todos los KPI →</button></div>
      <div class="grid grid-4">${k.kpis.slice(0, 4).map(kpiCard).join('')}</div></div>`;
}

/* ---------- Meses ---------- */
function renderMeses(agg) {
  const { P, R } = agg;
  $('#view-meses').innerHTML = `
    <div class="card-head"><h2>Los 12 meses de 2027</h2><span class="small muted">Haz clic en un mes para ver el detalle por categoría y registrar movimientos</span></div>
    <div class="grid grid-3">${range(0, 11).map(m => {
      const st = monthStatus(agg, m), has = agg.monthsWithData.has(m);
      return `<div class="card month-card" data-month="${m}" style="margin:0">
        <div class="m-title"><h3>${MONTHS[m]}</h3>${badge(st, STATUS_TEXT[st])}</div>
        <div class="kv"><span>Ingresos</span><span>${money(R.ingreso[m])} / ${money(P.ingreso[m])}</span></div>
        ${progress(R.ingreso[m], P.ingreso[m], true)}
        <div class="kv"><span>Gastos</span><span>${money(R.gasto[m])} / ${money(P.gasto[m])}</span></div>
        ${progress(R.gasto[m], P.gasto[m], false)}
        <div class="kv"><span>Ahorro</span><span>${money(R.ahorro[m])} / ${money(P.ahorro[m])}</span></div>
        ${progress(R.ahorro[m], P.ahorro[m], true)}
        <div class="kv"><span><b>Saldo libre</b></span><span>${has ? signed(R.balance[m]) : '<span class="muted">—</span>'} <span class="muted small">(plan ${money(P.balance[m])})</span></span></div>
      </div>`;
    }).join('')}</div>`;
}

function renderMonthModal(agg, m) {
  const { P, R, realByCat } = agg;
  const txs = state.transactions.filter(t => monthOf(t.date) === m).sort((a, b) => a.date.localeCompare(b.date));
  const rows = Object.keys(TYPES).map(type => {
    const cats = state.categories.filter(c => c.type === type);
    if (!cats.length) return '';
    return `<tr class="group-row"><td colspan="5">${TYPES[type]}</td></tr>` + cats.map(c => {
      const p = state.plan[c.id][m], r = realByCat[c.id][m], d = r - p;
      const good = type === 'gasto' ? d <= 0 : d >= 0;
      return `<tr><td>${esc(c.name)}</td><td>${money(p)}</td><td>${money(r)}</td><td class="${good ? 'pos' : 'neg'}">${money(d)}</td>
        <td>${p ? (r / p * 100).toFixed(0) + ' %' : '—'}</td></tr>`;
    }).join('');
  }).join('');
  const day = `${YEAR}-${String(m + 1).padStart(2, '0')}-01`;
  $('#modal-content').innerHTML = `
    <h2>${MONTHS[m]} 2027</h2>
    <div class="grid grid-4" style="margin-bottom:16px">
      <div class="stat"><div class="label">Ingresos</div><div class="value">${money(R.ingreso[m])}</div><div class="hint">Plan ${money(P.ingreso[m])}</div></div>
      <div class="stat"><div class="label">Gastos</div><div class="value">${money(R.gasto[m])}</div><div class="hint">Plan ${money(P.gasto[m])}</div></div>
      <div class="stat"><div class="label">Ahorro</div><div class="value">${money(R.ahorro[m])}</div><div class="hint">Plan ${money(P.ahorro[m])}</div></div>
      <div class="stat"><div class="label">Saldo libre</div><div class="value">${signed(R.balance[m])}</div><div class="hint">Plan ${money(P.balance[m])}</div></div>
    </div>
    <h3>Registrar movimiento</h3>
    ${txForm('modal', day, day, `${YEAR}-${String(m + 1).padStart(2, '0')}-${new Date(YEAR, m + 1, 0).getDate()}`)}
    <h3 style="margin-top:18px">Detalle por categoría</h3>
    <div class="table-wrap"><table><thead><tr><th>Categoría</th><th>Plan</th><th>Real</th><th>Diferencia</th><th>Ejecución</th></tr></thead><tbody>${rows}</tbody></table></div>
    <h3 style="margin-top:18px">Movimientos del mes (${txs.length})</h3>
    ${txTable(txs)}`;
  $('#modal').classList.remove('hidden');
}

/* ---------- Formularios de movimientos ---------- */
function categoryOptions(selected) {
  return Object.keys(TYPES).map(type => `<optgroup label="${TYPES[type]}">${state.categories.filter(c => c.type === type)
    .map(c => `<option value="${c.id}" ${c.id === selected ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</optgroup>`).join('');
}
function txForm(prefix, date, min, max) {
  return `<form class="form-row tx-form" data-prefix="${prefix}">
    <label class="field">Fecha<input type="date" name="date" required min="${min || YEAR + '-01-01'}" max="${max || YEAR + '-12-31'}" value="${date}"></label>
    <label class="field">Categoría<select name="catId" required>${categoryOptions()}</select></label>
    <label class="field">Monto<input type="number" name="amount" required min="0" step="any" placeholder="0"></label>
    <label class="field" style="flex:1;min-width:160px">Descripción<input type="text" name="note" placeholder="Opcional"></label>
    <button class="btn primary" type="submit">Agregar</button></form>`;
}
function txTable(txs) {
  if (!txs.length) return '<p class="muted">No hay movimientos.</p>';
  return `<div class="table-wrap"><table><thead><tr><th>Fecha</th><th class="left">Categoría</th><th class="left">Tipo</th><th class="left">Descripción</th><th>Monto</th><th></th></tr></thead><tbody>
    ${txs.map(t => { const c = catById(t.catId); return `<tr><td>${t.date}</td><td class="left">${esc(c.name)}</td><td class="left">${TYPES[c.type]}</td>
      <td class="left">${esc(t.note)}</td><td>${money(t.amount)}</td><td><button class="btn sm danger" data-action="del-tx" data-id="${t.id}">Eliminar</button></td></tr>`; }).join('')}
    </tbody></table></div>`;
}

/* ---------- Movimientos ---------- */
function renderMovs() {
  let txs = state.transactions.slice();
  if (ui.movMonth !== 'all') txs = txs.filter(t => monthOf(t.date) === Number(ui.movMonth));
  if (ui.movCat !== 'all') txs = txs.filter(t => t.catId === ui.movCat);
  txs.sort((a, b) => b.date.localeCompare(a.date));
  const tot = { ingreso: 0, gasto: 0, ahorro: 0 };
  txs.forEach(t => { tot[catById(t.catId).type] += t.amount; });
  const today = new Date();
  const def = today.getFullYear() === YEAR ? today.toISOString().slice(0, 10) : `${YEAR}-01-01`;
  $('#view-movs').innerHTML = `
    <div class="card"><h2>Registrar movimiento real</h2>${txForm('movs', def)}</div>
    <div class="card">
      <div class="card-head"><h2>Movimientos registrados</h2>
        <div class="form-row">
          <select id="f-month"><option value="all">Todos los meses</option>${MONTHS.map((n, i) => `<option value="${i}" ${String(i) === String(ui.movMonth) ? 'selected' : ''}>${n}</option>`).join('')}</select>
          <select id="f-cat"><option value="all">Todas las categorías</option>${categoryOptions(ui.movCat)}</select>
          <button class="btn" data-action="export-csv">Exportar CSV</button>
        </div></div>
      <div class="grid grid-4" style="margin-bottom:14px">
        <div class="stat"><div class="label">Movimientos</div><div class="value">${txs.length}</div></div>
        <div class="stat"><div class="label">Ingresos</div><div class="value pos">${money(tot.ingreso)}</div></div>
        <div class="stat"><div class="label">Gastos</div><div class="value neg">${money(tot.gasto)}</div></div>
        <div class="stat"><div class="label">Ahorro</div><div class="value">${money(tot.ahorro)}</div></div>
      </div>
      ${txTable(txs)}
    </div>`;
  if (ui.movCat === 'all') $('#f-cat').value = 'all';
}

/* ---------- Planificación ---------- */
function renderPlan(agg) {
  const all = range(0, 11);
  const groupRows = type => {
    const cats = state.categories.filter(c => c.type === type);
    const sub = all.map(m => cats.reduce((a, c) => a + state.plan[c.id][m], 0));
    return `<tr class="group-row"><td>${TYPES[type]}</td>${sub.map((v, m) => `<td data-sub="${type}-${m}">${money(v)}</td>`).join('')}<td data-sub="${type}-t">${money(sub.reduce((a, b) => a + b, 0))}</td><td></td></tr>` +
      cats.map(c => `<tr><td title="${esc(c.name)}">${esc(c.name)}${c.fixed ? ' <span class="badge none">fijo</span>' : ''}${c.group === 'deseo' ? ' <span class="badge warn">deseo</span>' : ''}</td>
        ${all.map(m => `<td><input type="number" min="0" step="any" data-cat="${c.id}" data-m="${m}" value="${state.plan[c.id][m] || ''}" placeholder="0"></td>`).join('')}
        <td data-rowtot="${c.id}"><b>${money(state.plan[c.id].reduce((a, b) => a + b, 0))}</b></td>
        <td><button class="btn sm" data-action="repeat-row" data-cat="${c.id}" title="Copiar el valor de enero a todos los meses">Repetir ene.</button></td></tr>`).join('');
  };
  $('#view-plan').innerHTML = `
    <div class="card">
      <div class="card-head"><h2>Programación mensual del presupuesto 2027</h2>
        <div class="btn-row">
          <button class="btn" data-action="copy-jan">Copiar enero a todo el año</button>
          <button class="btn" data-action="increase">Aplicar incremento %</button>
          <button class="btn" data-action="fit-real" ${agg.cutoff < 0 || agg.cutoff >= 11 ? 'disabled' : ''}>Ajustar al promedio real</button>
        </div></div>
      <p class="small muted" style="margin-top:0">Escribe el monto planificado de cada categoría para cada mes. Los cambios se guardan automáticamente.
        "Ajustar al promedio real" reemplaza el plan de los meses sin registros por el promedio real de las categorías variables.</p>
      <div class="table-wrap plan-table"><table>
        <thead><tr><th>Categoría</th>${MONTHS_SHORT.map(m => `<th>${m}</th>`).join('')}<th>Total</th><th></th></tr></thead>
        <tbody>${groupRows('ingreso')}${groupRows('gasto')}${groupRows('ahorro')}
          <tr class="total-row"><td>Saldo libre planificado</td>${all.map(m => `<td data-bal="${m}">${signed(agg.P.balance[m])}</td>`).join('')}<td data-bal="t">${signed(agg.P.balance.reduce((a, b) => a + b, 0))}</td><td></td></tr>
        </tbody></table></div>
    </div>`;
}

function refreshPlanTotals() {
  const agg = aggregate(state);
  state.categories.forEach(c => {
    const el = document.querySelector(`[data-rowtot="${c.id}"]`);
    if (el) el.innerHTML = `<b>${money(state.plan[c.id].reduce((a, b) => a + b, 0))}</b>`;
  });
  Object.keys(TYPES).forEach(type => {
    let t = 0;
    for (let m = 0; m < 12; m++) {
      t += agg.P[type][m];
      const el = document.querySelector(`[data-sub="${type}-${m}"]`);
      if (el) el.textContent = money(agg.P[type][m]);
    }
    const el = document.querySelector(`[data-sub="${type}-t"]`);
    if (el) el.textContent = money(t);
  });
  for (let m = 0; m < 12; m++) { const el = document.querySelector(`[data-bal="${m}"]`); if (el) el.innerHTML = signed(agg.P.balance[m]); }
  const el = document.querySelector('[data-bal="t"]');
  if (el) el.innerHTML = signed(agg.P.balance.reduce((a, b) => a + b, 0));
}

/* ---------- KPI ---------- */
function kpiCard(k) {
  return `<div class="stat kpi ${k.status}">
    <div class="kpi-top"><div class="label">${k.name}</div>${badge(k.status, STATUS_TEXT[k.status])}</div>
    <div class="value">${k.value}</div>
    <div class="hint">${k.detail}</div>
    <div class="hint"><b>${k.target}</b></div>
    <div class="formula">${k.formula}</div></div>`;
}

function renderKPI(agg) {
  const months = ui.kpiPeriod === 'ytd' ? (agg.cutoff >= 0 ? range(0, agg.cutoff) : range(0, 11)) : [Number(ui.kpiPeriod)];
  const periodName = ui.kpiPeriod === 'ytd' ? (agg.cutoff >= 0 ? `Acumulado enero–${MONTHS[agg.cutoff].toLowerCase()}` : 'Año completo (solo plan)') : MONTHS[months[0]];
  const k = computeKPIs(state, agg, months, money);
  const d = k.dist;
  const seg = (v, color, name) => v > 0 ? `<span style="width:${Math.min(100, v * 100)}%;background:${color}" title="${name}">${(v * 100).toFixed(0)}%</span>` : '';

  // Tablero mensual
  const monthly = range(0, 11).map(m => computeKPIs(state, agg, [m], money).kpis);
  const pick = (ks, n) => ks.find(x => x.name === n);
  const boardRow = name => `<tr><td>${name}</td>${monthly.map((ks, m) => {
    const x = pick(ks, name);
    return `<td>${agg.monthsWithData.has(m) ? `<span class="badge ${x.status}">${x.value}</span>` : '<span class="muted">—</span>'}</td>`;
  }).join('')}</tr>`;

  $('#view-kpi').innerHTML = `
    <div class="card-head"><h2>KPI de gestión y optimización — ${periodName}</h2>
      <label class="form-row small muted">Periodo
        <select id="kpi-period"><option value="ytd">Acumulado del año</option>${MONTHS.map((n, i) => `<option value="${i}" ${String(i) === String(ui.kpiPeriod) ? 'selected' : ''}>${n}</option>`).join('')}</select></label></div>
    <div class="grid grid-3" style="margin-bottom:18px">${k.kpis.map(kpiCard).join('')}</div>
    <div class="grid grid-2">
      <div class="card"><h3>Recomendaciones de optimización</h3>
        <ul class="reco">${k.reco.map(r => `<li class="${r.level}">${r.text}</li>`).join('')}</ul></div>
      <div class="card"><h3>Distribución de ingresos vs. regla 50/30/20</h3>
        ${d ? `<p class="small muted">Real</p><div class="stack">${seg(d.necesidad, 'var(--accent)', 'Necesidades')}${seg(d.deseo, 'var(--expense)', 'Deseos')}${seg(d.ahorro, 'var(--income)', 'Ahorro')}</div>
          <p class="small muted">Ideal</p><div class="stack">${seg(0.5, 'var(--accent)', 'Necesidades')}${seg(0.3, 'var(--expense)', 'Deseos')}${seg(0.2, 'var(--income)', 'Ahorro')}</div>
          <div class="legend"><span><i style="background:var(--accent)"></i>Necesidades ${pct(d.necesidad, 0)}</span><span><i style="background:var(--expense)"></i>Deseos ${pct(d.deseo, 0)}</span><span><i style="background:var(--income)"></i>Ahorro ${pct(d.ahorro, 0)}</span></div>`
        : '<p class="muted">Registra ingresos reales para ver la distribución.</p>'}
        <h3 style="margin-top:20px">Ejecución por mes (gasto real ÷ plan)</h3>
        ${barChart([{ name: 'Ejecución %', color: 'var(--accent)', values: range(0, 11).map(m => agg.monthsWithData.has(m) && agg.P.gasto[m] ? agg.R.gasto[m] / agg.P.gasto[m] * 100 : 0) }], MONTHS_SHORT, { height: 200, format: v => v.toFixed(1) + ' %' })}
      </div>
    </div>
    <div class="card"><h3>Control por categoría — semáforo</h3>
      <div class="table-wrap"><table><thead><tr><th>Categoría</th><th class="left">Tipo</th><th>Plan</th><th>Real</th><th>Diferencia</th><th>Ejecución</th><th style="min-width:140px"></th><th>Estado</th></tr></thead><tbody>
      ${k.cats.sort((a, b) => (b.exec === Infinity ? 1e9 : b.exec || 0) - (a.exec === Infinity ? 1e9 : a.exec || 0)).map(x => `<tr>
        <td>${esc(x.cat.name)}</td><td class="left">${x.cat.type === 'ahorro' ? 'Ahorro' : GROUPS[x.cat.group]}</td><td>${money(x.plan)}</td><td>${money(x.real)}</td>
        <td class="${(x.cat.type === 'ahorro' ? x.diff >= 0 : x.diff <= 0) ? 'pos' : 'neg'}">${money(x.diff)}</td>
        <td>${x.exec == null ? '—' : x.exec === Infinity ? 'Sin plan' : (x.exec * 100).toFixed(0) + ' %'}</td>
        <td><div class="bar" style="margin:0"><span style="width:${Math.min(100, (x.exec === Infinity ? 1 : x.exec || 0) * 100)}%;background:${colorOf(x.status)}"></span></div></td>
        <td>${badge(x.status, STATUS_TEXT[x.status])}</td></tr>`).join('')}
      </tbody></table></div></div>
    <div class="card"><h3>Tablero mensual de KPI</h3>
      <div class="table-wrap"><table><thead><tr><th>Indicador</th>${MONTHS_SHORT.map(m => `<th>${m}</th>`).join('')}</tr></thead><tbody>
        ${['Ejecución del presupuesto de gastos', 'Cumplimiento de ingresos', 'Tasa de ahorro real', 'Cumplimiento del ahorro programado', 'Gasto discrecional (deseos)', 'Peso de gastos fijos', 'Precisión de la planificación'].map(boardRow).join('')}
      </tbody></table></div></div>`;
}

/* ---------- Configuración ---------- */
function renderConfig() {
  const s = state.settings;
  const currencies = ['USD', 'EUR', 'COP', 'MXN', 'CLP', 'ARS', 'PEN', 'BOB', 'UYU', 'PYG', 'GTQ', 'CRC', 'DOP', 'VES', 'BRL'];
  $('#view-config').innerHTML = `
    <div class="card"><h2>Parámetros</h2>
      <div class="form-row">
        <label class="field">Moneda<select data-setting="currency">${currencies.map(c => `<option ${c === s.currency ? 'selected' : ''}>${c}</option>`).join('')}</select></label>
        <label class="field">Meta de tasa de ahorro (%)<input type="number" min="0" max="100" data-setting="savingsGoal" value="${s.savingsGoal}"></label>
        <label class="field">Tolerancia de desviación (%)<input type="number" min="0" max="50" data-setting="tolerance" value="${s.tolerance}"></label>
        <label class="field">Saldo inicial fondo de emergencia<input type="number" min="0" step="any" data-setting="emergencyFund" value="${s.emergencyFund}"></label>
      </div></div>
    <div class="card"><div class="card-head"><h2>Categorías</h2><button class="btn primary" data-action="add-cat">+ Nueva categoría</button></div>
      <p class="small muted" style="margin-top:0">El tipo y la clasificación (necesidad/deseo, fijo/variable) alimentan los KPI. Una categoría de ahorro cuyo nombre contenga "emergencia" se usa para la cobertura del fondo de emergencia.</p>
      <div class="table-wrap"><table><thead><tr><th>Nombre</th><th class="left">Tipo</th><th class="left">Clasificación</th><th class="left">Fijo</th><th></th></tr></thead><tbody>
      ${state.categories.map(c => `<tr>
        <td><input type="text" data-catfield="name" data-id="${c.id}" value="${esc(c.name)}" style="min-width:240px"></td>
        <td class="left"><select data-catfield="type" data-id="${c.id}">${Object.entries(TYPES).map(([k, v]) => `<option value="${k}" ${k === c.type ? 'selected' : ''}>${v}</option>`).join('')}</select></td>
        <td class="left">${c.type === 'gasto' ? `<select data-catfield="group" data-id="${c.id}">${Object.entries(GROUPS).map(([k, v]) => `<option value="${k}" ${k === c.group ? 'selected' : ''}>${v}</option>`).join('')}</select>` : '<span class="muted">—</span>'}</td>
        <td class="left"><input type="checkbox" data-catfield="fixed" data-id="${c.id}" ${c.fixed ? 'checked' : ''}></td>
        <td><button class="btn sm danger" data-action="del-cat" data-id="${c.id}">Eliminar</button></td></tr>`).join('')}
      </tbody></table></div></div>
    <div class="card"><h2>Datos</h2>
      <p class="small muted" style="margin-top:0">Los datos se guardan en este navegador. Exporta una copia de respaldo con regularidad.</p>
      <div class="btn-row">
        <button class="btn" data-action="export-json">Exportar respaldo (JSON)</button>
        <label class="btn">Importar respaldo<input type="file" id="import-file" accept=".json,application/json" hidden></label>
        <button class="btn" data-action="export-csv">Exportar movimientos (CSV)</button>
        <button class="btn" data-action="export-plan-csv">Exportar plan (CSV)</button>
        <button class="btn" data-action="load-example">Cargar datos de ejemplo</button>
        <button class="btn danger" data-action="reset">Borrar todo</button>
      </div></div>`;
}

/* ---------- Acciones ---------- */
function csvCell(v) { const s = String(v); return /[",;\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }

const actions = {
  async 'load-example'() {
    if (!state.isExample && state.transactions.length && !await askDialog({ title: 'Cargar datos de ejemplo', body: 'Tus datos actuales se reemplazarán por datos de ejemplo. Exporta un respaldo antes si quieres conservarlos.', ok: 'Reemplazar', danger: true })) return;
    state = Object.assign(exampleState(), { isExample: true }); persist(); render(); toast('Datos de ejemplo cargados');
  },
  async 'start-own'() {
    if (!await askDialog({ title: 'Empezar mi presupuesto', body: 'Se borran los montos y movimientos de ejemplo. Las categorías quedan listas para que pongas tus cifras.', ok: 'Empezar' })) return;
    state = emptyState(); persist(); ui.view = 'plan'; $('#tabs button[data-view="plan"]').click(); toast('Listo: programa tu presupuesto mes a mes');
  },
  async reset() {
    if (!await askDialog({ title: 'Borrar todo', body: 'Se eliminan el presupuesto, los movimientos y las categorías personalizadas. No se puede deshacer.', ok: 'Borrar todo', danger: true })) return;
    state = emptyState(); persist(); render(); toast('Datos borrados');
  },
  'del-tx'(el) {
    state.transactions = state.transactions.filter(t => t.id !== el.dataset.id); persist(); render();
  },
  'close-modal'() { ui.modalMonth = null; $('#modal').classList.add('hidden'); render(); },
  'repeat-row'(el) {
    const p = state.plan[el.dataset.cat]; p.fill(p[0]); persist(); render();
  },
  async 'copy-jan'() {
    if (!await askDialog({ title: 'Copiar enero a todo el año', body: 'Los montos de enero de cada categoría reemplazan los de febrero a diciembre.', ok: 'Copiar' })) return;
    state.categories.forEach(c => state.plan[c.id].fill(state.plan[c.id][0])); persist(); render(); toast('Plan de enero replicado');
  },
  async increase() {
    const r = await askDialog({ title: 'Aplicar incremento %', ok: 'Aplicar', fields: `<div class="form-row">
      <label class="field">Porcentaje (ej. 5 o -3)<input id="inc-pct" name="pct" type="number" step="any" value="5" required></label>
      <label class="field">Desde el mes<select id="inc-from" name="from">${MONTHS.map((n, i) => `<option value="${i + 1}">${n}</option>`).join('')}</select></label>
      <label class="field">Aplicar a<select id="inc-scope" name="scope"><option value="gasto">Solo gastos</option><option value="all">Todas las categorías</option></select></label></div>` });
    if (!r) return;
    const pctV = Number(String(r.pct).replace(',', '.')), from = Number(r.from), scope = r.scope === 'gasto';
    if (!isFinite(pctV)) return toast('Escribe un porcentaje válido');
    state.categories.filter(c => !scope || c.type === 'gasto').forEach(c => {
      for (let m = from - 1; m < 12; m++) state.plan[c.id][m] = Math.round(state.plan[c.id][m] * (1 + pctV / 100) * 100) / 100;
    });
    persist(); render(); toast(`Incremento de ${pctV} % aplicado desde ${MONTHS[from - 1]}`);
  },
  async 'fit-real'() {
    const agg = aggregate(state);
    const data = [...agg.monthsWithData];
    if (!data.length) return;
    if (!await askDialog({ title: 'Ajustar al promedio real', body: `El plan de ${MONTHS[agg.cutoff + 1].toLowerCase()} a diciembre de los gastos variables se reemplaza por su promedio real.`, ok: 'Ajustar' })) return;
    state.categories.filter(c => c.type === 'gasto' && !c.fixed).forEach(c => {
      const avg = Math.round(sumOver(agg.realByCat[c.id], data) / data.length);
      for (let m = agg.cutoff + 1; m < 12; m++) state.plan[c.id][m] = avg;
    });
    persist(); render(); toast('Plan ajustado al promedio real');
  },
  'add-cat'() {
    const c = { id: uid(), name: 'Nueva categoría', type: 'gasto', group: 'necesidad', fixed: false };
    state.categories.push(c); state.plan[c.id] = zeros(); persist(); render();
  },
  async 'del-cat'(el) {
    const c = catById(el.dataset.id);
    const n = state.transactions.filter(t => t.catId === c.id).length;
    if (!await askDialog({ title: 'Eliminar categoría', body: `Se elimina "${esc(c.name)}"${n ? ` y sus ${n} movimientos` : ''}.`, ok: 'Eliminar', danger: true })) return;
    state.categories = state.categories.filter(x => x.id !== c.id);
    delete state.plan[c.id];
    state.transactions = state.transactions.filter(t => t.catId !== c.id);
    persist(); render();
  },
  'export-json'() { download('presupuesto-2027.json', JSON.stringify(state, null, 2), 'application/json'); },
  'export-csv'() {
    const lines = [['Fecha', 'Mes', 'Categoría', 'Tipo', 'Descripción', 'Monto'].join(';')];
    state.transactions.slice().sort((a, b) => a.date.localeCompare(b.date)).forEach(t => {
      const c = catById(t.catId);
      lines.push([t.date, MONTHS[monthOf(t.date)], c.name, TYPES[c.type], t.note, t.amount].map(csvCell).join(';'));
    });
    download('movimientos-2027.csv', '﻿' + lines.join('\n'), 'text/csv');
  },
  'export-plan-csv'() {
    const lines = [['Categoría', 'Tipo', ...MONTHS, 'Total'].join(';')];
    state.categories.forEach(c => lines.push([c.name, TYPES[c.type], ...state.plan[c.id], state.plan[c.id].reduce((a, b) => a + b, 0)].map(csvCell).join(';')));
    download('plan-2027.csv', '﻿' + lines.join('\n'), 'text/csv');
  },
};

document.addEventListener('click', e => {
  const goto = e.target.closest('[data-goto]');
  if (goto) { $(`#tabs button[data-view="${goto.dataset.goto}"]`).click(); return; }
  const a = e.target.closest('[data-action]');
  if (a && actions[a.dataset.action]) { e.preventDefault(); actions[a.dataset.action](a); return; }
  const mc = e.target.closest('.month-card');
  if (mc) { ui.modalMonth = Number(mc.dataset.month); render(); return; }
  if (e.target.id === 'modal') actions['close-modal']();
});
document.addEventListener('keydown', e => { if (e.key === 'Escape' && ui.modalMonth != null) actions['close-modal'](); });

document.addEventListener('submit', e => {
  const f = e.target.closest('.tx-form');
  if (!f) return;
  e.preventDefault();
  const fd = new FormData(f);
  const date = fd.get('date'), amount = Number(fd.get('amount'));
  if (!/^2027-\d{2}-\d{2}$/.test(date)) return toast('La fecha debe estar dentro de 2027');
  if (!(amount > 0)) return toast('Ingresa un monto mayor que cero');
  const catId = fd.get('catId');
  state.transactions.push({ id: uid(), date, catId, amount, note: String(fd.get('note') || '').trim() || catById(catId).name });
  persist(); render();
  toast('Movimiento registrado');
  const nf = document.querySelector(`.tx-form[data-prefix="${f.dataset.prefix}"]`);
  if (nf) { nf.date.value = date; nf.catId.value = catId; nf.amount.focus(); }
});

document.addEventListener('change', e => {
  const t = e.target;
  if (t.matches('[data-cat][data-m]')) {
    state.plan[t.dataset.cat][Number(t.dataset.m)] = Math.max(0, Number(t.value) || 0);
    persist(); refreshPlanTotals(); return;
  }
  if (t.id === 'f-month') { ui.movMonth = t.value; render(); return; }
  if (t.id === 'f-cat') { ui.movCat = t.value; render(); return; }
  if (t.id === 'kpi-period') { ui.kpiPeriod = t.value; render(); return; }
  if (t.dataset.setting) {
    const k = t.dataset.setting;
    state.settings[k] = k === 'currency' ? t.value : Math.max(0, Number(t.value) || 0);
    persist(); render(); return;
  }
  if (t.dataset.catfield) {
    const c = catById(t.dataset.id), f = t.dataset.catfield;
    if (f === 'fixed') c.fixed = t.checked;
    else if (f === 'name') c.name = t.value.trim() || c.name;
    else if (f === 'type') { c.type = t.value; c.group = c.type === 'gasto' ? (c.group || 'necesidad') : ''; }
    else c[f] = t.value;
    persist(); render(); return;
  }
  if (t.id === 'import-file' && t.files[0]) {
    const reader = new FileReader();
    reader.onload = () => {
      try { state = normalizeState(JSON.parse(reader.result)); persist(); render(); toast('Respaldo importado'); }
      catch (err) { toast('El archivo no es un respaldo válido'); }
    };
    reader.readAsText(t.files[0]);
  }
});

render();
Cloud.start({
  onRemote(remote) { state = remote; render(); },
  localState: () => state,
  onStatus: setSyncStatus,
});
