// ==========================================
// 1. ENLACES DIRECTOS A GOOGLE SHEETS
// ==========================================
const timestamp = new Date().getTime();


// CAMBIADO POR EL NORMALIZADO POR VER COSAS xd NO OLVIDAR CAMBIAR A LOS OTROS LINKS EN LINKS_MESES_TEST.txt
const MONTH_URLS = {
  febrero: `https://docs.google.com/spreadsheets/d/e/2PACX-1vS8XA4ddmXQF3tJcKew8WhY5Tr8LfjX1E2hkHWZG4u7w8ASutVxoF5jyOinttJyNr1yXpKv6ueoxsUZ/pub?gid=0&single=true&output=csv&_cb=${timestamp}`,
  marzo: `https://docs.google.com/spreadsheets/d/e/2PACX-1vS8XA4ddmXQF3tJcKew8WhY5Tr8LfjX1E2hkHWZG4u7w8ASutVxoF5jyOinttJyNr1yXpKv6ueoxsUZ/pub?gid=397555912&single=true&output=csv&_cb=${timestamp}`,
  abril: `https://docs.google.com/spreadsheets/d/e/2PACX-1vS8XA4ddmXQF3tJcKew8WhY5Tr8LfjX1E2hkHWZG4u7w8ASutVxoF5jyOinttJyNr1yXpKv6ueoxsUZ/pub?gid=1499336465&single=true&output=csv&_cb=${timestamp}`,
  mayo: `https://docs.google.com/spreadsheets/d/e/2PACX-1vS8XA4ddmXQF3tJcKew8WhY5Tr8LfjX1E2hkHWZG4u7w8ASutVxoF5jyOinttJyNr1yXpKv6ueoxsUZ/pub?gid=289433826&single=true&output=csv&_cb=${timestamp}`,
  junio: `https://docs.google.com/spreadsheets/d/e/2PACX-1vS8XA4ddmXQF3tJcKew8WhY5Tr8LfjX1E2hkHWZG4u7w8ASutVxoF5jyOinttJyNr1yXpKv6ueoxsUZ/pub?gid=632786864&single=true&output=csv&_cb=${timestamp}`
};

let allMonthsData = {};
let rawData = [];
let filteredData = [];
let focusCharts = [];

// Variables de estado de los filtros rápidos
let onlyCriticalRisk = false; 
let onlyConsistentGreen = false;
let onlyRegularPerformers = false;

let sortState = {
  'agents-table': { column: null, isAsc: true },
  'focus-table': { column: null, isAsc: true },
  'supervisors-table': { column: null, isAsc: true },
  'coordinators-table': { column: null, isAsc: true },
  'diagnostic-table': { column: null, isAsc: true }
};

// Función de lectura tolerante a prefijos o saltos de línea
function getRowValue(row, keyName) {
  if (!row) return '';
  const targetKey = keyName.trim().toUpperCase();
  
  const actualKey = Object.keys(row).find(k => {
    if (!k) return false;
    const cleanKey = k.replace(/[\r\n]/g, '').trim().toUpperCase();
    return cleanKey === targetKey || cleanKey.startsWith(targetKey);
  });
  
  return actualKey ? row[actualKey].toString().trim() : '';
}

// Lista exacta de palabras clave para parsear sesiones
const EXACT_KEYWORDS = [
  "📅 Fecha",
  "🔗 URLTr:",
  "🗣️ Speech:",
  "📚 Producto:",
  "🛡️ Objeciones:",
  "🤝 Cierre:",
  "📌 Acuerdos \\+ Estado:"
];

function parseSessionField(fullText, exactLabel) {
  if (!fullText) return '-';

  const escapedLabel = exactLabel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const lookaheadPattern = EXACT_KEYWORDS.join('|');

  const regex = new RegExp(
    `${escapedLabel}\\s*[:\\-=]?\\s*([\\s\\S]*?)(?=(?:${lookaheadPattern})\\s*[:\\-=]|$|\n)`
  );
  
  const match = fullText.match(regex);
  if (match && match[1]) {
    const val = match[1].trim();
    return val !== '' ? val : '-';
  }

  return '-';
}

// ==========================================
// 2. CARGA DE DATOS
// ==========================================
function populateMonthSelector() {
  const selectMes = document.getElementById('filter-mes');
  if (!selectMes) return;

  Object.keys(MONTH_URLS).forEach(monthKey => {
    if (!selectMes.querySelector(`option[value="${monthKey}"]`)) {
      const option = document.createElement('option');
      option.value = monthKey;
      const formattedName = monthKey.charAt(0).toUpperCase() + monthKey.slice(1);
      option.textContent = `${formattedName} 2026`;
      selectMes.appendChild(option);
    }
  });
}

async function preloadAllMonths() {
  const monthKeys = Object.keys(MONTH_URLS);
  
  const promises = monthKeys.map(month => {
    return new Promise((resolve) => {
      Papa.parse(MONTH_URLS[month], {
        download: true,
        header: true,
        skipEmptyLines: 'greedy',
        transformHeader: h => (h ? h.replace(/[\r\n]/g, '').trim() : ''),
        complete: results => {
          const validData = (results.data || []).map(row => ({
            ...row,
            _MES_ORIGEN: month
          })).filter(row => {
            const agentVal = getRowValue(row, 'PROMOTOR');
            return agentVal && agentVal !== '';
          });

          resolve({ month, data: validData });
        },
        error: (err) => {
          console.error(`[ERROR] Error al cargar ${month}:`, err);
          resolve({ month, data: [] });
        }
      });
    });
  });

  const results = await Promise.all(promises);
  results.forEach(res => {
    allMonthsData[res.month] = res.data;
  });

  loadDashboardData();
}

