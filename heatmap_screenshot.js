#!/usr/bin/env node
/**
 * Render the campsite availability heatmap using the DKirwan calendar-heatmap
 * library and screenshot it to PNG via Playwright/Chromium.
 *
 * Usage:
 *   node heatmap_screenshot.js --input data.json --output heatmap.png
 *   echo '{}' | node heatmap_screenshot.js --output heatmap.png
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

// ── Park config (mirrors notifier.py / heatmap_generator.py) ─────────────────
const PARK_CONFIG = {
  '232448':   { color: '#e05d5d', name: 'Tuolumne Meadows' },
  '232450':   { color: '#4a90d9', name: 'Lower Pines' },
  '232447':   { color: '#43b27f', name: 'Upper Pines' },
  '232449':   { color: '#e8a838', name: 'North Pines' },
  '10004152': { color: '#222222', name: 'Camp 4' },
};

// ── Parse CLI args ────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
let inputFile = null;
let outputFile = null;
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--input')  inputFile  = args[++i];
  if (args[i] === '--output') outputFile = args[++i];
}
if (!outputFile) {
  console.error('Usage: node heatmap_screenshot.js --output <path.png> [--input <data.json>]');
  process.exit(1);
}

// ── Read JSON data ────────────────────────────────────────────────────────────
let raw = '';
if (inputFile) {
  raw = fs.readFileSync(inputFile, 'utf8').trim();
} else {
  try { raw = fs.readFileSync('/dev/stdin', 'utf8').trim(); } catch {}
}

let campingData = {};
if (raw) {
  try { campingData = JSON.parse(raw); }
  catch (e) { console.error('Invalid JSON:', e.message); process.exit(1); }
}

// ── Convert camping.py JSON -> {date: count, park_id} for heatmap ─────────────
// camping.py JSON format: { park_id: { site_id: [{start, end}, ...] } }
// We need: [{ date: Date, count: 1, parks: [pid, ...] }]
const dateMap = {};  // iso -> Set of park_ids
for (const [parkId, sites] of Object.entries(campingData)) {
  for (const ranges of Object.values(sites)) {
    for (const { start } of ranges) {
      if (!dateMap[start]) dateMap[start] = new Set();
      dateMap[start].add(parkId);
    }
  }
}

// Build chart data: count = num parks available that day
const chartData = Object.entries(dateMap).map(([iso, parks]) => ({
  date: new Date(iso + 'T12:00:00'),
  count: parks.size,
  parks: [...parks],
}));

// ── Build HTML ─────────────────────────────────────────────────────────────────
// Use the published CDN build of the calendar-heatmap library.
// We render a custom D3 heatmap inspired by the DKirwan style.
const today = new Date();
const sixMonthsOut = new Date(today);
sixMonthsOut.setMonth(sixMonthsOut.getMonth() + 6);

// Inject park config and data for the custom renderer
const parkConfigJSON = JSON.stringify(PARK_CONFIG);
const chartDataJSON = JSON.stringify(
  chartData.map(d => ({ date: d.date.toISOString().slice(0, 10), parks: d.parks }))
);

const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: #ffffff; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; padding: 20px; }
  h2 { font-size: 14px; color: #24292e; font-weight: 600; margin-bottom: 14px; }
  #chart { display: flex; flex-direction: column; }
  .month-row { display: flex; align-items: flex-start; gap: 0; }
  .day-labels { display: flex; flex-direction: column; gap: 2px; margin-right: 6px; padding-top: 22px; }
  .day-label { font-size: 9px; color: #586069; }
  .months-grid { display: flex; gap: 14px; }
  .month-block { display: flex; flex-direction: column; }
  .month-name { font-size: 10px; color: #24292e; font-weight: 600; margin-bottom: 4px; text-align: center; }
  .month-weeks { display: flex; gap: 2px; }
  .week-col { display: flex; flex-direction: column; gap: 2px; }
  .day-cell { border-radius: 2px; display: flex; overflow: hidden; position: relative; }
  .day-num { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; font-weight: 500; color: rgba(0,0,0,0.28); pointer-events: none; line-height: 1; }
  .strip { flex: 1; height: 100%; }
  .legend { display: flex; gap: 16px; margin-top: 14px; align-items: center; flex-wrap: wrap; }
  .legend-item { display: flex; align-items: center; gap: 5px; font-size: 10px; color: #586069; }
  .legend-swatch { width: 12px; height: 12px; border-radius: 2px; flex-shrink: 0; }
</style>
</head>
<body>
<h2>Campsite Availability &mdash; Next 6 Months</h2>
<div id="chart"></div>
<div class="legend" id="legend"></div>

<script>
const PARK_CONFIG = ${parkConfigJSON};
const RAW_DATA    = ${chartDataJSON};

// Build a date->parks lookup
const lookup = {};
for (const {date, parks} of RAW_DATA) lookup[date] = parks;

function isoDate(d) {
  return d.toISOString().slice(0,10);
}

function addDays(d, n) {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function startOfWeek(d) {  // Monday
  const r = new Date(d);
  const day = r.getDay() || 7;
  r.setDate(r.getDate() - day + 1);
  return r;
}

const today = new Date();
today.setHours(0,0,0,0);
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

// Pre-pass: count week columns per month so we can compute a dynamic cell size
const monthWeekCounts = [];
for (let mo = 0; mo < 6; mo++) {
  const ref = new Date(today.getFullYear(), today.getMonth() + mo, 1);
  const lastDayOfMonth = new Date(today.getFullYear(), today.getMonth() + mo + 1, 0);
  let ws = startOfWeek(ref);
  let wc = 0;
  while (ws <= lastDayOfMonth) { wc++; ws = addDays(ws, 7); }
  monthWeekCounts.push(wc);
}
const totalWeeks = monthWeekCounts.reduce((a, b) => a + b, 0);
const WEEK_GAP = 2;   // px between week columns within a month
const MONTH_GAP = 8;  // px between month blocks
const DAY_LABEL_W = 42; // day-of-week label column width
const BODY_PADDING = 40; // 20px each side
const availableW = window.innerWidth - BODY_PADDING - DAY_LABEL_W - MONTH_GAP * 5;
// totalWeeks cells + (totalWeeks - 6) inter-week gaps = availableW
const CELL_SIZE = Math.max(12, Math.floor((availableW - (totalWeeks - 6) * WEEK_GAP) / totalWeeks));

// Render 6 months
const chart = document.getElementById('chart');
const monthsDiv = document.createElement('div');
monthsDiv.style.display = 'flex';
monthsDiv.style.flex = '1';
monthsDiv.style.gap = MONTH_GAP + 'px';
monthsDiv.style.alignItems = 'flex-end';

// Day labels column
const dayLabelCol = document.createElement('div');
dayLabelCol.className = 'day-labels';
['Mon','','Wed','','Fri','','Sun'].forEach(l => {
  const el = document.createElement('div');
  el.className = 'day-label';
  el.style.height = CELL_SIZE + 'px';
  el.style.lineHeight = CELL_SIZE + 'px';
  el.textContent = l;
  dayLabelCol.appendChild(el);
});

const monthRow = document.createElement('div');
monthRow.style.display = 'flex';
monthRow.style.alignItems = 'flex-start';
monthRow.style.width = '100%';
monthRow.appendChild(dayLabelCol);
monthRow.appendChild(monthsDiv);
chart.appendChild(monthRow);

for (let mo = 0; mo < 6; mo++) {
  const ref = new Date(today.getFullYear(), today.getMonth() + mo, 1);
  const year = ref.getFullYear();
  const month = ref.getMonth();
  const lastDay = new Date(year, month + 1, 0).getDate();

  // Collect all weeks that have days in this month
  const firstDay = new Date(year, month, 1);
  const lastDayDate = new Date(year, month, lastDay);
  let weekStart = startOfWeek(firstDay);

  const monthBlock = document.createElement('div');
  monthBlock.className = 'month-block';

  const label = document.createElement('div');
  label.className = 'month-name';
  label.textContent = MONTHS[month] + (month === 0 ? ' ' + year : '');
  monthBlock.appendChild(label);

  const weeksDiv = document.createElement('div');
  weeksDiv.className = 'month-weeks';
  monthBlock.appendChild(weeksDiv);

  while (weekStart <= lastDayDate) {
    const weekCol = document.createElement('div');
    weekCol.className = 'week-col';

    for (let wd = 0; wd < 7; wd++) {  // Mon=0 to Sun=6
      const day = addDays(weekStart, wd);
      const cell = document.createElement('div');
      cell.className = 'day-cell';
      cell.style.width = CELL_SIZE + 'px';
      cell.style.height = CELL_SIZE + 'px';

      const inMonth = day.getMonth() === month && day.getFullYear() === year;
      const isPast = day < today;

      if (!inMonth) {
        cell.style.visibility = 'hidden';
      } else if (isPast) {
        cell.style.background = '#f0f0f0';
      } else {
        const iso = isoDate(day);
        const parks = lookup[iso] || [];
        if (parks.length === 0) {
          cell.style.background = '#ebedf0';
        } else {
          parks.forEach(pid => {
            const strip = document.createElement('div');
            strip.className = 'strip';
            strip.style.background = (PARK_CONFIG[pid] || {color: '#aaa'}).color;
            cell.appendChild(strip);
          });
        }
      }
      // Date number overlay for all in-month cells (past and future)
      if (inMonth) {
        const iso = isoDate(day);
        const parks = !isPast ? (lookup[iso] || []) : [];
        const hasColor = parks.length > 0;
        const num = document.createElement('span');
        num.className = 'day-num';
        num.style.fontSize = Math.max(7, Math.floor(CELL_SIZE * 0.42)) + 'px';
        num.style.color = hasColor ? 'rgba(255,255,255,0.85)' : 'rgba(0,0,0,0.28)';
        num.textContent = day.getDate();
        cell.appendChild(num);
      }
      weekCol.appendChild(cell);
    }
    weeksDiv.appendChild(weekCol);
    weekStart = addDays(weekStart, 7);
  }
  monthsDiv.appendChild(monthBlock);
}

// Legend
const legend = document.getElementById('legend');
const legendItems = Object.entries(PARK_CONFIG).concat([['_none', {color:'#ebedf0', name:'Unavailable'}]]);
for (const [_pid, cfg] of legendItems) {
  const item = document.createElement('div');
  item.className = 'legend-item';
  const sw = document.createElement('div');
  sw.className = 'legend-swatch';
  sw.style.background = cfg.color;
  item.appendChild(sw);
  item.appendChild(document.createTextNode(cfg.name));
  legend.appendChild(item);
}
</script>
</body>
</html>`;

// ── Screenshot ─────────────────────────────────────────────────────────────────
(async () => {
  const tmpHtml = path.join(require('os').tmpdir(), `camping_heatmap_${process.pid}.html`);
  fs.writeFileSync(tmpHtml, html, 'utf8');

  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1000, height: 500 });
  await page.goto(`file://${tmpHtml}`);
  await page.waitForTimeout(300);

  // Screenshot just the body content
  const body = await page.$('body');
  await body.screenshot({ path: outputFile, omitBackground: false });

  await browser.close();
  fs.unlinkSync(tmpHtml);
  console.error(`Heatmap written to ${outputFile}`);
})();
