// Hand-written SVG charts in the site's colours. Columns (stacked or single), lines and sparklines.
// Thin marks, 4px rounded data ends, 2px gaps between stacked segments, hairline grid, a legend for
// two or more series, and a tooltip on hover and keyboard focus. Every chart sits next to a table view.
import { h, s, fmt } from './ui.js';

export const SERIES = ['var(--s1)', 'var(--s2)', 'var(--s3)', 'var(--s4)', 'var(--s5)', 'var(--s6)', 'var(--s7)', 'var(--s8)'];
export const OTHER = 'var(--s-other)';

// A round step (1, 2, 5 × 10ⁿ; never below 1 for counts) and the axis top it gives, about four ticks.
function scale(v) {
  const raw = Math.max(v, 1) / 4;
  const p = 10 ** Math.floor(Math.log10(raw));
  const step = Math.max(1, [1, 2, 5, 10].map((m) => m * p).find((x) => x >= raw));
  return { step, max: Math.max(step, Math.ceil(v / step) * step) };
}
function niceMax(v) { return scale(v).max; }
function ticks(max) {
  const { step } = scale(max);
  const out = [];
  for (let t = 0; t <= max + 1e-9; t += step) out.push(t);
  return out;
}

// Draws on the container's real width and redraws when it changes.
function responsive(wrap, draw) {
  let last = 0;
  const go = () => {
    const w = Math.round(wrap.clientWidth);
    if (!w || w === last) return;
    last = w;
    draw(w);
  };
  const ro = new ResizeObserver(go);
  ro.observe(wrap);
  requestAnimationFrame(go);
}

function tooltip(wrap) {
  const tip = h('div', { class: 'chart-tip', role: 'presentation', hidden: true });
  wrap.append(tip);
  return {
    show(x, y, title, rows) {
      tip.replaceChildren(h('div', { class: 't' }, title), ...rows.map((r) => h('div', { class: 'r' },
        h('i', { style: { background: r.color || 'var(--ink)' } }), h('span', null, r.label), h('b', null, r.value))));
      tip.hidden = false;
      const max = wrap.clientWidth;
      const half = Math.min(120, tip.offsetWidth / 2);
      tip.style.left = `${Math.max(half, Math.min(max - half, x))}px`;
      tip.style.top = `${y}px`;
    },
    hide() { tip.hidden = true; },
  };
}

export function legend(series, kind = 'rect') {
  if (series.length < 2) return null;
  return h('div', { class: 'legend' }, series.map((x) => h('span', null, h('i', { class: kind === 'line' ? 'line' : null, style: { background: x.color } }), x.label)));
}

