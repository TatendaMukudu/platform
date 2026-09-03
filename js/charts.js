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

Chart.defaults.color = ChartDefaults.color;
Chart.defaults.font.family = ChartDefaults.font.family;
Chart.defaults.font.size = ChartDefaults.font.size;

function destroyChart(id){
  const existing = Chart.getChart(id);
  if(existing) existing.destroy();
}

/* Line/Area chart for performance history */
function createLineChart(canvasId, labels, datasets, opts={}){
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
