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
function createBarChart(canvasId, labels, datasets, opts={}){
  destroyChart(canvasId);
  const ctx = document.getElementById(canvasId);
  if(!ctx) return;
  return new Chart(ctx, {
    type: 'bar',
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: opts.ratio ?? true,
      plugins: {
        legend: { display: opts.legend ?? false },
        tooltip: {
          backgroundColor: '#161b2e',
          borderColor: '#252d4a',
          borderWidth: 1,
          padding: 10,
        },
      },
      scales: {
        x: { grid: { display: false } },
        y: { grid: ChartDefaults.grid, min: 0, max: 100 },
      },
    },
  });
}

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
function createDoughnutChart(canvasId, labels, data, colors){
  destroyChart(canvasId);
  const ctx = document.getElementById(canvasId);
  if(!ctx) return;
  return new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{ data, backgroundColor: colors, borderColor: '#111420', borderWidth: 2, hoverOffset: 6 }],
    },
    options: {
      responsive: true,
      cutout: '68%',
      plugins: {
        legend: { position:'bottom', labels:{ boxWidth:10, padding:14, usePointStyle:true } },
        tooltip: { backgroundColor:'#161b2e', borderColor:'#252d4a', borderWidth:1 },
      },
    },
  });
}

/* Scatter chart for member IQ vs Performance */
function createScatterChart(canvasId, members){
  destroyChart(canvasId);
  const ctx = document.getElementById(canvasId);
  if(!ctx) return;
  return new Chart(ctx, {
    type: 'scatter',
    data: {
      datasets: [{
        label: 'Members',
        data: members.map(m=>({ x: m.iqScore, y: m.overall, label: m.name })),
        backgroundColor: members.map(m=>m.color+'99'),
        borderColor: members.map(m=>m.color),
        borderWidth: 1,
        pointRadius: 7,
        pointHoverRadius: 10,
      }],
    },
    options: {
      responsive: true,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#161b2e',
          borderColor: '#252d4a',
          borderWidth: 1,
          callbacks: {
            label: ctx => `${ctx.raw.label}: IQ ${ctx.raw.x} | Performance ${ctx.raw.y}`,
          },
        },
      },
      scales: {
        x: { grid: ChartDefaults.grid, title:{ display:true, text:'IntelliQ Score', color:'#8b96b8' }, min:40, max:100 },
        y: { grid: ChartDefaults.grid, title:{ display:true, text:'Overall Performance', color:'#8b96b8' }, min:40, max:100 },
      },
    },
  });
}

/* Mini sparkline (no axes, no legend, inline) */
function createSparkline(canvasId, data, color='#4f8ef7'){
  destroyChart(canvasId);
  const ctx = document.getElementById(canvasId);
  if(!ctx) return;
  return new Chart(ctx, {
    type: 'line',
    data: {
      labels: data.map((_,i)=>i),
      datasets: [{
        data,
        borderColor: color,
        borderWidth: 2,
        pointRadius: 0,
        fill: true,
        backgroundColor: color+'22',
        tension: 0.4,
      }],
    },
    options: {
      responsive: false,
      plugins: { legend:{display:false}, tooltip:{enabled:false} },
      scales: { x:{display:false}, y:{display:false} },
      animation: false,
    },
  });
}

/* Horizontal bar for group comparison */
function createHorizBarChart(canvasId, labels, data, color='#4f8ef7'){
  destroyChart(canvasId);
  const ctx = document.getElementById(canvasId);
  if(!ctx) return;
  return new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets:[{ data, backgroundColor: color+'99', borderColor: color, borderWidth:1, borderRadius:4 }],
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      plugins: { legend:{display:false}, tooltip:{ backgroundColor:'#161b2e', borderColor:'#252d4a', borderWidth:1 }},
      scales: {
        x: { grid: ChartDefaults.grid, min:0, max:100 },
        y: { grid:{ display:false } },
      },
    },
  });
}