function loadDashboardData() {
  const selectedMonth = document.getElementById('filter-mes').value;
  const agentMonthsMap = buildAgentMonthsMap();

  if (selectedMonth === 'todos') {
    rawData = [];
    Object.keys(allMonthsData).forEach(m => {
      rawData = rawData.concat(allMonthsData[m]);
    });
  } else {
    rawData = allMonthsData[selectedMonth] || [];
  }

  rawData = rawData.map(row => {
    const agentName = getRowValue(row, 'PROMOTOR').toUpperCase();
    const activeMonths = agentMonthsMap[agentName] || [];
    const currentRowMonth = row._MES_ORIGEN;

    const formattedMonths = activeMonths
      .map(m => {
        const nameFormatted = m.charAt(0).toUpperCase() + m.slice(1);
        if (m === currentRowMonth) {
          return `<strong>${nameFormatted}</strong>`;
        }
        return nameFormatted;
      })
      .join(', ');

    return {
      ...row,
      'MESES_ACTIVO': formattedMonths || '-'
    };
  });

  resetSelect('filter-trainer');
  resetSelect('filter-supervisor');
  resetSelect('filter-coordinador');
  resetSelect('filter-status');

  populateFilters(rawData);
  filterData();
}

function renderAllTables() {
  if (sortState['agents-table'].column) {
    applyAgentSort('agents-table');
  } else {
    renderTable(filteredData);
  }

  renderFocusTable(filteredData);
  renderLeadersTables(filteredData);
  renderDiagnosticTable(filteredData);
  
  const tabTrends = document.getElementById('tab-trends');
  if (tabTrends && tabTrends.style.display !== 'none') {
    renderTrendsTable();
  }

  const tabSessions = document.getElementById('tab-sessions');
  if (tabSessions && tabSessions.style.display !== 'none') {
    renderTrainerSessions(filteredData);
  }
}

function buildAgentMonthsMap() {
  const map = {};
  Object.keys(allMonthsData).forEach(month => {
    allMonthsData[month].forEach(row => {
      const agent = getRowValue(row, 'PROMOTOR').toUpperCase();
      if (agent) {
        if (!map[agent]) map[agent] = [];
        if (!map[agent].includes(month)) {
          map[agent].push(month);
        }
      }
    });
  });
  return map;
}

function resetSelect(elementId) {
  const select = document.getElementById(elementId);
  if (select) {
    select.innerHTML = '<option value="">Todos</option>';
  }
}

// ==========================================
// 3. FILTROS Y EVENTOS
// ==========================================
function populateFilters(data) {
  const trainers = [...new Set(data.map(item => getRowValue(item, 'TRAINER')).filter(Boolean))];
  const supervisors = [...new Set(data.map(item => getRowValue(item, 'SUPERVISOR')).filter(Boolean))];
  const coordinadores = [...new Set(data.map(item => getRowValue(item, 'COORDINADOR')).filter(Boolean))];
  const statuses = [...new Set(data.map(item => getRowValue(item, 'STATUS AGENTE')).filter(Boolean))];

  fillSelect('filter-trainer', trainers);
  fillSelect('filter-supervisor', supervisors);
  fillSelect('filter-coordinador', coordinadores);
  fillSelect('filter-status', statuses);
}

function fillSelect(elementId, options) {
  const select = document.getElementById(elementId);
  if (!select) return;

  options.sort().forEach(opt => {
    const option = document.createElement('option');
    option.value = opt;
    option.textContent = opt;
    select.appendChild(option);
  });

  if (!select.dataset.hasListener) {
    select.addEventListener('change', filterData);
    select.dataset.hasListener = "true";
  }
}

// Alternar filtro de Riesgo Crítico (Desactiva Verde)
function toggleCriticalRiskFilter() {
  onlyCriticalRisk = !onlyCriticalRisk;
  if (onlyCriticalRisk) {
    onlyConsistentGreen = false;
    document.getElementById('btn-consistent-green')?.classList.remove('active');
  }

  const btn = document.getElementById('btn-critical-risk');
  if (btn) btn.classList.toggle('active', onlyCriticalRisk);
  
  renderAllTables();
}

// Alternar filtro de 2 Meses Seguidos en Verde (Desactiva Riesgo Crítico)
function toggleConsistentGreenFilter() {
  onlyConsistentGreen = !onlyConsistentGreen;
  if (onlyConsistentGreen) {
    onlyCriticalRisk = false;
    document.getElementById('btn-critical-risk')?.classList.remove('active');
  }

  const btn = document.getElementById('btn-consistent-green');
  if (btn) btn.classList.toggle('active', onlyConsistentGreen);
  
  renderAllTables();
}

function filterData() {
  const searchVal = document.getElementById('filter-search')?.value.toLowerCase().trim() || '';
  const trainerVal = document.getElementById('filter-trainer').value;
  const supervisorVal = document.getElementById('filter-supervisor').value;
  const coordinadorVal = document.getElementById('filter-coordinador').value;
  const statusVal = document.getElementById('filter-status').value;

  filteredData = rawData.filter(item => {
    const agentName = getRowValue(item, 'PROMOTOR').toLowerCase();
    const matchSearch = !searchVal || agentName.includes(searchVal);
    const matchTrainer = !trainerVal || getRowValue(item, 'TRAINER') === trainerVal;
    const matchSupervisor = !supervisorVal || getRowValue(item, 'SUPERVISOR') === supervisorVal;
    const matchCoordinador = !coordinadorVal || getRowValue(item, 'COORDINADOR') === coordinadorVal;
    const matchStatus = !statusVal || getRowValue(item, 'STATUS AGENTE') === statusVal;
    
    return matchSearch && matchTrainer && matchSupervisor && matchCoordinador && matchStatus;
  });

  renderAllTables();
}

