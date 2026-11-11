/* Gráficos SVG sin dependencias externas */
'use strict';

function niceMax(v) {
  if (v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
}

function shortNum(v) {
  const a = Math.abs(v);
  if (a >= 1e9) return (v / 1e9).toFixed(1).replace(/\.0$/, '') + 'B';
  if (a >= 1e6) return (v / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
  if (a >= 1e3) return (v / 1e3).toFixed(1).replace(/\.0$/, '') + 'k';
  return String(Math.round(v));
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}

function legendHtml(series) {
  return `<div class="legend">${series.map(s => `<span><i style="background:${s.color}"></i>${esc(s.name)}</span>`).join('')}</div>`;
}

/** Barras agrupadas. series: [{name,color,values[]}] */
function barChart(series, labels, opts = {}) {
  const W = 760, H = opts.height || 260, padL = 48, padR = 10, padT = 12, padB = 26;
  const fmt = opts.format || (v => v);
  const all = series.flatMap(s => s.values);
  const maxV = niceMax(Math.max(0, ...all));
  const minV = Math.min(0, ...all) < 0 ? -niceMax(-Math.min(...all)) : 0;
  const y = v => padT + (H - padT - padB) * (maxV - v) / (maxV - minV);
  const groupW = (W - padL - padR) / labels.length;
  const barW = Math.min(22, (groupW * 0.75) / series.length);
  let svg = `<svg viewBox="0 0 ${W} ${H}" role="img">`;
  for (let i = 0; i <= 4; i++) {
    const v = minV + (maxV - minV) * i / 4, yy = y(v);
    svg += `<line class="grid-line" x1="${padL}" x2="${W - padR}" y1="${yy}" y2="${yy}"/><text x="${padL - 6}" y="${yy + 4}" text-anchor="end">${shortNum(v)}</text>`;
  }
  labels.forEach((lab, i) => {
    const gx = padL + groupW * i + (groupW - barW * series.length) / 2;
    series.forEach((s, k) => {
      const v = s.values[i] || 0, y0 = y(0), y1 = y(v);
      const top = Math.min(y0, y1), h = Math.max(1, Math.abs(y0 - y1));
      svg += `<rect x="${gx + k * barW}" y="${top}" width="${barW - 2}" height="${h}" rx="3" fill="${s.color}"><title>${esc(s.name)} · ${esc(lab)}: ${esc(fmt(v))}</title></rect>`;
    });
    svg += `<text x="${padL + groupW * i + groupW / 2}" y="${H - 8}" text-anchor="middle">${esc(lab)}</text>`;
  });
  svg += '</svg>';
  return `<div class="chart">${svg}${legendHtml(series)}</div>`;
}

/** Líneas. series: [{name,color,values[], dashed}] ; valores null se omiten */
function lineChart(series, labels, opts = {}) {
  const W = 760, H = opts.height || 260, padL = 52, padR = 12, padT = 12, padB = 26;
  const fmt = opts.format || (v => v);
  const all = series.flatMap(s => s.values.filter(v => v != null));
  const maxV = niceMax(Math.max(0, ...all));
  const minV = Math.min(0, ...all) < 0 ? -niceMax(-Math.min(...all)) : 0;
  const y = v => padT + (H - padT - padB) * (maxV - v) / (maxV - minV);
  const x = i => padL + (W - padL - padR) * (i + 0.5) / labels.length;
  let svg = `<svg viewBox="0 0 ${W} ${H}" role="img">`;
  for (let i = 0; i <= 4; i++) {
    const v = minV + (maxV - minV) * i / 4, yy = y(v);
    svg += `<line class="grid-line" x1="${padL}" x2="${W - padR}" y1="${yy}" y2="${yy}"/><text x="${padL - 6}" y="${yy + 4}" text-anchor="end">${shortNum(v)}</text>`;
  }
  labels.forEach((lab, i) => { svg += `<text x="${x(i)}" y="${H - 8}" text-anchor="middle">${esc(lab)}</text>`; });
  series.forEach(s => {
    const pts = s.values.map((v, i) => v == null ? null : [x(i), y(v), v, i]).filter(Boolean);
    if (!pts.length) return;
    svg += `<polyline fill="none" stroke="${s.color}" stroke-width="2.5" ${s.dashed ? 'stroke-dasharray="6 5"' : ''} points="${pts.map(p => p[0] + ',' + p[1]).join(' ')}"/>`;
    pts.forEach(p => { svg += `<circle cx="${p[0]}" cy="${p[1]}" r="3.5" fill="${s.color}"><title>${esc(s.name)} · ${esc(labels[p[3]])}: ${esc(fmt(p[2]))}</title></circle>`; });
  });
  svg += '</svg>';
  return `<div class="chart">${svg}${legendHtml(series)}</div>`;
}
