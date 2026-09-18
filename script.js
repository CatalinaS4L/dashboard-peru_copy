// ==========================================
// 1. ENLACES DIRECTOS A GOOGLE SHEETS
// ==========================================
const MONTH_URLS = {
  febrero: `https://docs.google.com/spreadsheets/d/e/2PACX-1vRlckyPnPqEGlq9J9wk_1HwxkfHQqt6X4wHxNtPpRg-RRATO3asLAigUxUyin9D1OS0joXIpJkG8-tL/pub?gid=0&single=true&output=csv`,
  marzo: `https://docs.google.com/spreadsheets/d/e/2PACX-1vRlckyPnPqEGlq9J9wk_1HwxkfHQqt6X4wHxNtPpRg-RRATO3asLAigUxUyin9D1OS0joXIpJkG8-tL/pub?gid=397555912&single=true&output=csv`,
  abril: `https://docs.google.com/spreadsheets/d/e/2PACX-1vRlckyPnPqEGlq9J9wk_1HwxkfHQqt6X4wHxNtPpRg-RRATO3asLAigUxUyin9D1OS0joXIpJkG8-tL/pub?gid=1499336465&single=true&output=csv`,
  mayo: `https://docs.google.com/spreadsheets/d/e/2PACX-1vRlckyPnPqEGlq9J9wk_1HwxkfHQqt6X4wHxNtPpRg-RRATO3asLAigUxUyin9D1OS0joXIpJkG8-tL/pub?gid=289433826&single=true&output=csv`,
  junio: `https://docs.google.com/spreadsheets/d/e/2PACX-1vRlckyPnPqEGlq9J9wk_1HwxkfHQqt6X4wHxNtPpRg-RRATO3asLAigUxUyin9D1OS0joXIpJkG8-tL/pub?gid=632786864&single=true&output=csv`,
  julio: `https://docs.google.com/spreadsheets/d/e/2PACX-1vRlckyPnPqEGlq9J9wk_1HwxkfHQqt6X4wHxNtPpRg-RRATO3asLAigUxUyin9D1OS0joXIpJkG8-tL/pub?gid=264290748&single=true&output=csv`,
  agosto: `https://docs.google.com/spreadsheets/d/e/2PACX-1vRlckyPnPqEGlq9J9wk_1HwxkfHQqt6X4wHxNtPpRg-RRATO3asLAigUxUyin9D1OS0joXIpJkG8-tL/pub?gid=1822972942&single=true&output=csv`
};

const SUPERVISOR_COLORS = [
  '#2563eb', '#10b981', '#f59e0b', '#ef4444', 
  '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16', 
  '#f97316', '#6366f1', '#14b8a6', '#d97706'
];

let allMonthsData = {};
let rawData = [];
let filteredData = [];
let focusCharts = [];
let scatterChartInstance = null;

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

function filterRow(row) {
  const searchVal = document.getElementById('filter-search')?.value.toLowerCase().trim() || '';
  const trainerVal = document.getElementById('filter-trainer')?.value || '';
  const supervisorVal = document.getElementById('filter-supervisor')?.value || '';
  const coordinadorVal = document.getElementById('filter-coordinador')?.value || '';
  const statusVal = document.getElementById('filter-status')?.value || '';

  const agent = getRowValue(row, 'PROMOTOR').toLowerCase();
  const matchSearch = !searchVal || agent.includes(searchVal);
  const matchTrainer = !trainerVal || getRowValue(row, 'TRAINER') === trainerVal;
  const matchSupervisor = !supervisorVal || getRowValue(row, 'SUPERVISOR') === supervisorVal;
  const matchCoordinador = !coordinadorVal || getRowValue(row, 'COORDINADOR') === coordinadorVal;
  const matchStatus = !statusVal || getRowValue(row, 'STATUS AGENTE') === statusVal;

  return matchSearch && matchTrainer && matchSupervisor && matchCoordinador && matchStatus;
}

// Lista de etiquetas clave para delimitar el parser de las sesiones
const EXACT_KEYWORDS = [
  "📅 Fecha", "🔗 URLTr", "🗣️ Speech", "📚 Producto", "🛡️ Objeciones", "🤝 Cierre", "📌 Acuerdos \\+ Estado"
];