function resetAllFilters() {
  const searchInput = document.getElementById('filter-search');
  if (searchInput) searchInput.value = '';

  document.getElementById('filter-mes').value = 'todos';
  document.getElementById('filter-trainer').value = '';
  document.getElementById('filter-supervisor').value = '';
  document.getElementById('filter-coordinador').value = '';
  document.getElementById('filter-status').value = '';

  onlyCriticalRisk = false;
  onlyConsistentGreen = false;
  onlyRegularPerformers = false;
  updateFilterButtonsUI();
  document.getElementById('btn-critical-risk')?.classList.remove('active');
  document.getElementById('btn-consistent-green')?.classList.remove('active');

  Object.keys(sortState).forEach(tableId => {
    sortState[tableId] = { column: null, isAsc: true };
  });

  loadDashboardData();
}

// Evaluador de 3 meses consecutivos < 50%
function hasThreeConsecutiveLowMonths(agentMonthsData) {
  const monthKeys = Object.keys(MONTH_URLS);
  let consecutiveLowCount = 0;

  for (let m of monthKeys) {
    const record = agentMonthsData[m];
    if (record && record.cumplimiento !== '-') {
      const pct = parseNum(record.cumplimiento);
      if (pct < 50) {
        consecutiveLowCount++;
        if (consecutiveLowCount >= 3) return true;
      } else {
        consecutiveLowCount = 0;
      }
    } else {
      consecutiveLowCount = 0;
    }
  }
  return false;
}

// Evaluador de 2 meses consecutivos >= 90%
function hasTwoConsecutiveGreenMonths(agentMonthsData) {
  const monthKeys = Object.keys(MONTH_URLS);
  let consecutiveGreenCount = 0;

  for (let m of monthKeys) {
    const record = agentMonthsData[m];
    if (record && record.cumplimiento !== '-') {
      const pct = parseNum(record.cumplimiento);
      if (pct >= 90) {
        consecutiveGreenCount++;
        if (consecutiveGreenCount >= 2) return true;
      } else {
        consecutiveGreenCount = 0;
      }
    } else {
      consecutiveGreenCount = 0;
    }
  }
  return false;
}

// ==========================================
// 4. CAMBIO DE PESTAÑAS
// ==========================================
function switchTab(tabName, evt) {
  if (tabName !== 'focus') {
    if (onlyCriticalRisk) toggleCriticalRiskFilter();
    if (onlyConsistentGreen) toggleConsistentGreenFilter();
  }
  
  document.querySelectorAll('.tab-button').forEach(btn => btn.classList.remove('active'));
  
  const tabAgents = document.getElementById('tab-agents');
  const tabFocus = document.getElementById('tab-focus');
  const tabLeaders = document.getElementById('tab-leaders');
  const tabTrends = document.getElementById('tab-trends');
  const tabSessions = document.getElementById('tab-sessions');
  const tabDiagnostic = document.getElementById('tab-diagnostic');

  if (tabAgents) tabAgents.style.display = 'none';
  if (tabFocus) tabFocus.style.display = 'none';
  if (tabLeaders) tabLeaders.style.display = 'none';
  if (tabTrends) tabTrends.style.display = 'none';
  if (tabSessions) tabSessions.style.display = 'none';
  if (tabDiagnostic) tabDiagnostic.style.display = 'none';

  if (tabName === 'agents' && tabAgents) tabAgents.style.display = 'block';
  if (tabName === 'focus' && tabFocus) tabFocus.style.display = 'block';
  if (tabName === 'leaders' && tabLeaders) tabLeaders.style.display = 'block';
  if (tabName === 'trends' && tabTrends) {
    tabTrends.style.display = 'block';
    renderTrendsTable();
  }
  if (tabName === 'sessions' && tabSessions) {
    tabSessions.style.display = 'block';
    renderTrainerSessions(filteredData);
  }
  
  if (tabName === 'diagnostic' && tabDiagnostic) {
    tabDiagnostic.style.display = 'block';
    renderDiagnosticTable(filteredData);
  }

  if (evt && evt.currentTarget) {
    evt.currentTarget.classList.add('active');
  }
}

// ==========================================
// 5. ORDENAMIENTO & INSIGNIAS
// ==========================================
function handleSort(tableId, columnKey) {
  const current = sortState[tableId];
  if (!current) return;

  if (current.column === columnKey) {
    current.isAsc = !current.isAsc;
  } else {
    current.column = columnKey;
    current.isAsc = true;
  }

  if (tableId === 'agents-table') {
    applyAgentSort('agents-table');
  } else if (tableId === 'focus-table') {
    renderFocusTable(filteredData);
  } else if (tableId === 'supervisors-table') {
    renderGroupedTable(filteredData, 'SUPERVISOR', '#supervisors-table tbody', 'supervisors-table');
  } else if (tableId === 'coordinators-table') {
    renderGroupedTable(filteredData, 'COORDINADOR', '#coordinators-table tbody', 'coordinators-table');
  } else if (tableId === 'diagnostic-table') {
    renderDiagnosticTable(filteredData);
  }
}

