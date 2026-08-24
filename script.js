// ==========================================
// 1. CONFIGURACIÓN DE ENLACES POR MES
// ==========================================
const timestamp = new Date().getTime();
const proxy = "https://corsproxy.io/?";

const MONTH_URLS = {
  febrero: `${proxy}${encodeURIComponent(`https://docs.google.com/spreadsheets/d/e/2PACX-1vRlckyPnPqEGlq9J9wk_1HwxkfHQqt6X4wHxNtPpRg-RRATO3asLAigUxUyin9D1OS0joXIpJkG8-tL/pub?gid=0&single=true&output=csv&_cb=${timestamp}`)}`,
  marzo: `${proxy}${encodeURIComponent(`https://docs.google.com/spreadsheets/d/e/2PACX-1vRlckyPnPqEGlq9J9wk_1HwxkfHQqt6X4wHxNtPpRg-RRATO3asLAigUxUyin9D1OS0joXIpJkG8-tL/pub?gid=397555912&single=true&output=csv&_cb=${timestamp}`)}`,
  abril: `${proxy}${encodeURIComponent(`https://docs.google.com/spreadsheets/d/e/2PACX-1vRlckyPnPqEGlq9J9wk_1HwxkfHQqt6X4wHxNtPpRg-RRATO3asLAigUxUyin9D1OS0joXIpJkG8-tL/pub?gid=1499336465&single=true&output=csv&_cb=${timestamp}`)}`
};

let allMonthsData = {};
let rawData = [];
let filteredData = [];

// Estado de ordenamiento para cada tabla
let sortState = {
  'agents-table': { column: null, isAsc: true },
  'supervisors-table': { column: null, isAsc: true },
  'coordinators-table': { column: null, isAsc: true }
};

// ==========================================
// 2. CONSTRUCCIÓN Y CARGA DE DATOS
// ==========================================
function populateMonthSelector() {
  const selectMes = document.getElementById('filter-mes');
  
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
        skipEmptyLines: true,
        transformHeader: h => h.trim(),
        complete: results => resolve({ month, data: results.data }),
        error: () => resolve({ month, data: [] })
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
    const agentName = row['PROMOTOR'] ? row['PROMOTOR'].trim().toUpperCase() : '';
    const activeMonths = agentMonthsMap[agentName] || [];
    const formattedMonths = activeMonths
      .map(m => m.charAt(0).toUpperCase() + m.slice(1))
      .join(', ');

    return {
      ...row,
      'MESES_ACTIVO': formattedMonths || '-'
    };
  });

  filteredData = [...rawData];

  resetSelect('filter-trainer');
  resetSelect('filter-supervisor');
  resetSelect('filter-coordinador');
  resetSelect('filter-status');

  populateFilters(rawData);
  renderAllTables();
}

function renderAllTables() {
  if (sortState['agents-table'].column) {
    applyAgentSort();
  } else {
    renderTable(filteredData);
  }

  renderLeadersTables(filteredData);
}