function parseSessionField(fullText, exactLabel) {
  if (!fullText) return '-';
  
  // Escapar la etiqueta buscada para usarla dentro de la Regex
  const escapedLabel = exactLabel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const lookaheadPattern = EXACT_KEYWORDS.join('|');
  
  // Expresión regular corregida:
  // consume únicamente los separadores pegados al título, permitiendo "-" internos en las respuestas.
  const regex = new RegExp(
    `${escapedLabel}(?:\\s*[:\\-=])?\\s*([\\s\\S]*?)(?=(?:\\n\\s*)?(?:${lookaheadPattern})|$)`, 
    'i'
  );
  
  const match = fullText.match(regex);
  if (match && match[1]) {
    const val = match[1].trim();
    return val !== '' ? val : '-';
  }
  return '-';
}

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

  allMonthsData = { ...historicalData };
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
    const activeSubtab = document.querySelector('#tab-trends .subtab-button.active');
    if (activeSubtab) {
      if (activeSubtab.textContent.includes('Líder')) {
        renderTrendsLeaderTable();
      } else if (activeSubtab.textContent.includes('Global')) {
        renderTrendsGlobalTable();
      } else {
        renderTrendsTable();
      }
    }
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

  const currentVal = select.value;
  select.innerHTML = '<option value="">Todos</option>';

  options.sort().forEach(opt => {
    const option = document.createElement('option');
    option.value = opt;
    option.textContent = opt;
    select.appendChild(option);
  });

  if (options.includes(currentVal)) {
    select.value = currentVal;
  }

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

  Object.keys(sortState).forEach(tableId => {
    sortState[tableId] = { column: null, isAsc: true };
  });

  loadDashboardData();
}

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