function applyAgentSort(tableId) {
  const { column, isAsc } = sortState[tableId];

  filteredData.sort((a, b) => {
    let valA = getRowValue(a, column);
    let valB = getRowValue(b, column);

    let numA = parseFloat(valA.replace('%', '').replace(',', '.'));
    let numB = parseFloat(valB.replace('%', '').replace(',', '.'));

    if (!isNaN(numA) && !isNaN(numB)) {
      return isAsc ? numA - numB : numB - numA;
    }

    valA = valA.toLowerCase();
    valB = valB.toLowerCase();

    if (valA < valB) return isAsc ? -1 : 1;
    if (valA > valB) return isAsc ? 1 : -1;
    return 0;
  });

  renderTable(filteredData);
}

function parseNum(val) {
  if (!val) return 0;
  let num = parseFloat(val.toString().replace('%', '').replace(',', '.'));
  return isNaN(num) ? 0 : num;
}

function getComplianceBadge(valueStr) {
  if (!valueStr || valueStr === '-') return '-';
  
  let num = parseFloat(valueStr.toString().replace('%', '').replace(',', '.'));
  if (isNaN(num)) return valueStr;

  let colorClass = 'dot-red';
  if (num >= 90) {
    colorClass = 'dot-green';
  } else if (num >= 50) {
    colorClass = 'dot-yellow';
  }

  return `<span class="status-dot ${colorClass}"></span>${num.toFixed(1)}%`;
}

// ==========================================
// 6. RENDERIZADO DE TABLAS
// ==========================================

