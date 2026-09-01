// ==========================================
// 1. ENLACES DIRECTOS A GOOGLE SHEETS
// ==========================================
const MONTH_URLS = {
  febrero: `https://docs.google.com/spreadsheets/d/e/2PACX-1vS8XA4ddmXQF3tJcKew8WhY5Tr8LfjX1E2hkHWZG4u7w8ASutVxoF5jyOinttJyNr1yXpKv6ueoxsUZ/pub?gid=0&single=true&output=csv`,
  marzo: `https://docs.google.com/spreadsheets/d/e/2PACX-1vS8XA4ddmXQF3tJcKew8WhY5Tr8LfjX1E2hkHWZG4u7w8ASutVxoF5jyOinttJyNr1yXpKv6ueoxsUZ/pub?gid=397555912&single=true&output=csv`,
  abril: `https://docs.google.com/spreadsheets/d/e/2PACX-1vS8XA4ddmXQF3tJcKew8WhY5Tr8LfjX1E2hkHWZG4u7w8ASutVxoF5jyOinttJyNr1yXpKv6ueoxsUZ/pub?gid=1499336465&single=true&output=csv`,
  mayo: `https://docs.google.com/spreadsheets/d/e/2PACX-1vS8XA4ddmXQF3tJcKew8WhY5Tr8LfjX1E2hkHWZG4u7w8ASutVxoF5jyOinttJyNr1yXpKv6ueoxsUZ/pub?gid=289433826&single=true&output=csv`,
  junio: `https://docs.google.com/spreadsheets/d/e/2PACX-1vS8XA4ddmXQF3tJcKew8WhY5Tr8LfjX1E2hkHWZG4u7w8ASutVxoF5jyOinttJyNr1yXpKv6ueoxsUZ/pub?gid=632786864&single=true&output=csv`
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

// Función encargada de traer únicamente los datos del mes en curso con bypass de caché
async function fetchCurrentMonthData() {
  const monthKeys = Object.keys(MONTH_URLS);
  const lastMonthKey = monthKeys[monthKeys.length - 1];
  const freshUrl = `${MONTH_URLS[lastMonthKey]}&_cb=${Date.now()}`;

  await new Promise((resolve) => {
    Papa.parse(freshUrl, {
      download: true,
      header: true,
      skipEmptyLines: 'greedy',
      transformHeader: h => (h ? h.replace(/<[^>]*>/g, '').replace(/[\r\n]/g, '').trim() : ''),
      complete: res => {
        allMonthsData[lastMonthKey] = (res.data || [])
          .map(r => ({ ...r, _MES_ORIGEN: lastMonthKey }))
          .filter(r => getRowValue(r, 'PROMOTOR') !== '');
        resolve();
      },
      error: () => resolve()
    });
  });

  loadDashboardData();
}

async function preloadAllMonths() {
  const monthKeys = Object.keys(MONTH_URLS);
  const lastMonthKey = monthKeys[monthKeys.length - 1];

  const HISTORICAL_CACHE_KEY = 'dashboard_historical_months_v2';
  let cachedHistorical = localStorage.getItem(HISTORICAL_CACHE_KEY);
  let historicalData = cachedHistorical ? JSON.parse(cachedHistorical) : {};

  // 1. Cargar meses antiguos solo si no están guardados en caché
  const missingHistorical = monthKeys.filter(m => m !== lastMonthKey && !historicalData[m]);

  if (missingHistorical.length > 0) {
    const historicalPromises = missingHistorical.map(month => new Promise((resolve) => {
      Papa.parse(MONTH_URLS[month], {
        download: true,
        header: true,
        skipEmptyLines: 'greedy',
        transformHeader: h => (h ? h.replace(/<[^>]*>/g, '').replace(/[\r\n]/g, '').trim() : ''),
        complete: res => resolve({ 
          month, 
          data: (res.data || []).map(r => ({ ...r, _MES_ORIGEN: month })).filter(r => getRowValue(r, 'PROMOTOR') !== '') 
        }),
        error: () => resolve({ month, data: [] })
      });
    }));

    const results = await Promise.all(historicalPromises);
    results.forEach(res => { historicalData[res.month] = res.data; });
    localStorage.setItem(HISTORICAL_CACHE_KEY, JSON.stringify(historicalData));
  }

  // Asignar los meses históricos guardados
  allMonthsData = { ...historicalData };

  // 2. Descargar en vivo el mes actual
  await fetchCurrentMonthData();
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
          // Envuelve el mes actual con el recuadro destacado
          return `<span class="active-month-badge">${nameFormatted}</span>`;
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

  renderHeaderSummary();

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

  const activeSubtab = document.querySelector('#tab-trends .subtab-button.active');
  if (activeSubtab && activeSubtab.textContent.includes('Líder')) {
    renderTrendsLeaderTable();
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

// TABLA FOCO: Matriz por Agente con Cierre, Cumpl. % por Mes, Gráficos y Ordenamiento Completo
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

  const currentSort = sortState['focus-table'] || { column: null, isAsc: true };

  // Construcción dinámica de la cabecera con eventos de click para ordenar
  let headerHTML = `<tr><th onclick="handleSort('focus-table', 'PROMOTOR')" style="cursor:pointer;">Agente</th>`;
  monthsToDisplay.forEach(m => {
    const mesFormatted = m.charAt(0).toUpperCase() + m.slice(1);
    const colCierre = `cierre_${m}`;
    const colCumpl = `cumplimiento_${m}`;

    headerHTML += `<th onclick="handleSort('focus-table', '${colCierre}')" style="text-align:center; cursor:pointer;">Cierre (${mesFormatted})</th>`;
    headerHTML += `<th onclick="handleSort('focus-table', '${colCumpl}')" style="text-align:center; cursor:pointer;">Cumpl. % (${mesFormatted})</th>`;
  });
  headerHTML += '<th style="text-align:center; min-width: 180px;">Gráfico de Performance</th></tr>';
  thead.innerHTML = headerHTML;

  // 1. Mapear todo el historial por promotor
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
    agentsList = agentsList.filter(agent => 
      !hasThreeConsecutiveLowMonths(agent.monthsData) && 
      !hasTwoConsecutiveGreenMonths(agent.monthsData)
    );
  }

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

  // 4. Lógica de Ordenamiento por Agente, Cierre o Cumplimiento
  if (currentSort.column) {
    const colKey = currentSort.column;
    const isAsc = currentSort.isAsc;

    agentsList.sort((a, b) => {
      if (colKey === 'PROMOTOR') {
        const valA = a.agentName.toLowerCase();
        const valB = b.agentName.toLowerCase();
        if (valA < valB) return isAsc ? -1 : 1;
        if (valA > valB) return isAsc ? 1 : -1;
        return 0;
      } else if (colKey.startsWith('cierre_')) {
        const month = colKey.replace('cierre_', '');
        const valA = a.monthsData[month] ? a.monthsData[month].cierre : 0;
        const valB = b.monthsData[month] ? b.monthsData[month].cierre : 0;
        return isAsc ? valA - valB : valB - valA;
      } else if (colKey.startsWith('cumplimiento_')) {
        const month = colKey.replace('cumplimiento_', '');
        const valA = a.monthsData[month] ? parseNum(a.monthsData[month].cumplimiento) : 0;
        const valB = b.monthsData[month] ? parseNum(b.monthsData[month].cumplimiento) : 0;
        return isAsc ? valA - valB : valB - valA;
      }
      return 0;
    });
  }

  // 5. Renderizado
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
          animation: false,
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

let agentTrendsChartInstances = {};

function renderTrendsTable() {
  const container = document.getElementById('agent-trends-cards-container');
  if (!container) return;
  
  // Limpiar instancias de gráficos anteriores
  Object.values(agentTrendsChartInstances).forEach(chart => chart.destroy());
  agentTrendsChartInstances = {};
  container.innerHTML = '';

  const searchVal = document.getElementById('filter-search')?.value.toLowerCase().trim() || '';
  const trainerVal = document.getElementById('filter-trainer')?.value;
  const supervisorVal = document.getElementById('filter-supervisor')?.value;
  const coordinadorVal = document.getElementById('filter-coordinador')?.value;
  const statusVal = document.getElementById('filter-status')?.value;

  // 1. Agrupar la información histórica por cada Agente
  const agentsHistory = {};
  const monthKeys = Object.keys(allMonthsData);

  monthKeys.forEach(monthKey => {
    const monthData = allMonthsData[monthKey] || [];
    
    monthData.forEach(row => {
      const agent = getRowValue(row, 'PROMOTOR');
      if (!agent) return;

      const matchSearch = !searchVal || agent.toLowerCase().includes(searchVal);
      const matchTrainer = !trainerVal || getRowValue(row, 'TRAINER') === trainerVal;
      const matchSupervisor = !supervisorVal || getRowValue(row, 'SUPERVISOR') === supervisorVal;
      const matchCoordinador = !coordinadorVal || getRowValue(row, 'COORDINADOR') === coordinadorVal;
      const matchStatus = !statusVal || getRowValue(row, 'STATUS AGENTE') === statusVal;

      if (matchSearch && matchTrainer && matchSupervisor && matchCoordinador && matchStatus) {
        if (!agentsHistory[agent]) {
          agentsHistory[agent] = {
            trainer: getRowValue(row, 'TRAINER') || '-',
            supervisor: getRowValue(row, 'SUPERVISOR') || '-',
            months: {}
          };
        }
        agentsHistory[agent].months[monthKey] = {
          v1: parseNum(getRowValue(row, 'V1')),
          v2: parseNum(getRowValue(row, 'V2')),
          v3: parseNum(getRowValue(row, 'V3')),
          v4: parseNum(getRowValue(row, 'V4')),
          v5: parseNum(getRowValue(row, 'V5')),
          meta: parseNum(getRowValue(row, 'META'))
        };
      }
    });
  });

  const agentNames = Object.keys(agentsHistory);
  if (agentNames.length === 0) {
    container.innerHTML = '<div class="table-card" style="text-align:center; width: 100%;">No hay datos disponibles para los filtros seleccionados.</div>';
    return;
  }

  // 2. Renderizar recuadros por Agente filtrando meses vacíos
  agentNames.forEach((agent, index) => {
    const info = agentsHistory[agent];
    
    const activeLabels = [];
    const v1Data = [], v2Data = [], v3Data = [], v4Data = [], v5Data = [], metaData = [];

    // Evaluar cada mes y filtrar los que no tienen actividad (ventas o meta)
    monthKeys.forEach(m => {
      const dataM = info.months[m] || { v1: 0, v2: 0, v3: 0, v4: 0, v5: 0, meta: 0 };
      const totalVentas = dataM.v1 + dataM.v2 + dataM.v3 + dataM.v4 + dataM.v5;

      // Solo incluye el mes si la meta > 0 o si hay al menos una venta
      if (dataM.meta > 0 || totalVentas > 0) {
        activeLabels.push(m.charAt(0).toUpperCase() + m.slice(1));
        v1Data.push(dataM.v1);
        v2Data.push(dataM.v2);
        v3Data.push(dataM.v3);
        v4Data.push(dataM.v4);
        v5Data.push(dataM.v5);
        metaData.push(dataM.meta);
      }
    });

    // Si el agente no tiene meses con actividad real, se omite su recuadro
    if (activeLabels.length === 0) return;

    const card = document.createElement('div');
    card.className = 'agent-trend-card';
    const canvasId = `chart-trend-agent-${index}`;

    card.innerHTML = `
      <div class="agent-trend-header">
        <h3>${agent}</h3>
        <p style="font-size: 0.8rem; color: #64748b; margin-top: 2px;">
          <strong>Supervisor:</strong> ${info.supervisor} | <strong>Trainer:</strong> ${info.trainer}
        </p>
      </div>
      <div class="agent-chart-container">
        <canvas id="${canvasId}"></canvas>
      </div>
    `;

    container.appendChild(card);

    // 3. Crear el gráfico utilizando únicamente los meses activos
    const ctx = document.getElementById(canvasId)?.getContext('2d');
    if (ctx) {
      agentTrendsChartInstances[canvasId] = new Chart(ctx, {
        type: 'bar',
        data: {
          labels: activeLabels,
          datasets: [
            { label: 'V1', data: v1Data, backgroundColor: '#3b82f6', stack: 'ventas' },
            { label: 'V2', data: v2Data, backgroundColor: '#60a5fa', stack: 'ventas' },
            { label: 'V3', data: v3Data, backgroundColor: '#93c5fd', stack: 'ventas' },
            { label: 'V4', data: v4Data, backgroundColor: '#bfdbfe', stack: 'ventas' },
            { label: 'V5', data: v5Data, backgroundColor: '#dbeafe', stack: 'ventas' },
            { label: 'Meta', data: metaData, backgroundColor: '#ef4444', stack: 'meta' }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 10 } } },
            tooltip: { mode: 'index', intersect: false }
          },
          scales: {
            x: { stacked: true },
            y: { stacked: true, beginAtZero: true }
          }
        }
      });
    }
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

  const cardsWithSessions = Object.keys(agentMonthMap).filter(key => agentMonthMap[key].sessions.length > 0);

  if (cardsWithSessions.length === 0) {
    container.innerHTML = '<div class="table-card" style="text-align:center; padding: 20px;">No se encontraron sesiones registradas para los filtros aplicados.</div>';
    return;
  }

  cardsWithSessions.forEach(key => {
    const info = agentMonthMap[key];
    const card = document.createElement('div');
    card.className = 'table-card agent-session-card';
    card.style.marginBottom = '20px';

    const sessionsHTML = info.sessions.map(s => `
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

function toggleRegularPerformersFilter() {
  onlyRegularPerformers = !onlyRegularPerformers;
  if (onlyRegularPerformers) {
    onlyCriticalRisk = false;
    onlyConsistentGreen = false;
  }
  updateFilterButtonsUI();
  renderAllTables();
}

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
    tbody.innerHTML = '<tr><td colspan="10" style="text-align:center;">No hay datos disponibles.</td></tr>';
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

  let diagnosticAgents = data.filter(row => {
    return columns.some(col => {
      const val = getRowValue(row, col);
      return val && val !== '-' && val.trim() !== '';
    });
  });

  if (diagnosticAgents.length === 0) {
    tbody.innerHTML = '<tr><td colspan="10" style="text-align:center; padding: 20px;">No se encontraron agentes con evaluaciones de diagnóstico registradas.</td></tr>';
    return;
  }

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

  diagnosticAgents.forEach(row => {
    const agent = getRowValue(row, 'PROMOTOR') || '-';
    
    const rawMes = row._MES_ORIGEN || '';
    const mesFormatted = rawMes ? (rawMes.charAt(0).toUpperCase() + rawMes.slice(1)) : '-';
    
    const habCom = getScoreBadge(getRowValue(row, 'NOTA HABILIDADES COMUNICATIVAS'));
    const sondeo = getScoreBadge(getRowValue(row, 'NOTA SONDEO'));
    const pers = getScoreBadge(getRowValue(row, 'NOTA PERSONALIZACIÓN'));
    const objeciones = getScoreBadge(getRowValue(row, 'NOTA MANEJO DE OBJECIONES'));
    const cierreNota = getScoreBadge(getRowValue(row, 'NOTA CIERRE'));
    const finalScore = getScoreBadge(getRowValue(row, 'NOTA FINAL'));

    const cierreVentasVal = getRowValue(row, 'CIERRE');
    const cierreVentasDisplay = cierreVentasVal !== '' ? cierreVentasVal : '0';

    const complianceVal = getRowValue(row, 'CUMPLIMIENTO MES');
    const complianceHTML = getComplianceBadge(complianceVal);

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${agent}</strong></td>
      <td><span style="background: #e2e8f0; color: #334155; padding: 2px 8px; border-radius: 4px; font-weight: 600; font-size: 0.85em;">${mesFormatted}</span></td>
      <td style="text-align:center;">${habCom}</td>
      <td style="text-align:center;">${sondeo}</td>
      <td style="text-align:center;">${pers}</td>
      <td style="text-align:center;">${objeciones}</td>
      <td style="text-align:center;">${cierreNota}</td>
      <td style="text-align:center;"><strong>${finalScore}</strong></td>
      <td style="text-align:center;"><strong>${cierreVentasDisplay}</strong></td>
      <td style="text-align:center;">${complianceHTML}</td>
    `;
    tbody.appendChild(tr);
  });
}

function switchSubTab(subTabName, evt) {
  document.querySelectorAll('#tab-trends .subtab-content').forEach(el => {
    el.style.display = 'none';
  });

  document.querySelectorAll('#tab-trends .subtab-button').forEach(btn => {
    btn.classList.remove('active');
  });

  const targetSubTab = document.getElementById(`subtab-${subTabName}`);
  if (targetSubTab) {
    targetSubTab.style.display = 'block';
  }

  if (evt && evt.currentTarget) {
    evt.currentTarget.classList.add('active');
  }

  if (subTabName === 'trends-agent') {
    renderTrendsTable();
  } else if (subTabName === 'trends-leader') {
    renderTrendsLeaderTable();
  }
}

function renderTrendsLeaderTable() {
  const tbody = document.querySelector('#trends-leader-table tbody');
  if (!tbody) return;
  tbody.innerHTML = '';

  const monthKeys = Object.keys(allMonthsData);
  if (monthKeys.length === 0) {
    tbody.innerHTML = '<tr><td colspan="12" style="text-align:center;">No hay datos disponibles.</td></tr>';
    return;
  }

  const searchVal = document.getElementById('filter-search')?.value.toLowerCase().trim() || '';
  const trainerVal = document.getElementById('filter-trainer')?.value;
  const supervisorVal = document.getElementById('filter-supervisor')?.value;
  const coordinadorVal = document.getElementById('filter-coordinador')?.value;
  const statusVal = document.getElementById('filter-status')?.value;

  let hasData = false;

  monthKeys.forEach(monthKey => {
    const monthData = allMonthsData[monthKey] || [];
    
    const filteredMonthData = monthData.filter(item => {
      const agentName = getRowValue(item, 'PROMOTOR').toLowerCase();
      const matchSearch = !searchVal || agentName.includes(searchVal);
      const matchTrainer = !trainerVal || getRowValue(item, 'TRAINER') === trainerVal;
      const matchSupervisor = !supervisorVal || getRowValue(item, 'SUPERVISOR') === supervisorVal;
      const matchCoordinador = !coordinadorVal || getRowValue(item, 'COORDINADOR') === coordinadorVal;
      const matchStatus = !statusVal || getRowValue(item, 'STATUS AGENTE') === statusVal;
      return matchSearch && matchTrainer && matchSupervisor && matchCoordinador && matchStatus;
    });

    if (filteredMonthData.length === 0) return;

    const leaderMap = {};
    filteredMonthData.forEach(row => {
      const sup = getRowValue(row, 'SUPERVISOR') || 'Sin Supervisor';
      if (!leaderMap[sup]) {
        leaderMap[sup] = {
          leader: sup,
          role: 'Supervisor',
          count: 0, meta: 0, v1: 0, v2: 0, v3: 0, v4: 0, v5: 0, cierre: 0
        };
      }
      leaderMap[sup].count++;
      leaderMap[sup].meta += parseNum(getRowValue(row, 'META'));
      leaderMap[sup].v1 += parseNum(getRowValue(row, 'V1'));
      leaderMap[sup].v2 += parseNum(getRowValue(row, 'V2'));
      leaderMap[sup].v3 += parseNum(getRowValue(row, 'V3'));
      leaderMap[sup].v4 += parseNum(getRowValue(row, 'V4'));
      leaderMap[sup].v5 += parseNum(getRowValue(row, 'V5'));
      leaderMap[sup].cierre += parseNum(getRowValue(row, 'CIERRE'));
    });

    const monthFormatted = monthKey.charAt(0).toUpperCase() + monthKey.slice(1);

    Object.values(leaderMap).forEach(l => {
      hasData = true;
      const pct = l.meta > 0 ? (l.cierre / l.meta) * 100 : 0;
      const complianceHTML = getComplianceBadge(pct.toString());

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><strong>${monthFormatted} 2026</strong></td>
        <td><strong>${l.leader}</strong></td>
        <td><span style="font-size: 0.8em; background: #e0f2fe; color: #0369a1; padding: 2px 6px; border-radius: 4px;">${l.role}</span></td>
        <td>${l.count}</td>
        <td>${l.meta}</td>
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
  });

  if (!hasData) {
    tbody.innerHTML = '<tr><td colspan="12" style="text-align:center;">No hay datos disponibles para los filtros seleccionados.</td></tr>';
  }
}

function renderHeaderSummary() {
  const monthKeys = Object.keys(allMonthsData);
  if (monthKeys.length === 0) return;

  const lastMonthKey = monthKeys[monthKeys.length - 1];
  const lastMonthData = allMonthsData[lastMonthKey] || [];
  const lastMonthFormatted = lastMonthKey.charAt(0).toUpperCase() + lastMonthKey.slice(1);

  const activeAgentsLastMonth = new Set(
    lastMonthData
      .map(row => getRowValue(row, 'PROMOTOR'))
      .filter(name => name && name.trim() !== '')
  );

  const totalActive = activeAgentsLastMonth.size;

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

  let countCriticalRisk = 0;
  let countConsistentGreen = 0;

  activeAgentsLastMonth.forEach(agentName => {
    const agentObj = fullAgentsMap[agentName];
    if (agentObj) {
      if (hasThreeConsecutiveLowMonths(agentObj.monthsData)) {
        countCriticalRisk++;
      }
      if (hasTwoConsecutiveGreenMonths(agentObj.monthsData)) {
        countConsistentGreen++;
      }
    }
  });

  let sumDiagnostic = 0;
  let countDiagnostic = 0;

  Object.keys(allMonthsData).forEach(m => {
    allMonthsData[m].forEach(row => {
      const finalNote = getRowValue(row, 'NOTA FINAL');
      if (finalNote && finalNote !== '-' && finalNote.trim() !== '') {
        sumDiagnostic += parseNum(finalNote);
        countDiagnostic++;
      }
    });
  });

  const avgQuality = countDiagnostic > 0 ? (sumDiagnostic / countDiagnostic).toFixed(1) : 0;

  const elActive = document.getElementById('kpi-active-agents');
  const elActiveMonth = document.getElementById('kpi-active-month');
  const elRisk = document.getElementById('kpi-critical-risk');
  const elGreen = document.getElementById('kpi-consistent-green');
  const elQuality = document.getElementById('kpi-avg-quality');

  if (elActive) elActive.textContent = totalActive;
  if (elActiveMonth) elActiveMonth.textContent = `Mes: ${lastMonthFormatted} 2026`;
  if (elRisk) elRisk.textContent = countCriticalRisk;
  if (elGreen) elGreen.textContent = countConsistentGreen;
  if (elQuality) elQuality.textContent = `${avgQuality}%`;
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

  // Polling automático cada 2 minutos (120,000 ms) para recargar el mes en curso sin recargar la página
  setInterval(() => {
    fetchCurrentMonthData();
  }, 120000);
});