function switchTab(tabName, evt) {
  if (tabName !== 'focus') {
    if (onlyCriticalRisk) toggleCriticalRiskFilter();
    if (onlyConsistentGreen) toggleConsistentGreenFilter();
    if (onlyRegularPerformers) toggleRegularPerformersFilter();
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

  if (tabName === 'focus' && tabFocus) tabFocus.style.display = 'block';
  if (tabName === 'agents' && tabAgents) tabAgents.style.display = 'block';
  if (tabName === 'leaders' && tabLeaders) tabLeaders.style.display = 'block';
  if (tabName === 'trends' && tabTrends) {
    tabTrends.style.display = 'block';
    const activeSubtab = document.querySelector('#tab-trends .subtab-button.active');
    if (activeSubtab && activeSubtab.textContent.includes('Líder')) {
      renderTrendsLeaderTable();
    } else if (activeSubtab && activeSubtab.textContent.includes('Global')) {
      renderTrendsGlobalTable();
    } else {
      renderTrendsTable();
    }
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

  let headerHTML = `<tr><th onclick="handleSort('focus-table', 'PROMOTOR')" style="cursor:pointer;">Agente</th>`;
  monthsToDisplay.forEach(m => {
    const mesFormatted = m.charAt(0).toUpperCase() + m.slice(1);
    const colCierre = `cierre_${m}`;
    const colCumpl = `cumplimiento_${m}`;

    headerHTML += `<th onclick="handleSort('focus-table', '${colCierre}')" style="text-align:center; cursor:pointer;">Cierre (${mesFormatted})</th>`;
    headerHTML += `<th onclick="handleSort('focus-table', '${colCumpl}')" style="text-align:center; cursor:pointer;">Cumpl. % (${mesFormatted})</th>`;
  });
  headerHTML += `</tr>`;
  thead.innerHTML = headerHTML;

  const fullAgentsMap = {};
  const monthKeys = Object.keys(allMonthsData);
  const lastMonthKey = monthKeys[monthKeys.length - 1];

  Object.keys(allMonthsData).forEach(m => {
    allMonthsData[m].forEach(row => {
      const agentName = getRowValue(row, 'PROMOTOR');
      if (!agentName) return;

      if (!fullAgentsMap[agentName]) {
        fullAgentsMap[agentName] = { 
          agentName: agentName, 
          monthsData: {},
          lastMonthStatus: '' 
        };
      }

      fullAgentsMap[agentName].monthsData[m] = {
        cierre: parseNum(getRowValue(row, 'CIERRE')),
        cumplimiento: getRowValue(row, 'CUMPLIMIENTO MES') || '-'
      };

      if (m === lastMonthKey) {
        fullAgentsMap[agentName].lastMonthStatus = getRowValue(row, 'STATUS AGENTE').toUpperCase();
      }
    });
  });

  const agentsMap = {};
  data.forEach(row => {
    const agentName = getRowValue(row, 'PROMOTOR');
    if (!agentName) return;

    if (!agentsMap[agentName]) {
      agentsMap[agentName] = fullAgentsMap[agentName] || { agentName: agentName, monthsData: {}, lastMonthStatus: '' };
    }
  });

  let agentsList = Object.values(agentsMap);

  if (onlyCriticalRisk) {
    agentsList = agentsList.filter(agent => {
      const isActive = agent.lastMonthStatus.includes('ACTIVO');
      return isActive && hasThreeConsecutiveLowMonths(agent.monthsData);
    });
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
      emptyMessage = '⚠️ No hay ningún Promotor ACTIVO en Riesgo Crítico (3 meses seguidos < 50%) con los filtros aplicados.';
    } else if (onlyConsistentGreen) {
      emptyMessage = '🌟 No hay ningún Promotor con 2 meses consecutivos en verde (≥ 90%) con los filtros aplicados.';
    } else if (onlyRegularPerformers) {
      emptyMessage = '📊 No hay ningún Promotor en categoría Regular con los filtros aplicados.';
    }
    const totalCols = (monthsToDisplay.length * 2) + 1;
    tbody.innerHTML = `<tr><td colspan="${totalCols}" style="text-align:center; padding: 20px; font-weight: bold; color: #555;">${emptyMessage}</td></tr>`;
    return;
  }

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

  agentsList.forEach((agent) => {
    const tr = document.createElement('tr');
    let rowHTML = `<td><strong>${agent.agentName}</strong></td>`;

    monthsToDisplay.forEach(m => {
      const monthRecord = agent.monthsData[m];

      if (monthRecord) {
        const cierre = monthRecord.cierre;
        const cumplHTML = getComplianceBadge(monthRecord.cumplimiento);
        rowHTML += `<td style="text-align:center;">${cierre}</td>`;
        rowHTML += `<td style="text-align:center;">${cumplHTML}</td>`;
      } else {
        rowHTML += `<td style="text-align:center; color: #999;">-</td>`;
        rowHTML += `<td style="text-align:center; color: #999;">-</td>`;
      }
    });

    tr.innerHTML = rowHTML;
    tbody.appendChild(tr);
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
  
  Object.values(agentTrendsChartInstances).forEach(chart => chart.destroy());
  agentTrendsChartInstances = {};
  container.innerHTML = '';

  const agentsHistory = {};
  const monthKeys = Object.keys(allMonthsData);

  monthKeys.forEach(monthKey => {
    const monthData = allMonthsData[monthKey] || [];
    
    monthData.forEach(row => {
      const agent = getRowValue(row, 'PROMOTOR');
      if (!agent) return;

      if (filterRow(row)) {
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

  agentNames.forEach((agent, index) => {
    const info = agentsHistory[agent];
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

    const labels = monthKeys.map(m => m.charAt(0).toUpperCase() + m.slice(1));
    const v1Data = [], v2Data = [], v3Data = [], v4Data = [], v5Data = [], metaData = [];

    monthKeys.forEach(m => {
      const dataM = info.months[m] || { v1: 0, v2: 0, v3: 0, v4: 0, v5: 0, meta: 0 };
      v1Data.push(dataM.v1);
      v2Data.push(dataM.v2);
      v3Data.push(dataM.v3);
      v4Data.push(dataM.v4);
      v5Data.push(dataM.v5);
      metaData.push(dataM.meta);
    });

    const ctx = document.getElementById(canvasId)?.getContext('2d');
    if (ctx) {
      agentTrendsChartInstances[canvasId] = new Chart(ctx, {
        type: 'bar',
        data: {
          labels: labels,
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
          let speech = parseSessionField(rawCellContent, '🗣️ Speech');
          let producto = parseSessionField(rawCellContent, '📚 Producto');
          let objeciones = parseSessionField(rawCellContent, '🛡️ Objeciones');
          let cierre = parseSessionField(rawCellContent, '🤝 Cierre');
          let acuerdosEstado = parseSessionField(rawCellContent, '📌 Acuerdos \\+ Estado');

          if (fecha === '-') {
            const dateMatch = rawCellContent.match(/\d{1,2}[\/\.-]\d{1,2}[\/\.-]\d{2,4}/);
            if (dateMatch) fecha = dateMatch[0];
          }

          agentMonthMap[uniqueKey].sessions.push({
            num: numSesion ? `Sesión ${numSesion}` : key,
            fecha: fecha,
            speech: speech,
            producto: producto,
            objeciones: objeciones,
            cierre: cierre,
            acuerdosEstado: acuerdosEstado
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
          <div><strong>Speech:</strong> ${s.speech}</div>
          <div><strong>Producto:</strong> ${s.producto}</div>
          <div><strong>Objeciones:</strong> ${s.objeciones}</div>
          <div><strong>Cierre:</strong> ${s.cierre}</div>
          <div style="grid-column: 1 / -1;"><strong>Acuerdos + Estado:</strong> ${s.acuerdosEstado}</div>
        </div>
      </div>
    `).join('');

    card.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #06b706; padding-bottom: 8px; margin-bottom: 12px;">
        <div>
          <h3 style="margin: 0; color: #2c3e50; display: inline-block; margin-right: 10px;">${info.agentName}</h3>
          <span style="background: #2c3e50; color: #fff; font-size: 0.78em; padding: 3px 8px; border-radius: 12px; font-weight: bold; vertical-align: middle;">
            📅 ${info.mesLabel}
          </span>
        </div>
        <span style="font-size: 0.85em; background: #e8f4fc; color: #2563eb; padding: 4px 8px; border-radius: 4px; font-weight: bold;">
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

function renderQualityScatterPlot(data) {
  const canvas = document.getElementById('chartQualityVsPerformance');
  if (!canvas) return;

  const validData = data.filter(row => {
    const nota = getRowValue(row, 'NOTA FINAL');
    const cumpl = getRowValue(row, 'CUMPLIMIENTO MES');
    return nota && nota !== '-' && cumpl && cumpl !== '-';
  });

  if (validData.length === 0) {
    if (scatterChartInstance) scatterChartInstance.destroy();
    return;
  }

  const scatterPoints = validData.map(row => ({
    x: parseNum(getRowValue(row, 'NOTA FINAL')),
    y: parseNum(getRowValue(row, 'CUMPLIMIENTO MES')),
    agent: getRowValue(row, 'PROMOTOR') || 'Agente'
  }));

  if (scatterChartInstance) {
    scatterChartInstance.destroy();
  }

  const ctx = canvas.getContext('2d');
  scatterChartInstance = new Chart(ctx, {
    type: 'scatter',
    data: {
      datasets: [{
        label: 'Agentes',
        data: scatterPoints,
        backgroundColor: 'rgba(37, 99, 235, 0.7)',
        borderColor: '#1d4ed8',
        borderWidth: 1,
        pointRadius: 6,
        pointHoverRadius: 9
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (context) => {
              const pt = context.raw;
              return `${pt.agent}: Calidad = ${pt.x}% | Cumplimiento = ${pt.y}%`;
            }
          }
        },
        annotation: {
          annotations: {
            lineMeta: {
              type: 'line',
              yMin: 90,
              yMax: 90,
              borderColor: '#ff4444',
              borderWidth: 2,
              borderDash: [6, 6],
              label: {
                display: true,
                content: 'Meta Ventas (90%)',
                position: 'start',
                backgroundColor: 'rgba(239, 68, 68, 0.8)',
                color: '#fff',
                font: { size: 10, weight: 'bold' }
              }
            },
            lineCalidad: {
              type: 'line',
              xMin: 90,
              xMax: 90,
              borderColor: '#ff4444',
              borderWidth: 2,
              borderDash: [6, 6],
              label: {
                display: true,
                content: 'Meta Calidad (90%)',
                position: 'start',
                backgroundColor: 'rgba(239, 68, 68, 0.8)',
                color: '#fff',
                font: { size: 10, weight: 'bold' }
              }
            }
          }
        }
      },
      scales: {
        x: {
          title: { display: true, text: 'Nota Final de Calidad (%)', font: { weight: 'bold' } },
          min: 0,
          max: 100
        },
        y: {
          title: { display: true, text: '% Cumplimiento de Meta', font: { weight: 'bold' } },
          beginAtZero: true
        }
      }
    }
  });
}

function renderDiagnosticTable(data) {
  const tbody = document.querySelector('#diagnostic-table tbody');
  if (!tbody) return;
  tbody.innerHTML = '';

  if (!data || data.length === 0) {
    renderQualityScatterPlot([]); 
    tbody.innerHTML = '<tr><td colspan="10" style="text-align:center;">No hay datos disponibles.</td></tr>';
    return;
  }

  renderQualityScatterPlot(data);

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
  } else if (subTabName === 'trends-global') {
    renderTrendsGlobalTable();
  }
}

function renderTrendsLeaderTable() {
  const container = document.getElementById('subtab-trends-leader');
  if (!container) return;

  const monthKeys = Object.keys(allMonthsData);
  if (monthKeys.length === 0) return;

  const labels = monthKeys.map(m => m.charAt(0).toUpperCase() + m.slice(1));
  const supervisorsVentasMap = {};
  const supervisorsMetaMap = {};
  const supervisorsPromotoresMap = {};

  monthKeys.forEach(m => {
    (allMonthsData[m] || []).forEach(row => {
      if (filterRow(row)) {
        const sup = getRowValue(row, 'SUPERVISOR');
        if (sup) {
          if (!supervisorsVentasMap[sup]) supervisorsVentasMap[sup] = {};
          if (!supervisorsMetaMap[sup]) supervisorsMetaMap[sup] = {};
          if (!supervisorsPromotoresMap[sup]) supervisorsPromotoresMap[sup] = {};
        }
      }
    });
  });

  Object.keys(supervisorsVentasMap).forEach(sup => {
    monthKeys.forEach(m => {
      const rows = (allMonthsData[m] || []).filter(r => getRowValue(r, 'SUPERVISOR') === sup && filterRow(r));
      
      const totalCierre = rows.reduce((sum, r) => sum + parseNum(getRowValue(r, 'CIERRE')), 0);
      const totalMeta = rows.reduce((sum, r) => sum + parseNum(getRowValue(r, 'META')), 0);
      
      supervisorsVentasMap[sup][m] = totalCierre;
      supervisorsMetaMap[sup][m] = totalMeta;

      const uniquePromotores = new Set(rows.map(r => getRowValue(r, 'PROMOTOR')).filter(Boolean));
      supervisorsPromotoresMap[sup][m] = uniquePromotores.size;
    });
  });

  const datasetsCumplimiento = Object.keys(supervisorsVentasMap).map((sup, idx) => {
    const color = SUPERVISOR_COLORS[idx % SUPERVISOR_COLORS.length];
    
    const dataCumpl = monthKeys.map(m => {
      const meta = supervisorsMetaMap[sup][m] || 0;
      const cierre = supervisorsVentasMap[sup][m] || 0;
      return meta > 0 ? parseFloat(((cierre / meta) * 100).toFixed(1)) : 0;
    });

    return {
      label: sup,
      data: dataCumpl,
      borderColor: color,
      backgroundColor: color,
      borderWidth: 2.5,
      tension: 0.3,
      fill: false,
      pointRadius: 4,
      pointHoverRadius: 7
    };
  });

  let canvasCumpl = document.getElementById('chartCumplimientoPorLider');
  if (canvasCumpl) {
    let existingChart = Chart.getChart(canvasCumpl);
    if (existingChart) existingChart.destroy();

    new Chart(canvasCumpl.getContext('2d'), {
      type: 'line',
      data: { labels, datasets: datasetsCumplimiento },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          title: {
            display: true,
            text: '% Cumplimiento Promedio por Supervisor y por Mes',
            font: { size: 16, weight: 'bold' },
            color: '#2c3e50',
            padding: { top: 10, bottom: 20 }
          },
          legend: { 
            position: 'bottom',
            labels: { boxWidth: 12, padding: 15 }
          },
          tooltip: {
            mode: 'index',
            intersect: false,
            callbacks: {
              label: (context) => `${context.dataset.label}: ${context.raw}%`
            }
          },
          annotation: {
            annotations: {
              metaLine: {
                type: 'line',
                yMin: 100,
                yMax: 100,
                borderColor: '#ef4444',
                borderWidth: 2,
                borderDash: [6, 6],
                label: {
                  display: true,
                  content: 'Meta (100%)',
                  position: 'end',
                  backgroundColor: 'rgba(239, 68, 68, 0.8)',
                  color: '#fff',
                  font: { size: 10, weight: 'bold' }
                }
              }
            }
          }
        },
        scales: {
          x: { grid: { display: false } },
          y: { 
            beginAtZero: true,
            title: { display: true, text: 'Porcentaje de Cumplimiento (%)' },
            ticks: {
              callback: (value) => `${value}%`
            }
          }
        }
      }
    });
  }

  const datasetsVentas = Object.keys(supervisorsVentasMap).map((sup, idx) => {
    const color = SUPERVISOR_COLORS[idx % SUPERVISOR_COLORS.length];
    return {
      label: sup,
      data: monthKeys.map(m => supervisorsVentasMap[sup][m] || 0),
      backgroundColor: color,
      borderColor: color,
      borderWidth: 1,
      borderRadius: 4
    };
  });

  const datasetsPromotores = Object.keys(supervisorsPromotoresMap).map((sup, idx) => {
    const color = SUPERVISOR_COLORS[idx % SUPERVISOR_COLORS.length];
    return {
      label: sup,
      data: monthKeys.map(m => supervisorsPromotoresMap[sup][m] || 0),
      backgroundColor: color,
      borderColor: color,
      borderWidth: 1,
      borderRadius: 4
    };
  });

  let canvasPromotores = document.getElementById('chartPromotoresPorLider');
  if (canvasPromotores) {
    let existingChartProm = Chart.getChart(canvasPromotores);
    if (existingChartProm) existingChartProm.destroy();

    new Chart(canvasPromotores.getContext('2d'), {
      type: 'bar',
      data: { labels, datasets: datasetsPromotores },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          title: {
            display: true,
            text: 'Cantidad de Promotores Asignados por Supervisor y por Mes',
            font: { size: 16, weight: 'bold' },
            color: '#2c3e50',
            padding: { top: 10, bottom: 20 }
          },
          legend: { 
            position: 'bottom',
            labels: { boxWidth: 12, padding: 15 }
          },
          tooltip: {
            mode: 'index',
            intersect: false
          }
        },
        scales: {
          x: { grid: { display: false } },
          y: { 
            beginAtZero: true,
            ticks: { stepSize: 1 },
            title: { display: true, text: 'Cantidad de Promotores' }
          }
        }
      }
    });
  }

  let canvasVentas = document.getElementById('chartAgentesPorLider');
  if (canvasVentas) {
    let existingChartVentas = Chart.getChart(canvasVentas);
    if (existingChartVentas) existingChartVentas.destroy();

    new Chart(canvasVentas.getContext('2d'), {
      type: 'bar',
      data: { labels, datasets: datasetsVentas },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          title: {
            display: true,
            text: 'Cantidad de Ventas por Supervisor y por Mes',
            font: { size: 16, weight: 'bold' },
            color: '#2c3e50',
            padding: { top: 10, bottom: 20 }
          },
          legend: { 
            position: 'bottom',
            labels: { boxWidth: 12, padding: 15 }
          },
          tooltip: {
            mode: 'index',
            intersect: false
          }
        },
        scales: {
          x: { grid: { display: false } },
          y: { 
            beginAtZero: true,
            title: { display: true, text: 'Ventas Totales' }
          }
        }
      }
    });
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
      .filter(row => {
        const status = getRowValue(row, 'STATUS AGENTE').toUpperCase();
        return status.includes('ACTIVO');
      })
      .map(row => getRowValue(row, 'PROMOTOR').toUpperCase())
      .filter(name => name && name.trim() !== '')
  );

  const totalActive = activeAgentsLastMonth.size;

  const fullAgentsMap = {};
  Object.keys(allMonthsData).forEach(m => {
    allMonthsData[m].forEach(row => {
      const agentName = getRowValue(row, 'PROMOTOR').toUpperCase();
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

  lastMonthData.forEach(row => {
    const finalNote = getRowValue(row, 'NOTA FINAL');
    if (finalNote && finalNote !== '-' && finalNote.trim() !== '') {
      const numVal = parseNum(finalNote);
      if (!isNaN(numVal) && numVal > 0) {
        sumDiagnostic += numVal;
        countDiagnostic++;
      }
    }
  });

  const avgQuality = countDiagnostic > 0 ? (sumDiagnostic / countDiagnostic).toFixed(1) : '0.0';

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

function renderTrendsGlobalTable() {
  const container = document.getElementById('subtab-trends-global');
  if (!container) return;

  const monthKeys = Object.keys(allMonthsData);
  if (monthKeys.length === 0) return;

  const labels = monthKeys.map(m => m.charAt(0).toUpperCase() + m.slice(1));
  const totalVentas = [];
  const totalMeta = [];
  const semanasAcumuladas = { V1: 0, V2: 0, V3: 0, V4: 0, V5: 0 };
  const semaforoPorMes = { rojo: [], amarillo: [], verde: [] };

  monthKeys.forEach(m => {
    const rawRows = allMonthsData[m] || [];
    const rows = rawRows.filter(row => filterRow(row));

    const ventas = rows.reduce((sum, r) => sum + parseNum(getRowValue(r, 'CIERRE')), 0);
    const meta = rows.reduce((sum, r) => sum + parseNum(getRowValue(r, 'META')), 0);
    totalVentas.push(ventas);
    totalMeta.push(meta);

    ['V1', 'V2', 'V3', 'V4', 'V5'].forEach(vKey => {
      const sumaSemana = rows.reduce((sum, r) => sum + parseNum(getRowValue(r, vKey)), 0);
      semanasAcumuladas[vKey] += sumaSemana;
    });

    let cRojo = 0, cAmarillo = 0, cVerde = 0;
    rows.forEach(r => {
      const v = parseNum(getRowValue(r, 'CIERRE'));
      const me = parseNum(getRowValue(r, 'META'));
      const pct = me > 0 ? (v / me) * 100 : 0;

      if (pct < 50) cRojo++;
      else if (pct < 90) cAmarillo++;
      else cVerde++;
    });

    semaforoPorMes.rojo.push(cRojo);
    semaforoPorMes.amarillo.push(cAmarillo);
    semaforoPorMes.verde.push(cVerde);
  });

  let canvasGlobal = document.getElementById('chartGlobalVentas');
  if (canvasGlobal) {
    let existingChart = Chart.getChart(canvasGlobal);
    if (existingChart) existingChart.destroy();

    new Chart(canvasGlobal.getContext('2d'), {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [
          { label: 'Ventas Totales', data: totalVentas, backgroundColor: '#10b981', borderRadius: 4 },
          { label: 'Meta Total', data: totalMeta, backgroundColor: '#ef4444', borderRadius: 4 }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          title: { display: true, text: 'Rendimiento Global de Ventas vs. Meta General por Mes', font: { size: 16, weight: 'bold' } },
          legend: { position: 'bottom' }
        },
        scales: { y: { beginAtZero: true } }
      }
    });
  }

  let canvasSemanas = document.getElementById('chartGlobalSemanas');
  if (canvasSemanas) {
    let existingChart = Chart.getChart(canvasSemanas);
    if (existingChart) existingChart.destroy();

    new Chart(canvasSemanas.getContext('2d'), {
      type: 'bar',
      data: {
        labels: ['Semana 1 (V1)', 'Semana 2 (V2)', 'Semana 3 (V3)', 'Semana 4 (V4)', 'Semana 5 (V5)'],
        datasets: [{
          label: 'Ventas Acumuladas',
          data: [semanasAcumuladas.V1, semanasAcumuladas.V2, semanasAcumuladas.V3, semanasAcumuladas.V4, semanasAcumuladas.V5],
          backgroundColor: '#3b82f6',
          borderRadius: 4
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          title: { display: true, text: 'Distribución Acumulada de Ventas por Semana (V1 a V5)', font: { size: 16, weight: 'bold' } },
          legend: { position: 'bottom' }
        },
        scales: { y: { beginAtZero: true } }
      }
    });
  }

  let canvasSemaforo = document.getElementById('chartGlobalSemaforo');
  if (canvasSemaforo) {
    let existingChart = Chart.getChart(canvasSemaforo);
    if (existingChart) existingChart.destroy();

    new Chart(canvasSemaforo.getContext('2d'), {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [
          { label: 'Rojo (<50%)', data: semaforoPorMes.rojo, backgroundColor: '#ff4d4d' },
          { label: 'Amarillo (50%-89%)', data: semaforoPorMes.amarillo, backgroundColor: '#ffc107' },
          { label: 'Verde (>=90%)', data: semaforoPorMes.verde, backgroundColor: '#00c853' }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          title: { display: true, text: 'SEMÁFORO GLOBAL POR MES', font: { size: 16, weight: 'bold' } },
          legend: { position: 'bottom' }
        },
        scales: {
          x: { stacked: true },
          y: { stacked: true, beginAtZero: true }
        }
      }
    });
  }
}

async function exportCurrentViewToPDF() {
  const { jsPDF } = window.jspdf;
  const btnExport = document.getElementById('btn-export-pdf');
  
  btnExport.textContent = 'Generando...';
  btnExport.disabled = true;

  try {
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const pageHeight = 190; // Alto máximo utilizable por página
    const pdfWidth = 269;   // Ancho utilizable

    // 1. Pestaña activa
    const activeTabBtn = document.querySelector('.tab-button.active');
    const tabTitle = activeTabBtn ? activeTabBtn.textContent.trim() : 'Reporte';
    const activeTabContainer = document.querySelector('.tab-content:not([style*="display: none"])') || document.body;

    // 2. Encabezado
    doc.setFontSize(14);
    doc.setTextColor(30, 41, 59);
    doc.text(`Reporte Dashboard: ${tabTitle}`, 14, 12);

    // 3. Resumen de Filtros
    const filterElements = document.querySelectorAll('.filters-grid select, .filters-grid input');
    const activeFilters = [];

    filterElements.forEach(el => {
      let labelText = el.previousElementSibling?.textContent?.replace(':', '').trim() 
                   || el.getAttribute('placeholder') 
                   || el.id;
      let valueText = el.value ? el.value.trim() : '';
      if (el.tagName === 'SELECT' && el.selectedIndex >= 0) {
        valueText = el.options[el.selectedIndex].text.trim();
      }
      if (valueText && valueText !== '') {
        activeFilters.push(`${labelText}: ${valueText}`);
      }
    });

    if (typeof onlyCriticalRisk !== 'undefined' && onlyCriticalRisk) activeFilters.push('Foco: Riesgo Crítico');
    if (typeof onlyConsistentGreen !== 'undefined' && onlyConsistentGreen) activeFilters.push('Foco: 2 Meses Verde');
    if (typeof onlyRegularPerformers !== 'undefined' && onlyRegularPerformers) activeFilters.push('Foco: Agentes Regulares');

    doc.setFontSize(8);
    doc.setTextColor(80);
    const filterString = activeFilters.length > 0 
      ? `Filtros aplicados: ${activeFilters.join('  |  ')}` 
      : 'Filtros aplicados: Ninguno (Todos los datos)';
    
    const splitFilters = doc.splitTextToSize(filterString, pdfWidth);
    doc.text(splitFilters, 14, 17);

    let currentY = 17 + (splitFilters.length * 4) + 4;

    // 4. CAPTURA DE ELEMENTOS VISUALES Y GRÁFICOS
    // Se filtran los selectores redundantes para evitar duplicados en la pestaña Monitoreo Diagnóstico
    const selector = [
      '.chart-card', 
      '.agent-trend-card', 
      '.agent-session-card', 
      '.summary-cards-grid'
    ].join(', ');

    const visualBlocks = Array.from(activeTabContainer.querySelectorAll(selector));

    for (let i = 0; i < visualBlocks.length; i++) {
      const block = visualBlocks[i];
      if (block.offsetWidth === 0 || block.offsetHeight === 0) continue;

      // Asegura que el elemento esté visible en pantalla antes de capturarlo
      block.scrollIntoView({ block: 'center' });
      
      // Pequeño retardo para asegurar que gráficos tipo Canvas/SVG/Matriz terminen de renderizarse
      await new Promise(resolve => setTimeout(resolve, 150));

      const canvas = await html2canvas(block, { 
        scale: 2,
        useCORS: true,
        backgroundColor: null,
        logging: false,
        scrollX: 0,
        scrollY: 0,
        width: block.scrollWidth,
        height: block.scrollHeight
      });
      
      const imgData = canvas.toDataURL('image/png');
      
      // Conversión de dimensiones (px a mm)
      const pxToMm = 0.264583;
      let finalWidth = (canvas.width / 2) * pxToMm;
      let finalHeight = (canvas.height / 2) * pxToMm;

      // 1. Escalar proporcionalmente si el ANCHO excede el límite del PDF
      if (finalWidth > pdfWidth) {
        const widthRatio = pdfWidth / finalWidth;
        finalWidth = pdfWidth;
        finalHeight = finalHeight * widthRatio;
      }

      // 2. Escalar proporcionalmente si el ALTO excede el alto de la hoja
      const maxHeight = pageHeight - 20;
      if (finalHeight > maxHeight) {
        const heightRatio = maxHeight / finalHeight;
        finalHeight = maxHeight;
        finalWidth = finalWidth * heightRatio;
      }

      // 3. Evaluar salto de página si sobrepasa el límite vertical disponible
      if (currentY + finalHeight > pageHeight) {
        doc.addPage();
        currentY = 15;
      }

      // Centrar la imagen en el lienzo PDF
      const xPosition = 14 + ((pdfWidth - finalWidth) / 2);

      doc.addImage(imgData, 'PNG', xPosition, currentY, finalWidth, finalHeight);
      currentY += finalHeight + 8; // Espacio vertical entre bloques
    }

    // 5. RENDERIZADO DE TABLAS HTML
    const tablesInActiveTab = activeTabContainer.querySelectorAll('table');

    if (tablesInActiveTab.length > 0) {
      tablesInActiveTab.forEach((tableEl) => {
        if (currentY > 150) {
          doc.addPage();
          currentY = 15;
        }

        const tableTitle = tableEl.previousElementSibling?.tagName.startsWith('H') 
          ? tableEl.previousElementSibling.textContent.trim() 
          : null;

        if (tableTitle) {
          doc.setFontSize(10);
          doc.setTextColor(30);
          doc.text(tableTitle, 14, currentY);
          currentY += 4;
        }

        doc.autoTable({
          html: tableEl,
          startY: currentY,
          theme: 'grid',
          styles: { fontSize: 7, cellPadding: 1.5 },
          headStyles: { fillColor: [6, 183, 6], textColor: [255, 255, 255], fontStyle: 'bold' },
          didParseCell: function(data) {
            if (data.cell.raw) {
              const rawHtml = typeof data.cell.raw === 'string' 
                ? data.cell.raw 
                : (data.cell.raw.innerHTML || '');

              // Detectar si la celda contiene la etiqueta HTML del mes activo
              if (rawHtml.includes('active-month-badge')) {
                data.cell._isActiveMonthCell = true;
                data.cell._rawHtml = rawHtml;
              }

              if (typeof data.cell.raw === 'string') {
                data.cell.text = [data.cell.raw.replace(/<[^>]*>/g, '').trim()];
              }
            }
          },
          willDrawCell: function(data) {
            // Vaciar temporalmente el texto automático para renderizarlo con formato mixto en didDrawCell
            if (data.section === 'body' && data.cell._isActiveMonthCell) {
              data.cell.text = [];
            }
          },
          didDrawCell: function(data) {
            if (data.section === 'body') {
              const rawHtml = data.cell._rawHtml || (data.cell.raw ? (data.cell.raw.outerHTML || data.cell.raw.innerHTML || '') : '');
              
              // 1. Dibujar puntos de semáforo si existen en la celda
              let fillColor = null;
              if (rawHtml.includes('dot-green')) fillColor = [6, 183, 6];
              else if (rawHtml.includes('dot-yellow')) fillColor = [255, 185, 55];
              else if (rawHtml.includes('dot-red')) fillColor = [255, 68, 68];
        
              if (fillColor) {
                doc.setFillColor(...fillColor);
                const posX = data.cell.x + data.cell.width - 4;
                const posY = data.cell.y + (data.cell.height / 2);
                doc.circle(posX, posY, 1.2, 'F');
              }

              // 2. Renderizar los meses aplicando negrilla solo al mes activo
              if (data.cell._isActiveMonthCell) {
                const tempDiv = document.createElement('div');
                tempDiv.innerHTML = data.cell._rawHtml;

                const segments = [];
                tempDiv.childNodes.forEach(node => {
                  if (node.nodeType === 3) {
                    if (node.textContent) segments.push({ text: node.textContent, isBold: false });
                  } else if (node.nodeType === 1) {
                    const isBadge = node.classList.contains('active-month-badge') || node.tagName === 'SPAN';
                    segments.push({ text: node.textContent, isBold: isBadge });
                  }
                });

                let currentX = data.cell.x + (data.cell.padding('left') || 1.5);
                const currentY = data.cell.y + (data.cell.height / 2) + 1.2;
                const baseFont = data.cell.styles.font || 'helvetica';

                segments.forEach(seg => {
                  if (seg.isBold) {
                    doc.setFont(baseFont, 'bold');
                    doc.setTextColor(30, 41, 59);
                  } else {
                    doc.setFont(baseFont, 'normal');
                    doc.setTextColor(100, 116, 139);
                  }
                  doc.text(seg.text, currentX, currentY);
                  currentX += doc.getTextWidth(seg.text);
                });

                doc.setFont(baseFont, 'normal');
              }
            }
          }
        });

        currentY = doc.lastAutoTable.finalY + 8;
      });
    }

    // 6. Descarga del archivo
    const filename = `Reporte_${tabTitle.replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.pdf`;
    doc.save(filename);

  } catch (error) {
    console.error('Error al exportar PDF:', error);
  } finally {
    btnExport.textContent = 'Exportar a PDF';
    btnExport.disabled = false;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const btnExport = document.getElementById('btn-export-pdf');
  if (btnExport) {
    btnExport.addEventListener('click', exportCurrentViewToPDF);
  }
});


document.addEventListener('DOMContentLoaded', () => {
  populateMonthSelector();
  
  const searchInput = document.getElementById('filter-search');
  if (searchInput) {
    searchInput.addEventListener('input', filterData);
  }

  document.getElementById('filter-mes').addEventListener('change', loadDashboardData);
  document.getElementById('btn-reset').addEventListener('click', resetAllFilters);
  
  preloadAllMonths();

  setInterval(() => {
    fetchCurrentMonthData();
  }, 120000);
});