// TABLA 1: Listado General de Agentes
function renderTable(data) {
  const tbody = document.querySelector('#agents-table tbody');
  if (!tbody) return;
  tbody.innerHTML = '';

  if (!data || data.length === 0) {
    tbody.innerHTML = '<tr><td colspan="14" style="text-align:center;">No hay datos disponibles.</td></tr>';
    return;
  }

  data.forEach(row => {
    const metaVal = getRowValue(row, 'META');
    const complianceVal = getRowValue(row, 'CUMPLIMIENTO MES');
    const complianceHTML = getComplianceBadge(complianceVal);
    
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${getRowValue(row, 'PROMOTOR') || '-'}</strong></td>
      <td>${getRowValue(row, 'TRAINER') || '-'}</td>
      <td>${getRowValue(row, 'SUPERVISOR') || '-'}</td>
      <td>${getRowValue(row, 'COORDINADOR') || '-'}</td>
      <td>${metaVal || '0'}</td>
      <td>${getRowValue(row, 'V1') || '0'}</td>
      <td>${getRowValue(row, 'V2') || '0'}</td>
      <td>${getRowValue(row, 'V3') || '0'}</td>
      <td>${getRowValue(row, 'V4') || '0'}</td>
      <td>${getRowValue(row, 'V5') || '0'}</td>
      <td>${getRowValue(row, 'CIERRE') || '0'}</td>
      <td>${complianceHTML}</td>
      <td>${getRowValue(row, 'STATUS AGENTE') || '-'}</td>
      <td>${row['MESES_ACTIVO'] || '-'}</td>
    `;
    tbody.appendChild(tr);
  });
}

// TABLA FOCO: Matriz por Agente con Cierre, Cumpl. % por Mes, Gráficos y Filtros Rápido
function renderFocusTable(data) {
  const table = document.getElementById('focus-table');
  if (!table) return;
  
  const thead = table.querySelector('thead');
  const tbody = table.querySelector('tbody');
  thead.innerHTML = '';
  tbody.innerHTML = '';

  focusCharts.forEach(chart => chart.destroy());
  focusCharts = [];

  if (!data || data.length === 0) {
    tbody.innerHTML = '<tr><td style="text-align:center;">No hay datos disponibles.</td></tr>';
    return;
  }

  const selectedMonth = document.getElementById('filter-mes').value;
  let monthsToDisplay = selectedMonth === 'todos' ? Object.keys(MONTH_URLS) : [selectedMonth];

  let headerHTML = '<tr><th onclick="handleSort(\'focus-table\', \'PROMOTOR\')">Agente</th>';
  monthsToDisplay.forEach(m => {
    const mesFormatted = m.charAt(0).toUpperCase() + m.slice(1);
    headerHTML += `<th style="text-align:center;">Cierre (${mesFormatted})</th>`;
    headerHTML += `<th style="text-align:center;">Cumpl. % (${mesFormatted})</th>`;
  });
  headerHTML += '<th style="text-align:center; min-width: 180px;">Gráfico de Performance</th></tr>';
  thead.innerHTML = headerHTML;

  // 1. Mapear todo el historial por promotor (usando todos los meses disponibles)
  const fullAgentsMap = {};
  Object.keys(allMonthsData).forEach(m => {
    allMonthsData[m].forEach(row => {
      const agentName = getRowValue(row, 'PROMOTOR');
      if (!agentName) return;

      if (!fullAgentsMap[agentName]) {
        fullAgentsMap[agentName] = { agentName: agentName, monthsData: {} };
      }
      fullAgentsMap[agentName].monthsData[m] = {
        cierre: parseNum(getRowValue(row, 'CIERRE')),
        cumplimiento: getRowValue(row, 'CUMPLIMIENTO MES') || '-'
      };
    });
  });

  // 2. Agrupar datos según la selección actual
  const agentsMap = {};
  data.forEach(row => {
    const agentName = getRowValue(row, 'PROMOTOR');
    if (!agentName) return;

    if (!agentsMap[agentName]) {
      agentsMap[agentName] = fullAgentsMap[agentName] || { agentName: agentName, monthsData: {} };
    }
  });

  let agentsList = Object.values(agentsMap);

  // 3. Aplicar Filtros RÁPIDOS
  if (onlyCriticalRisk) {
    agentsList = agentsList.filter(agent => hasThreeConsecutiveLowMonths(agent.monthsData));
  } else if (onlyConsistentGreen) {
    agentsList = agentsList.filter(agent => hasTwoConsecutiveGreenMonths(agent.monthsData));
  } else if (onlyRegularPerformers) {
    // Filtra agentes que NO son Riesgo Crítico NI tampoco 2 Meses en Verde
    agentsList = agentsList.filter(agent => 
      !hasThreeConsecutiveLowMonths(agent.monthsData) && 
      !hasTwoConsecutiveGreenMonths(agent.monthsData)
    );
  }

  // Mensaje si no hay registros tras aplicar los filtros
  if (agentsList.length === 0) {
    let emptyMessage = 'No hay datos disponibles con los filtros seleccionados.';
    if (onlyCriticalRisk) {
      emptyMessage = '⚠️ No hay ninguna Promotora o Promotor en Riesgo Crítico (3 meses seguidos en rojo < 50%) con los filtros aplicados.';
    } else if (onlyConsistentGreen) {
      emptyMessage = '🌟 No hay ninguna Promotora o Promotor con 2 meses consecutivos en verde (≥ 90%) con los filtros aplicados.';
    } else if (onlyRegularPerformers) {
      emptyMessage = '📊 No hay ninguna Promotora o Promotor en categoría Regular con los filtros aplicados.';
    }
    const totalCols = (monthsToDisplay.length * 2) + 2;
    tbody.innerHTML = `<tr><td colspan="${totalCols}" style="text-align:center; padding: 20px; font-weight: bold; color: #555;">${emptyMessage}</td></tr>`;
    return;
  }

  const sortInfo = sortState['focus-table'];
  if (sortInfo && sortInfo.column === 'PROMOTOR') {
    agentsList.sort((a, b) => {
      const valA = a.agentName.toLowerCase();
      const valB = b.agentName.toLowerCase();
      if (valA < valB) return sortInfo.isAsc ? -1 : 1;
      if (valA > valB) return sortInfo.isAsc ? 1 : -1;
      return 0;
    });
  }

  // 4. Renderizado
  agentsList.forEach((agent, index) => {
    const tr = document.createElement('tr');
    let rowHTML = `<td><strong>${agent.agentName}</strong></td>`;
    
    const chartLabels = [];
    const chartData = [];

    monthsToDisplay.forEach(m => {
      const mesFormatted = m.charAt(0).toUpperCase() + m.slice(1);
      const monthRecord = agent.monthsData[m];
      
      chartLabels.push(mesFormatted);

      if (monthRecord) {
        const cierre = monthRecord.cierre;
        const cumplHTML = getComplianceBadge(monthRecord.cumplimiento);
        rowHTML += `<td style="text-align:center;">${cierre}</td>`;
        rowHTML += `<td style="text-align:center;">${cumplHTML}</td>`;
        chartData.push(cierre);
      } else {
        rowHTML += `<td style="text-align:center; color: #999;">-</td>`;
        rowHTML += `<td style="text-align:center; color: #999;">-</td>`;
        chartData.push(0);
      }
    });

    const canvasId = `chart-agent-${index}`;
    rowHTML += `
      <td style="text-align:center; padding: 5px;">
        <div style="width: 170px; height: 45px; margin: 0 auto;">
          <canvas id="${canvasId}"></canvas>
        </div>
      </td>
    `;

    tr.innerHTML = rowHTML;
    tbody.appendChild(tr);

    const ctx = document.getElementById(canvasId)?.getContext('2d');
    if (ctx) {
      const newChart = new Chart(ctx, {
        type: 'bar',
        data: {
          labels: chartLabels,
          datasets: [{
            label: 'Cierre',
            data: chartData,
            backgroundColor: '#3498db',
            borderRadius: 4,
            maxBarThickness: 15
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: { label: (context) => ` Cierre: ${context.raw}` }
            }
          },
          scales: {
            x: { grid: { display: false }, ticks: { font: { size: 9 } } },
            y: { display: false, beginAtZero: true }
          }
        }
      });

      focusCharts.push(newChart);
    }
  });
}

function renderLeadersTables(data) {
  renderGroupedTable(data, 'SUPERVISOR', '#supervisors-table tbody', 'supervisors-table');
  renderGroupedTable(data, 'COORDINADOR', '#coordinators-table tbody', 'coordinators-table');
}

function renderGroupedTable(data, groupKey, selector, tableId) {
  const tbody = document.querySelector(selector);
  if (!tbody) return;
  tbody.innerHTML = '';

  if (!data || data.length === 0) {
    tbody.innerHTML = '<tr><td colspan="10" style="text-align:center;">No hay datos disponibles.</td></tr>';
    return;
  }

  const groupMap = {};

  data.forEach(row => {
    const rawLeader = getRowValue(row, groupKey);
    const leader = rawLeader ? rawLeader.trim() : `Sin ${groupKey.toLowerCase()}`;

    if (!groupMap[leader]) {
      groupMap[leader] = {
        leader: leader,
        agentsCount: 0,
        metaTotal: 0,
        v1: 0, v2: 0, v3: 0, v4: 0, v5: 0,
        cierre: 0,
        compliancePct: 0
      };
    }

    groupMap[leader].agentsCount += 1;
    groupMap[leader].metaTotal += parseNum(getRowValue(row, 'META'));
    groupMap[leader].v1 += parseNum(getRowValue(row, 'V1'));
    groupMap[leader].v2 += parseNum(getRowValue(row, 'V2'));
    groupMap[leader].v3 += parseNum(getRowValue(row, 'V3'));
    groupMap[leader].v4 += parseNum(getRowValue(row, 'V4'));
    groupMap[leader].v5 += parseNum(getRowValue(row, 'V5'));
    groupMap[leader].cierre += parseNum(getRowValue(row, 'CIERRE'));
  });

  let leadersList = Object.values(groupMap);

  leadersList.forEach(l => {
    l.compliancePct = l.metaTotal > 0 ? ((l.cierre / l.metaTotal) * 100) : 0;
  });

  const sortInfo = sortState[tableId];
  if (sortInfo && sortInfo.column) {
    const col = sortInfo.column;
    const isAsc = sortInfo.isAsc;

    leadersList.sort((a, b) => {
      let valA = a[col];
      let valB = b[col];

      if (typeof valA === 'number' && typeof valB === 'number') {
        return isAsc ? valA - valB : valB - valA;
      }

      valA = valA.toString().toLowerCase();
      valB = valB.toString().toLowerCase();

      if (valA < valB) return isAsc ? -1 : 1;
      if (valA > valB) return isAsc ? 1 : -1;
      return 0;
    });
  }

  leadersList.forEach(l => {
    const complianceHTML = getComplianceBadge(l.compliancePct.toString());

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${l.leader}</strong></td>
      <td>${l.agentsCount}</td>
      <td>${l.metaTotal}</td>
      <td>${l.v1}</td>
      <td>${l.v2}</td>
      <td>${l.v3}</td>
      <td>${l.v4}</td>
      <td>${l.v5}</td>
      <td><strong>${l.cierre}</strong></td>
      <td>${complianceHTML}</td>
    `;
    tbody.appendChild(tr);
  });
}

