/* Cálculo de KPI de gestión y recomendaciones de optimización */
'use strict';

const pct = (v, d = 1) => (v == null || !isFinite(v)) ? '—' : (v * 100).toFixed(d).replace('.', ',') + ' %';
const ratio = (a, b) => b ? a / b : null;

/**
 * @param state  estado completo
 * @param agg    resultado de aggregate()
 * @param months meses (índices 0-11) del periodo analizado
 * @param money  formateador de moneda
 */
function computeKPIs(state, agg, months, money) {
  const { P, R, realByCat, monthsWithData } = agg;
  const st = state.settings;
  const tol = (Number(st.tolerance) || 0) / 100;
  const goal = (Number(st.savingsGoal) || 0) / 100;
  const s = (B, k) => sumOver(B[k], months);

  const ingP = s(P, 'ingreso'), ingR = s(R, 'ingreso');
  const gasP = s(P, 'gasto'), gasR = s(R, 'gasto');
  const ahoP = s(P, 'ahorro'), ahoR = s(R, 'ahorro');
  const fijR = s(R, 'fijo'), desR = s(R, 'deseo'), necR = s(R, 'necesidad');
  const dataMonths = months.filter(m => monthsWithData.has(m));

  const kpis = [];
  const add = (k) => kpis.push(k);
  const lvl = (good, warn) => good ? 'good' : warn ? 'warn' : 'bad';

  // 1. Cumplimiento de ingresos
  const cIng = ratio(ingR, ingP);
  add({ name: 'Cumplimiento de ingresos', value: pct(cIng), status: cIng == null ? 'none' : lvl(cIng >= 1 - tol, cIng >= 0.9),
    target: `Meta ≥ ${pct(1 - tol, 0)}`, detail: `${money(ingR)} reales de ${money(ingP)} planificados`,
    formula: 'Ingresos reales ÷ ingresos planificados' });

  // 2. Ejecución presupuestaria de gastos
  const eGas = ratio(gasR, gasP);
  add({ name: 'Ejecución del presupuesto de gastos', value: pct(eGas), status: eGas == null ? 'none' : lvl(eGas <= 1, eGas <= 1 + tol),
    target: `Meta ≤ 100 % (tolerancia ${pct(tol, 0)})`, detail: `${money(gasR)} gastados de ${money(gasP)} presupuestados`,
    formula: 'Gastos reales ÷ gastos presupuestados' });

  // 3. Desviación de gastos
  const dev = gasR - gasP;
  add({ name: 'Desviación de gastos', value: money(dev), status: gasP ? lvl(dev <= 0, dev <= gasP * tol) : 'none',
    target: 'Meta ≤ 0 (sin sobregasto)', detail: dev > 0 ? `Sobregasto de ${pct(ratio(dev, gasP))}` : `Ahorro frente al plan de ${pct(ratio(-dev, gasP))}`,
    formula: 'Gastos reales − gastos presupuestados' });

  // 4. Tasa de ahorro
  const tAho = ratio(ingR - gasR, ingR);
  add({ name: 'Tasa de ahorro real', value: pct(tAho), status: tAho == null ? 'none' : lvl(tAho >= goal, tAho >= goal / 2),
    target: `Meta ≥ ${pct(goal, 0)}`, detail: `${money(ingR - gasR)} no consumidos de ${money(ingR)} de ingresos`,
    formula: '(Ingresos − gastos) ÷ ingresos' });

  // 5. Cumplimiento del ahorro programado
  const cAho = ratio(ahoR, ahoP);
  add({ name: 'Cumplimiento del ahorro programado', value: pct(cAho), status: cAho == null ? 'none' : lvl(cAho >= 1, cAho >= 0.75),
    target: 'Meta ≥ 100 %', detail: `${money(ahoR)} aportados de ${money(ahoP)} programados`,
    formula: 'Aportes reales a ahorro/inversión ÷ aportes programados' });

  // 6. Peso de gastos fijos
  const rFij = ratio(fijR, ingR);
  add({ name: 'Peso de gastos fijos', value: pct(rFij), status: rFij == null ? 'none' : lvl(rFij <= 0.5, rFij <= 0.6),
    target: 'Meta ≤ 50 % de los ingresos', detail: `${money(fijR)} en compromisos fijos`,
    formula: 'Gastos fijos reales ÷ ingresos reales' });

  // 7. Gasto discrecional
  const rDes = ratio(desR, ingR);
  add({ name: 'Gasto discrecional (deseos)', value: pct(rDes), status: rDes == null ? 'none' : lvl(rDes <= 0.3, rDes <= 0.35),
    target: 'Meta ≤ 30 % (regla 50/30/20)', detail: `${money(desR)} en gastos no esenciales`,
    formula: 'Gastos clasificados como "deseo" ÷ ingresos reales' });

  // 8. Meses dentro del presupuesto
  const inBudget = dataMonths.filter(m => R.gasto[m] <= P.gasto[m] * (1 + tol)).length;
  const rMeses = dataMonths.length ? inBudget / dataMonths.length : null;
  add({ name: 'Meses dentro del presupuesto', value: dataMonths.length ? `${inBudget} / ${dataMonths.length}` : '—',
    status: rMeses == null ? 'none' : lvl(rMeses >= 0.8, rMeses >= 0.5),
    target: 'Meta ≥ 80 % de los meses', detail: dataMonths.length ? `${pct(rMeses, 0)} de los meses con registros` : 'Sin registros en el periodo',
    formula: 'Meses con gasto real ≤ presupuesto (+ tolerancia) ÷ meses con registros' });

  // 9. Precisión de la planificación (1 − MAPE por categoría de gasto)
  const errs = [];
  state.categories.filter(c => c.type === 'gasto').forEach(c => {
    dataMonths.forEach(m => {
      const p = state.plan[c.id][m];
      if (p > 0) errs.push(Math.abs(realByCat[c.id][m] - p) / p);
    });
  });
  const prec = errs.length ? Math.max(0, 1 - errs.reduce((a, b) => a + b, 0) / errs.length) : null;
  add({ name: 'Precisión de la planificación', value: pct(prec), status: prec == null ? 'none' : lvl(prec >= 0.85, prec >= 0.7),
    target: 'Meta ≥ 85 %', detail: 'Qué tan cerca estuvo lo real de lo planeado por categoría',
    formula: '1 − error porcentual absoluto medio (categoría × mes)' });

  // 10. Cobertura del fondo de emergencia
  const avgGas = dataMonths.length ? sumOver(R.gasto, dataMonths) / dataMonths.length : (gasP / Math.max(1, months.length));
  const fund = (Number(st.emergencyFund) || 0) + sumOver(emergencySeries(state, realByCat), range(0, Math.max(...months)));
  const cob = avgGas ? fund / avgGas : null;
  add({ name: 'Cobertura del fondo de emergencia', value: cob == null ? '—' : cob.toFixed(1).replace('.', ',') + ' meses',
    status: cob == null ? 'none' : lvl(cob >= 6, cob >= 3), target: 'Meta ≥ 6 meses de gastos',
    detail: `Fondo estimado ${money(fund)} · gasto medio ${money(avgGas)}/mes`,
    formula: '(Saldo inicial + aportes a "Fondo de emergencia") ÷ gasto mensual promedio' });

  // 11. Variación mensual del gasto
  const lastM = dataMonths.length ? dataMonths[dataMonths.length - 1] : months[months.length - 1];
  const prevM = lastM - 1;
  const mom = prevM >= 0 && R.gasto[prevM] ? (R.gasto[lastM] - R.gasto[prevM]) / R.gasto[prevM] : null;
  add({ name: 'Variación mensual del gasto', value: mom == null ? '—' : (mom >= 0.0005 ? '+' : '') + pct(Math.abs(mom) < 0.0005 ? 0 : mom),
    status: mom == null ? 'none' : lvl(mom <= 0.05, mom <= 0.15), target: 'Meta ≤ +5 % vs. mes anterior',
    detail: mom == null ? 'Se necesita el mes anterior con registros' : `${MONTHS[lastM]} vs. ${MONTHS[prevM]}`,
    formula: '(Gasto del mes − gasto del mes anterior) ÷ gasto del mes anterior' });

  // 12. Proyección de cierre anual
  const cutoff = agg.cutoff;
  const realYTD = cutoff >= 0 ? sumOver(R.balance, range(0, cutoff)) : 0;
  const planRest = sumOver(P.balance, range(cutoff + 1, 11));
  const proj = realYTD + planRest;
  const planYear = sumOver(P.balance, range(0, 11));
  add({ name: 'Proyección de saldo al cierre 2027', value: money(proj), status: lvl(proj >= planYear, proj >= 0),
    target: `Plan anual: ${money(planYear)}`, detail: cutoff >= 0 ? `Real Ene–${MONTHS_SHORT[cutoff]} + plan ${cutoff < 11 ? MONTHS_SHORT[cutoff + 1] + '–Dic' : '(año completo)'}` : 'Basado solo en el plan',
    formula: 'Saldo libre real acumulado + saldo libre planificado de los meses restantes' });

  /* ----- Análisis por categoría ----- */
  const cats = state.categories.filter(c => c.type !== 'ingreso').map(c => {
    const p = sumOver(state.plan[c.id], months), r = sumOver(realByCat[c.id], months);
    const e = p ? r / p : (r ? Infinity : null);
    const status = e == null ? 'none' : c.type === 'ahorro' ? lvl(e >= 1, e >= 0.75) : lvl(e <= 1, e <= 1 + tol);
    return { cat: c, plan: p, real: r, diff: r - p, exec: e, status };
  });

  /* ----- Distribución 50/30/20 ----- */
  const dist = ingR > 0 ? { necesidad: necR / ingR, deseo: desR / ingR, ahorro: Math.max(0, (ingR - gasR) / ingR) } : null;

  /* ----- Recomendaciones de optimización ----- */
  const reco = [];
  const gastos = cats.filter(x => x.cat.type === 'gasto');
  gastos.filter(x => x.status === 'bad' && x.diff > 0).sort((a, b) => b.diff - a.diff).slice(0, 4).forEach(x => {
    reco.push({ level: 'bad', text: `<b>${esc(x.cat.name)}</b> supera su presupuesto en ${money(x.diff)} (${pct(x.exec, 0)} ejecutado). Revisa este rubro o ajusta su plan para los próximos meses.` });
  });
  gastos.filter(x => x.plan > 0 && x.exec != null && x.exec < 0.7 && dataMonths.length).forEach(x => {
    reco.push({ level: 'good', text: `<b>${esc(x.cat.name)}</b> solo usó ${pct(x.exec, 0)} de lo presupuestado. Puedes reasignar ${money(x.plan - x.real)} a ahorro o a rubros con déficit.` });
  });
  if (tAho != null && tAho < goal) {
    const gap = goal * ingR - (ingR - gasR);
    reco.push({ level: 'warn', text: `La tasa de ahorro (${pct(tAho)}) está por debajo de la meta (${pct(goal, 0)}). Para alcanzarla debes liberar ${money(gap)} en el periodo${dataMonths.length > 1 ? ` (≈ ${money(gap / dataMonths.length)} por mes)` : ''}.` });
  }
  if (rDes != null && rDes > 0.3) {
    reco.push({ level: 'warn', text: `Los gastos discrecionales representan ${pct(rDes)} de tus ingresos. Reducirlos un 15 % liberaría ${money(desR * 0.15)}.` });
  } else if (desR > 0) {
    reco.push({ level: 'good', text: `Escenario de optimización: recortar un 10 % los gastos discrecionales aportaría ${money(desR * 0.1)} adicionales al ahorro en este periodo.` });
  }
  if (rFij != null && rFij > 0.5) {
    reco.push({ level: 'warn', text: `Los gastos fijos consumen ${pct(rFij)} de los ingresos. Renegociar servicios, seguros o créditos da flexibilidad al presupuesto.` });
  }
  if (cob != null && cob < 6) {
    const need = 6 * avgGas - fund;
    reco.push({ level: cob < 3 ? 'bad' : 'warn', text: `El fondo de emergencia cubre ${cob.toFixed(1).replace('.', ',')} meses. Faltan ${money(need)} para llegar a 6 meses${cutoff < 11 ? ` (≈ ${money(need / (11 - cutoff || 1))} por mes en lo que resta del año)` : ''}.` });
  }
  if (cAho != null && cAho < 1) {
    reco.push({ level: 'warn', text: `Solo se cumplió ${pct(cAho, 0)} del ahorro programado. Automatiza la transferencia al inicio de cada mes ("págate primero").` });
  }
  if (prec != null && prec < 0.7) {
    reco.push({ level: 'warn', text: `La precisión del plan es baja (${pct(prec, 0)}). Ajusta el presupuesto de los próximos meses usando el promedio real de cada categoría (botón "Ajustar al promedio real" en Planificación).` });
  }
  if (proj < 0) {
    reco.push({ level: 'bad', text: `Al ritmo actual el año cerraría con un saldo negativo de ${money(proj)}. Prioriza recortes en las categorías marcadas en rojo.` });
  }
  if (!reco.length) reco.push({ level: 'good', text: 'Excelente gestión: todos los indicadores están dentro de las metas. Considera aumentar tu meta de ahorro o inversión.' });

  return { kpis, cats, dist, reco, totals: { ingP, ingR, gasP, gasR, ahoP, ahoR } };
}

function emergencySeries(state, realByCat) {
  const c = state.categories.find(x => x.type === 'ahorro' && /emergencia/i.test(x.name));
  return c ? realByCat[c.id] : zeros();
}
