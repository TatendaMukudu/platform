/* ============================================================
   PLATFORM — CHART HELPERS
   Wrappers around Chart.js for consistent styling
   ============================================================ */

const ChartDefaults = {
  font: { family: "'Inter','Segoe UI',system-ui,sans-serif", size: 11 },
  color: '#8b96b8',
  borderColor: '#252d4a',
  grid: { color: 'rgba(37,45,74,0.7)', borderDash: [3,3] },
};

/* ── AND THE LIBRARY IS NOT ALWAYS THERE ──────────────────────────────────────────────────────
   Chart.js arrives from a CDN. These three lines ran at MODULE LOAD, so on any page load where
   that request did not land — a filtered network, an installed app with no signal, this build
   environment — `Chart` was undefined, the assignment threw, and the WHOLE FILE stopped
   evaluating. Every helper below it then did not exist either, so a caller that reached for one
   threw a second time. The visible result was an uncaught page error on every load and an empty
   box where a chart should be.

   Found by walking the pilot journey in a real browser looking for controls whose capability is
   missing — the same class as the Office readers, and the same answer: degrade honestly, in one
   place, rather than fail loudly in several. `chartsAvailable()` is what a surface asks before it
   promises somebody a picture. */
function chartsAvailable() {
  try { return typeof Chart !== 'undefined' && !!Chart; } catch (_) { return false; }
}

if (chartsAvailable()) {
  Chart.defaults.color = ChartDefaults.color;
  Chart.defaults.font.family = ChartDefaults.font.family;
  Chart.defaults.font.size = ChartDefaults.font.size;
}

function destroyChart(id){
  if (!chartsAvailable()) return;
  const existing = Chart.getChart(id);
  if(existing) existing.destroy();
}

/* WHERE THE PICTURE WOULD HAVE BEEN, say why there isn't one. An empty box teaches somebody the
   data is missing, which is a different and wrong thing from the drawing library not loading. */
function _chartUnavailable(canvasId){
  const el = typeof document !== 'undefined' ? document.getElementById(canvasId) : null;
  if (!el || !el.parentNode) return null;
  if (el.parentNode.querySelector('.iq-chart-off')) return null;
  const note = document.createElement('div');
  note.className = 'iq-chart-off';
  note.textContent = 'The chart could not be drawn on this connection. The figures it is based on are unchanged.';
  el.parentNode.insertBefore(note, el);
  el.style.display = 'none';
  return null;
}

/* Line/Area chart for performance history */
function createLineChart(canvasId, labels, datasets, opts={}){
  if (!chartsAvailable()) return _chartUnavailable(canvasId);
  destroyChart(canvasId);
  const ctx = document.getElementById(canvasId);
  if(!ctx) return;
  return new Chart(ctx, {
    type: 'line',
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: opts.ratio ?? true,
      interaction: { intersect: false, mode: 'index' },
      plugins: {
        legend: { position: 'bottom', labels:{ boxWidth:10, padding:16, usePointStyle:true } },
        tooltip: {
          backgroundColor: '#161b2e',
          borderColor: '#252d4a',
          borderWidth: 1,
          padding: 10,
          titleColor: '#e8ecf8',
          bodyColor: '#8b96b8',
        },
      },
      scales: {
        x: { grid: ChartDefaults.grid },
        y: { grid: ChartDefaults.grid, min: opts.yMin??0, max: opts.yMax??100 },
      },
    },
  });
}

/* Bar chart */

/* Radar chart for multi-metric profiles */
function createRadarChart(canvasId, labels, datasets){
  if (!chartsAvailable()) return _chartUnavailable(canvasId);
  destroyChart(canvasId);
  const ctx = document.getElementById(canvasId);
  if(!ctx) return;
  return new Chart(ctx, {
    type: 'radar',
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: { display: false },
        tooltip: { backgroundColor:'#161b2e', borderColor:'#252d4a', borderWidth:1 },
      },
      scales: {
        r: {
          min: 0, max: 100,
          grid: { color: 'rgba(37,45,74,0.8)' },
          pointLabels: { color: '#8b96b8', font:{ size:10 } },
          ticks: { display: false, stepSize: 25 },
          angleLines: { color: 'rgba(37,45,74,0.8)' },
        },
      },
    },
  });
}

/* Doughnut chart */

/* Scatter chart for member IQ vs Performance */


/* Horizontal bar for group comparison */