function renderTrendsTable() {
  const tbody = document.querySelector('#trends-table tbody');
  if (!tbody) return;
  tbody.innerHTML = '';

  const monthKeys = Object.keys(allMonthsData);
  if (monthKeys.length === 0) {
    tbody.innerHTML = '<tr><td colspan="10" style="text-align:center;">No hay datos disponibles para comparar.</td></tr>';
    return;
  }

  monthKeys.forEach(monthKey => {
    const monthData = allMonthsData[monthKey] || [];
    
    const searchVal = document.getElementById('filter-search')?.value.toLowerCase().trim() || '';
    const trainerVal = document.getElementById('filter-trainer')?.value;
    const supervisorVal = document.getElementById('filter-supervisor')?.value;
    const coordinadorVal = document.getElementById('filter-coordinador')?.value;
    const statusVal = document.getElementById('filter-status')?.value;

    const filteredMonthData = monthData.filter(item => {
      const agentName = getRowValue(item, 'PROMOTOR').toLowerCase();
      const matchSearch = !searchVal || agentName.includes(searchVal);
      const matchTrainer = !trainerVal || getRowValue(item, 'TRAINER') === trainerVal;
      const matchSupervisor = !supervisorVal || getRowValue(item, 'SUPERVISOR') === supervisorVal;
      const matchCoordinador = !coordinadorVal || getRowValue(item, 'COORDINADOR') === coordinadorVal;
      const matchStatus = !statusVal || getRowValue(item, 'STATUS AGENTE') === statusVal;
      return matchSearch && matchTrainer && matchSupervisor && matchCoordinador && matchStatus;
    });

    let agentsCount = filteredMonthData.length;
    let metaTotal = 0;
    let v1 = 0, v2 = 0, v3 = 0, v4 = 0, v5 = 0;
    let cierre = 0;

    filteredMonthData.forEach(row => {
      metaTotal += parseNum(getRowValue(row, 'META'));
      v1 += parseNum(getRowValue(row, 'V1'));
      v2 += parseNum(getRowValue(row, 'V2'));
      v3 += parseNum(getRowValue(row, 'V3'));
      v4 += parseNum(getRowValue(row, 'V4'));
      v5 += parseNum(getRowValue(row, 'V5'));
      cierre += parseNum(getRowValue(row, 'CIERRE'));
    });

    const compliancePct = metaTotal > 0 ? ((cierre / metaTotal) * 100) : 0;
    const complianceHTML = getComplianceBadge(compliancePct.toString());
    const monthFormatted = monthKey.charAt(0).toUpperCase() + monthKey.slice(1);

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${monthFormatted} 2026</strong></td>
      <td>${agentsCount}</td>
      <td>${metaTotal}</td>
      <td>${v1}</td>
      <td>${v2}</td>
      <td>${v3}</td>
      <td>${v4}</td>
      <td>${v5}</td>
      <td><strong>${cierre}</strong></td>
      <td>${complianceHTML}</td>
    `;
    tbody.appendChild(tr);
  });
}

function renderTrainerSessions(data) {
  const container = document.getElementById('trainer-sessions-container');
  if (!container) return;
  container.innerHTML = '';

  if (!data || data.length === 0) {
    container.innerHTML = '<div class="table-card" style="text-align:center; padding: 20px;">No hay sesiones registradas para los filtros seleccionados.</div>';
    return;
  }

  const agentMonthMap = {};

  data.forEach(row => {
    const agent = getRowValue(row, 'PROMOTOR') || 'Sin Nombre';
    const mesOrigen = row._MES_ORIGEN || 'desconocido';
    const mesFormatted = mesOrigen.charAt(0).toUpperCase() + mesOrigen.slice(1);
    
    const uniqueKey = `${agent}_${mesOrigen}`;

    if (!agentMonthMap[uniqueKey]) {
      agentMonthMap[uniqueKey] = {
        agentName: agent,
        mesLabel: `${mesFormatted} 2026`,
        trainer: getRowValue(row, 'TRAINER') || '-',
        supervisor: getRowValue(row, 'SUPERVISOR') || '-',
        coordinador: getRowValue(row, 'COORDINADOR') || '-',
        status: getRowValue(row, 'STATUS AGENTE') || '-',
        sessions: []
      };
    }

    Object.keys(row).forEach(key => {
      const upperKey = key.toUpperCase();
      if (upperKey.includes('SESIÓ') || upperKey.includes('SESION')) {
        const rawCellContent = getRowValue(row, key);

        if (rawCellContent && rawCellContent !== '-') {
          const matchNum = upperKey.match(/\d+/);
          const numSesion = matchNum ? matchNum[0] : '';

          let fecha = parseSessionField(rawCellContent, '📅 Fecha');
          let urlTr = parseSessionField(rawCellContent, '🔗 URLTr:');
          let speech = parseSessionField(rawCellContent, '🗣️ Speech:');
          let producto = parseSessionField(rawCellContent, '📚 Producto:');
          let objeciones = parseSessionField(rawCellContent, '🛡️ Objeciones:');
          let cierre = parseSessionField(rawCellContent, '🤝 Cierre:');
          let acuerdosEstado = parseSessionField(rawCellContent, '📌 Acuerdos + Estado:');

          if (fecha === '-') {
            const dateMatch = rawCellContent.match(/\d{1,2}[\/\.-]\d{1,2}[\/\.-]\d{2,4}/);
            if (dateMatch) fecha = dateMatch[0];
          }

          if (urlTr === '-') {
            const urlMatch = rawCellContent.match(/https?:\/\/[^\s]+/i);
            if (urlMatch) urlTr = urlMatch[0];
          }

          agentMonthMap[uniqueKey].sessions.push({
            num: numSesion ? `Sesión ${numSesion}` : key,
            fecha: fecha,
            urlTr: urlTr,
            speech: speech,
            producto: producto,
            objeciones: objeciones,
            cierre: cierre,
            acuerdosEstado: acuerdosEstado !== '-' ? acuerdosEstado : rawCellContent
          });
        }
      }
    });
  });

  Object.keys(agentMonthMap).forEach(key => {
    const info = agentMonthMap[key];
    const card = document.createElement('div');
    card.className = 'table-card agent-session-card';
    card.style.marginBottom = '20px';

    let sessionsHTML = '';
    if (info.sessions.length === 0) {
      sessionsHTML = '<p style="color: #777; font-style: italic;">Sin sesiones registradas en este mes.</p>';
    } else {
      sessionsHTML = info.sessions.map(s => `
        <div class="session-block" style="border: 1px solid #e0e0e0; border-radius: 6px; padding: 12px; margin-top: 10px; background-color: #f9f9f9;">
          <div style="font-weight: bold; color: #2c3e50; margin-bottom: 8px; border-bottom: 1px solid #ddd; padding-bottom: 4px;">
            ${s.num} — Fecha: <span style="font-weight: normal;">${s.fecha}</span>
          </div>
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 8px; font-size: 0.9em;">
            <div><strong>URLTr:</strong> ${s.urlTr !== '-' ? `<a href="${s.urlTr}" target="_blank">Ver Enlace</a>` : '-'}</div>
            <div><strong>Speech:</strong> ${s.speech}</div>
            <div><strong>Producto:</strong> ${s.producto}</div>
            <div><strong>Objeciones:</strong> ${s.objeciones}</div>
            <div><strong>Cierre:</strong> ${s.cierre}</div>
            <div style="grid-column: 1 / -1;"><strong>Acuerdos + Estado:</strong> ${s.acuerdosEstado}</div>
          </div>
        </div>
      `).join('');
    }

    card.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #3498db; padding-bottom: 8px; margin-bottom: 12px;">
        <div>
          <h3 style="margin: 0; color: #2c3e50; display: inline-block; margin-right: 10px;">${info.agentName}</h3>
          <span style="background: #2c3e50; color: #fff; font-size: 0.78em; padding: 3px 8px; border-radius: 12px; font-weight: bold; vertical-align: middle;">
            📅 ${info.mesLabel}
          </span>
        </div>
        <span style="font-size: 0.85em; background: #e8f4fc; color: #2980b9; padding: 4px 8px; border-radius: 4px; font-weight: bold;">
          Status: ${info.status}
        </span>
      </div>
      <div style="font-size: 0.88em; color: #555; margin-bottom: 10px; display: flex; gap: 15px; flex-wrap: wrap;">
        <span><strong>Trainer:</strong> ${info.trainer}</span>
        <span><strong>Supervisor:</strong> ${info.supervisor}</span>
        <span><strong>Coordinador:</strong> ${info.coordinador}</span>
      </div>
      <div class="sessions-list">
        ${sessionsHTML}
      </div>
    `;

    container.appendChild(card);
  });
}