// Columns over a category axis. series: [{ label, color, values: [] }]. Stacked when there are several.
export function columns({ labels, series, height = 210, unit = '', tipTitle = (l) => l, xLabel = (l) => l }) {
  const wrap = h('div', { class: 'chart' });
  const tip = tooltip(wrap);
  const n = labels.length;
  const totals = labels.map((_, i) => series.reduce((a, x) => a + (x.values[i] || 0), 0));
  const max = niceMax(Math.max(...totals, 0));
  responsive(wrap, (W) => {
    const m = { l: 38, r: 6, t: 10, b: 24 };
    const pw = W - m.l - m.r, ph = height - m.t - m.b;
    const y = (v) => m.t + ph - (v / max) * ph;
    const band = pw / Math.max(n, 1);
    const bw = Math.max(3, Math.min(24, band * 0.62));
    const svg = s('svg', { viewBox: `0 0 ${W} ${height}`, width: W, height, role: 'img', 'aria-label': `Column chart, ${n} periods` });
    const grid = s('g', { class: 'gridlines' });
    for (const t of ticks(max)) {
      grid.append(s('line', { x1: m.l, x2: W - m.r, y1: y(t), y2: y(t) }));
      svg.append(s('text', { x: m.l - 6, y: y(t) + 3.5, 'text-anchor': 'end' }, fmt(t)));
    }
    svg.prepend(grid);
    const every = Math.max(1, Math.ceil(48 / band));
    const hover = s('rect', { class: 'col-hover', x: 0, y: m.t, width: 0, height: ph, rx: 4, visibility: 'hidden' });
    svg.append(hover);
    labels.forEach((lab, i) => {
      const cx = m.l + band * i + band / 2;
      let base = y(0);
      const visible = series.filter((x) => (x.values[i] || 0) > 0);
      visible.forEach((x, k) => {
        const v = x.values[i];
        const top = y(0) - ((y(0) - y(v)) || 0);
        const hgt = (y(0) - top);
        const gap = k > 0 ? 2 : 0;
        const segTop = base - hgt;
        const hh = Math.max(0, hgt - gap);
        if (hh <= 0) { base -= hgt; return; }
        const isTop = k === visible.length - 1;
        svg.append(isTop ? s('path', { d: roundTop(cx - bw / 2, segTop, bw, hh, Math.min(4, hh, bw / 2)), style: { fill: x.color } })
          : s('rect', { x: cx - bw / 2, y: segTop, width: bw, height: hh, style: { fill: x.color } }));
        base -= hgt;
      });
      if (i % every === 0 || i === n - 1) {
        svg.append(s('text', { x: cx, y: height - 6, 'text-anchor': 'middle' }, xLabel(lab)));
      }
      const hit = s('rect', { class: 'hit', x: m.l + band * i, y: m.t, width: band, height: ph, tabindex: 0, 'aria-label': `${tipTitle(lab)}: ${fmt(totals[i])}${unit ? ` ${unit}` : ''}` });
      const show = () => {
        hover.setAttribute('x', m.l + band * i + 1); hover.setAttribute('width', Math.max(0, band - 2)); hover.setAttribute('visibility', 'visible');
        const rows = [...series].reverse().filter((x) => x.values[i]).map((x) => ({ label: x.label, value: fmt(x.values[i]), color: x.color }));
        if (series.length > 1) rows.push({ label: 'Total', value: fmt(totals[i]), color: 'transparent' });
        if (!rows.length) rows.push({ label: 'Nothing logged', value: '0', color: 'transparent' });
        tip.show(cx, y(totals[i]) , tipTitle(lab), rows);
      };
      const hide = () => { hover.setAttribute('visibility', 'hidden'); tip.hide(); };
      hit.addEventListener('pointerenter', show); hit.addEventListener('pointermove', show); hit.addEventListener('pointerleave', hide);
      hit.addEventListener('focus', show); hit.addEventListener('blur', hide);
      svg.append(hit);
    });
    svg.append(s('line', { class: 'base', x1: m.l, x2: W - m.r, y1: y(0), y2: y(0) }));
    wrap.querySelector('svg')?.remove();
    wrap.prepend(svg);
  });
  return h('div', null, wrap, legend(series, 'rect'));
}

function roundTop(x, y, w, hgt, r) {
  return `M${x},${y + hgt}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + hgt}Z`;
}