function buildAgentMonthsMap() {
  const map = {};
  Object.keys(allMonthsData).forEach(month => {
    allMonthsData[month].forEach(row => {
      const agent = row['PROMOTOR'] ? row['PROMOTOR'].trim().toUpperCase() : null;
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
// 3. LÓGICA DE FILTROS Y REINICIO
// ==========================================
function populateFilters(data) {
  const trainers = [...new Set(data.map(item => item['TRAINER']).filter(Boolean))];
  const supervisors = [...new Set(data.map(item => item['SUPERVISOR']).filter(Boolean))];
  const coordinadores = [...new Set(data.map(item => item['COORDINADOR']).filter(Boolean))];
  const statuses = [...new Set(data.map(item => item['STATUS AGENTE']).filter(Boolean))];

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
  const trainerVal = document.getElementById('filter-trainer').value;
  const supervisorVal = document.getElementById('filter-supervisor').value;
  const coordinadorVal = document.getElementById('filter-coordinador').value;
  const statusVal = document.getElementById('filter-status').value;

  filteredData = rawData.filter(item => {
    const matchTrainer = !trainerVal || item['TRAINER'] === trainerVal;
    const matchSupervisor = !supervisorVal || item['SUPERVISOR'] === supervisorVal;
    const matchCoordinador = !coordinadorVal || item['COORDINADOR'] === coordinadorVal;
    const matchStatus = !statusVal || item['STATUS AGENTE'] === statusVal;
    
    return matchTrainer && matchSupervisor && matchCoordinador && matchStatus;
  });

  renderAllTables();
}

function resetAllFilters() {
  document.getElementById('filter-mes').value = 'todos';
  document.getElementById('filter-trainer').value = '';
  document.getElementById('filter-supervisor').value = '';
  document.getElementById('filter-coordinador').value = '';
  document.getElementById('filter-status').value = '';

  Object.keys(sortState).forEach(tableId => {
    sortState[tableId] = { column: null, isAsc: true };
  });

  loadDashboardData();
}

// ==========================================
// 4. CAMBIO DE PESTAÑAS (TABS)
// ==========================================
function switchTab(tabName, evt) {
  document.querySelectorAll('.tab-button').forEach(btn => btn.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(content => content.style.display = 'none');

  if (tabName === 'agents') {
    document.getElementById('tab-agents').style.display = 'block';
  } else if (tabName === 'leaders') {
    document.getElementById('tab-leaders').style.display = 'block';
  }

  if (evt && evt.currentTarget) {
    evt.currentTarget.classList.add('active');
  } else if (window.event && window.event.target) {
    window.event.target.classList.add('active');
  }
}

// ==========================================
// 5. SISTEMA GENERAL DE ORDENAMIENTO DE TABLAS
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
    applyAgentSort();
  } else if (tableId === 'supervisors-table') {
    renderGroupedTable(filteredData, 'SUPERVISOR', '#supervisors-table tbody', 'supervisors-table');
  } else if (tableId === 'coordinators-table') {
    renderGroupedTable(filteredData, 'COORDINADOR', '#coordinators-table tbody', 'coordinators-table');
  }
}

function applyAgentSort() {
  const { column, isAsc } = sortState['agents-table'];

  filteredData.sort((a, b) => {
    let valA = getColumnValue(a, column);
    let valB = getColumnValue(b, column);

    let numA = parseFloat(valA.toString().replace('%', '').replace(',', '.'));
    let numB = parseFloat(valB.toString().replace('%', '').replace(',', '.'));

    if (!isNaN(numA) && !isNaN(numB)) {
      return isAsc ? numA - numB : numB - numA;
    }

    valA = valA.toString().toLowerCase();
    valB = valB.toString().toLowerCase();

    if (valA < valB) return isAsc ? -1 : 1;
    if (valA > valB) return isAsc ? 1 : -1;
    return 0;
  });

  renderTable(filteredData);
}

function getColumnValue(row, columnKey) {
  if (columnKey === 'META') {
    const metaKey = Object.keys(row).find(k => k.startsWith('META')) || 'META';
    return row[metaKey] || 0;
  }
  return row[columnKey] || 0;
}

function getComplianceBadge(valueStr) {
  if (!valueStr) return '<span class="status-dot dot-red"></span>0%';
  
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
// 6. RENDERIZADO TABLA AGENTES
// ==========================================
function renderTable(data) {
  const tbody = document.querySelector('#agents-table tbody');
  tbody.innerHTML = '';

  if (!data || data.length === 0) {
    tbody.innerHTML = '<tr><td colspan="14" style="text-align:center;">No hay datos disponibles.</td></tr>';
    return;
  }

  data.forEach(row => {
    const metaKey = Object.keys(row).find(k => k.startsWith('META')) || 'META';
    const complianceHTML = getComplianceBadge(row['CUMPLIMIENTO MES']);
    
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${row['PROMOTOR'] || '-'}</strong></td>
      <td>${row['TRAINER'] || '-'}</td>
      <td>${row['SUPERVISOR'] || '-'}</td>
      <td>${row['COORDINADOR'] || '-'}</td>
      <td>${row[metaKey] || '0'}</td>
      <td>${row['V1'] || '0'}</td>
      <td>${row['V2'] || '0'}</td>
      <td>${row['V3'] || '0'}</td>
      <td>${row['V4'] || '0'}</td>
      <td>${row['V5'] || '0'}</td>
      <td>${row['CIERRE'] || '0'}</td>
      <td>${complianceHTML}</td>
      <td>${row['STATUS AGENTE'] || '-'}</td>
      <td>${row['MESES_ACTIVO'] || '-'}</td>
    `;
    tbody.appendChild(tr);
  });
}

// ==========================================
// 7. RENDERIZADO TABLAS LÍDERES (ACUMULATIVOS)
// ==========================================
function parseNum(val) {
  if (!val) return 0;
  let num = parseFloat(val.toString().replace('%', '').replace(',', '.'));
  return isNaN(num) ? 0 : num;
}

function renderLeadersTables(data) {
  renderGroupedTable(data, 'SUPERVISOR', '#supervisors-table tbody', 'supervisors-table');
  renderGroupedTable(data, 'COORDINADOR', '#coordinators-table tbody', 'coordinators-table');
}

function renderGroupedTable(data, groupKey, selector, tableId) {
  const tbody = document.querySelector(selector);
  tbody.innerHTML = '';

  if (!data || data.length === 0) {
    tbody.innerHTML = '<tr><td colspan="10" style="text-align:center;">No hay datos disponibles.</td></tr>';
    return;
  }

  const groupMap = {};

  data.forEach(row => {
    const actualKey = Object.keys(row).find(k => k.trim().toUpperCase() === groupKey.toUpperCase());
    const leader = (actualKey && row[actualKey]) ? row[actualKey].trim() : `Sin ${groupKey.toLowerCase()}`;
    const metaKey = Object.keys(row).find(k => k.trim().toUpperCase().startsWith('META')) || 'META';

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
    groupMap[leader].metaTotal += parseNum(row[metaKey]);
    groupMap[leader].v1 += parseNum(row['V1']);
    groupMap[leader].v2 += parseNum(row['V2']);
    groupMap[leader].v3 += parseNum(row['V3']);
    groupMap[leader].v4 += parseNum(row['V4']);
    groupMap[leader].v5 += parseNum(row['V5']);
    groupMap[leader].cierre += parseNum(row['CIERRE']);
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

// ==========================================
// 8. INICIALIZACIÓN
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
  populateMonthSelector();
  document.getElementById('filter-mes').addEventListener('change', loadDashboardData);
  document.getElementById('btn-reset').addEventListener('click', resetAllFilters);
  preloadAllMonths();
});