// MÁS FUNCIONES AÑADIDAS
function updateFilterButtonsUI() {
  document.getElementById('btn-critical-risk')?.classList.toggle('active', onlyCriticalRisk);
  document.getElementById('btn-consistent-green')?.classList.toggle('active', onlyConsistentGreen);
  document.getElementById('btn-regular-performers')?.classList.toggle('active', onlyRegularPerformers);
}

function toggleCriticalRiskFilter() {
  onlyCriticalRisk = !onlyCriticalRisk;
  if (onlyCriticalRisk) {
    onlyConsistentGreen = false;
    onlyRegularPerformers = false;
  }
  updateFilterButtonsUI();
  renderAllTables();
}

function toggleConsistentGreenFilter() {
  onlyConsistentGreen = !onlyConsistentGreen;
  if (onlyConsistentGreen) {
    onlyCriticalRisk = false;
    onlyRegularPerformers = false;
  }
  updateFilterButtonsUI();
  renderAllTables();
}

// Nueva función para el tercer botón
function toggleRegularPerformersFilter() {
  onlyRegularPerformers = !onlyRegularPerformers;
  if (onlyRegularPerformers) {
    onlyCriticalRisk = false;
    onlyConsistentGreen = false;
  }
  updateFilterButtonsUI();
  renderAllTables();
}