// Lines over a category axis with a crosshair that snaps to the nearest period.
export function lines({ labels, series, height = 180, tipTitle = (l) => l, xLabel = (l) => l }) {
  const wrap = h('div', { class: 'chart' });
  const tip = tooltip(wrap);
  const n = labels.length;
  const vals = series.flatMap((x) => x.values.filter((v) => v != null));
  const max = niceMax(Math.max(...vals, 0));
  responsive(wrap, (W) => {
    const m = { l: 38, r: 10, t: 10, b: 24 };
    const pw = W - m.l - m.r, ph = height - m.t - m.b;
    const x = (i) => m.l + (n <= 1 ? pw / 2 : (pw * i) / (n - 1));
    const y = (v) => m.t + ph - (v / max) * ph;
    const svg = s('svg', { viewBox: `0 0 ${W} ${height}`, width: W, height, role: 'img', 'aria-label': `Line chart, ${n} periods` });
    const grid = s('g', { class: 'gridlines' });
    for (const t of ticks(max)) {
      grid.append(s('line', { x1: m.l, x2: W - m.r, y1: y(t), y2: y(t) }));
      svg.append(s('text', { x: m.l - 6, y: y(t) + 3.5, 'text-anchor': 'end' }, fmt(t)));
    }
    svg.prepend(grid);
    svg.append(s('line', { class: 'base', x1: m.l, x2: W - m.r, y1: y(0), y2: y(0) }));
    const every = Math.max(1, Math.ceil(56 / (pw / Math.max(n - 1, 1))));
    labels.forEach((lab, i) => { if (i % every === 0 || i === n - 1) svg.append(s('text', { x: x(i), y: height - 6, 'text-anchor': 'middle' }, xLabel(lab))); });
    for (const ser of series) {
      let d = '', pen = false, lastI = -1;
      ser.values.forEach((v, i) => {
        if (v == null) { pen = false; return; }
        d += `${pen ? 'L' : 'M'}${x(i)},${y(v)}`; pen = true; lastI = i;
      });
      if (d) svg.append(s('path', { d, fill: 'none', 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round', style: { stroke: ser.color } }));
      if (lastI >= 0) svg.append(s('circle', { cx: x(lastI), cy: y(ser.values[lastI]), r: 4, 'stroke-width': 2, style: { fill: ser.color, stroke: 'var(--panel)' } }));
    }
    const hair = s('line', { class: 'xhair', y1: m.t, y2: m.t + ph, visibility: 'hidden' });
    svg.append(hair);
    const hit = s('rect', { class: 'hit', x: m.l, y: m.t, width: pw, height: ph, tabindex: 0, 'aria-label': 'Use left and right arrows to read values' });
    let cur = n - 1;
    const show = (i) => {
      cur = Math.max(0, Math.min(n - 1, i));
      hair.setAttribute('x1', x(cur)); hair.setAttribute('x2', x(cur)); hair.setAttribute('visibility', 'visible');
      const rows = series.map((ser) => ({ label: ser.label, value: ser.values[cur] == null ? '–' : fmt(ser.values[cur]), color: ser.color }));
      const top = Math.min(...series.map((ser) => (ser.values[cur] == null ? m.t + ph : y(ser.values[cur]))));
      tip.show(x(cur), top, tipTitle(labels[cur]), rows);
    };
    const hide = () => { hair.setAttribute('visibility', 'hidden'); tip.hide(); };
    hit.addEventListener('pointermove', (e) => {
      const r = svg.getBoundingClientRect();
      const px = ((e.clientX - r.left) / r.width) * W;
      show(Math.round(((px - m.l) / pw) * (n - 1)));
    });
    hit.addEventListener('pointerleave', hide);
    hit.addEventListener('focus', () => show(cur));
    hit.addEventListener('blur', hide);
    hit.addEventListener('keydown', (e) => { if (e.key === 'ArrowLeft') { e.preventDefault(); show(cur - 1); } if (e.key === 'ArrowRight') { e.preventDefault(); show(cur + 1); } });
    svg.append(hit);
    wrap.querySelector('svg')?.remove();
    wrap.prepend(svg);
  });
  return h('div', null, wrap, legend(series, 'line'));
}

// A 12-point-ish trend for a stat tile: de-emphasis line, current point in the accent.
export function spark(values, { label = '' } = {}) {
  const pts = values.map((v, i) => [i, v]).filter(([, v]) => v != null);
  const W = 200, H = 36;
  const svg = s('svg', { class: 'spark', viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: 'none', role: 'img', 'aria-label': label || 'Trend' });
  if (pts.length < 2) return svg;
  const lo = Math.min(...pts.map((p) => p[1])), hi = Math.max(...pts.map((p) => p[1]));
  const n = values.length;
  const x = (i) => 4 + ((W - 8) * i) / Math.max(n - 1, 1);
  const y = (v) => (hi === lo ? H / 2 : H - 5 - ((v - lo) / (hi - lo)) * (H - 10));
  svg.append(s('path', { d: pts.map(([i, v], k) => `${k ? 'L' : 'M'}${x(i)},${y(v)}`).join(''), fill: 'none', 'stroke-width': 2, 'vector-effect': 'non-scaling-stroke', 'stroke-linejoin': 'round', style: { stroke: 'var(--s-other)' } }));
  const [li, lv] = pts[pts.length - 1];
  svg.append(s('circle', { cx: x(li), cy: y(lv), r: 3.5, 'vector-effect': 'non-scaling-stroke', style: { fill: 'var(--acc)' } }));
  return svg;
}

// A simple data table for a chart's table view.
export function table(head, rows, { foot, numericFrom = 1 } = {}) {
  return h('div', { class: 'tbl-wrap' }, h('table', { class: 'tbl' },
    h('thead', null, h('tr', null, head.map((c, i) => h('th', { class: i >= numericFrom ? 'r' : null }, c)))),
    h('tbody', null, rows.map((r) => h('tr', null, r.map((c, i) => h('td', { class: i >= numericFrom ? 'r' : null }, c))))),
    foot ? h('tfoot', null, h('tr', null, foot.map((c, i) => h('td', { class: i >= numericFrom ? 'r' : null }, c)))) : null));
}