// Función para crear la etiqueta visual según la nota %
function getScoreBadge(valueStr) {
  if (!valueStr || valueStr === '-' || valueStr.trim() === '') return '-';
  
  let num = parseNum(valueStr);
  let colorClass = 'red';
  
  if (num >= 90) {
    colorClass = 'green';
  } else if (num >= 50) {
    colorClass = 'yellow';
  }

  return `<span class="score-badge ${colorClass}">${num.toFixed(1)}%</span>`;
}

function renderDiagnosticTable(data) {
  const tbody = document.querySelector('#diagnostic-table tbody');
  if (!tbody) return;
  tbody.innerHTML = '';

  if (!data || data.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;">No hay datos disponibles.</td></tr>';
    return;
  }

  const columns = [
    'NOTA HABILIDADES COMUNICATIVAS',
    'NOTA SONDEO',
    'NOTA PERSONALIZACIÓN',
    'NOTA MANEJO DE OBJECIONES',
    'NOTA CIERRE',
    'NOTA FINAL'
  ];

  // 1. Filtrar solo agentes que tienen al menos UNA nota válida
  let diagnosticAgents = data.filter(row => {
    return columns.some(col => {
      const val = getRowValue(row, col);
      return val && val !== '-' && val.trim() !== '';
    });
  });

  if (diagnosticAgents.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; padding: 20px;">No se encontraron agentes con evaluaciones de diagnóstico registradas.</td></tr>';
    return;
  }

  // 2. Aplicar ordenamiento si la columna está seleccionada
  const sortInfo = sortState['diagnostic-table'];
  if (sortInfo && sortInfo.column) {
    const col = sortInfo.column;
    const isAsc = sortInfo.isAsc;

    diagnosticAgents.sort((a, b) => {
      let valA = col === '_MES_ORIGEN' ? (a._MES_ORIGEN || '') : getRowValue(a, col);
      let valB = col === '_MES_ORIGEN' ? (b._MES_ORIGEN || '') : getRowValue(b, col);

      if (col !== 'PROMOTOR' && col !== '_MES_ORIGEN') {
        let numA = parseNum(valA);
        let numB = parseNum(valB);
        return isAsc ? numA - numB : numB - numA;
      }

      valA = valA.toLowerCase();
      valB = valB.toLowerCase();
      if (valA < valB) return isAsc ? -1 : 1;
      if (valA > valB) return isAsc ? 1 : -1;
      return 0;
    });
  }

  // 3. Generar filas
  diagnosticAgents.forEach(row => {
    const agent = getRowValue(row, 'PROMOTOR') || '-';
    
    // Obtener y formatear el mes
    const rawMes = row._MES_ORIGEN || '';
    const mesFormatted = rawMes ? (rawMes.charAt(0).toUpperCase() + rawMes.slice(1)) : '-';

    const habCom = getScoreBadge(getRowValue(row, 'NOTA HABILIDADES COMUNICATIVAS'));
    const sondeo = getScoreBadge(getRowValue(row, 'NOTA SONDEO'));
    const pers = getScoreBadge(getRowValue(row, 'NOTA PERSONALIZACIÓN'));
    const objeciones = getScoreBadge(getRowValue(row, 'NOTA MANEJO DE OBJECIONES'));
    const cierre = getScoreBadge(getRowValue(row, 'NOTA CIERRE'));
    const finalScore = getScoreBadge(getRowValue(row, 'NOTA FINAL'));

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${agent}</strong></td>
      <td><span style="background: #e2e8f0; color: #334155; padding: 2px 8px; border-radius: 4px; font-weight: 600; font-size: 0.85em;">${mesFormatted}</span></td>
      <td style="text-align:center;">${habCom}</td>
      <td style="text-align:center;">${sondeo}</td>
      <td style="text-align:center;">${pers}</td>
      <td style="text-align:center;">${objeciones}</td>
      <td style="text-align:center;">${cierre}</td>
      <td style="text-align:center;"><strong>${finalScore}</strong></td>
    `;
    tbody.appendChild(tr);
  });
}

// ==========================================
// 7. INICIALIZACIÓN
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
  populateMonthSelector();
  
  const searchInput = document.getElementById('filter-search');
  if (searchInput) {
    searchInput.addEventListener('input', filterData);
  }

  document.getElementById('filter-mes').addEventListener('change', loadDashboardData);
  document.getElementById('btn-reset').addEventListener('click', resetAllFilters);
  preloadAllMonths();
});
