// ==========================================
// 1. CONFIGURACIÓN DE ENLACES POR MES
// ==========================================
const MONTH_URLS = {
  febrero: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRlckyPnPqEGlq9J9wk_1HwxkfHQqt6X4wHxNtPpRg-RRATO3asLAigUxUyin9D1OS0joXIpJkG8-tL/pub?gid=0&single=true&output=csv',
  marzo: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRlckyPnPqEGlq9J9wk_1HwxkfHQqt6X4wHxNtPpRg-RRATO3asLAigUxUyin9D1OS0joXIpJkG8-tL/pub?gid=397555912&single=true&output=csv'
};

let allMonthsData = {};
let rawData = [];
let filteredData = [];

let currentSortColumn = null;
let isAscending = true;

// ==========================================
// 2. CONSTRUCCIÓN Y CARGA DE DATOS
// ==========================================

// AQUÍ AÑADES LA FUNCIÓN:
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

  populateFilters(rawData);

  if (currentSortColumn) {
    applySort();
  } else {
    renderTable(filteredData);
  }
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
  select.innerHTML = '<option value="">Todos</option>';
}

// ==========================================
// 3. LÓGICA DE FILTROS Y REINICIO
// ==========================================
function populateFilters(data) {
  const trainers = [...new Set(data.map(item => item['TRAINER']).filter(Boolean))];
  const supervisors = [...new Set(data.map(item => item['SUPERVISOR']).filter(Boolean))];
  const coordinadores = [...new Set(data.map(item => item['COORDINADOR']).filter(Boolean))];

  fillSelect('filter-trainer', trainers);
  fillSelect('filter-supervisor', supervisors);
  fillSelect('filter-coordinador', coordinadores);
}

function fillSelect(elementId, options) {
  const select = document.getElementById(elementId);
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

  filteredData = rawData.filter(item => {
    const matchTrainer = !trainerVal || item['TRAINER'] === trainerVal;
    const matchSupervisor = !supervisorVal || item['SUPERVISOR'] === supervisorVal;
    const matchCoordinador = !coordinadorVal || item['COORDINADOR'] === coordinadorVal;
    return matchTrainer && matchSupervisor && matchCoordinador;
  });

  if (currentSortColumn) {
    applySort();
  } else {
    renderTable(filteredData);
  }
}

function resetAllFilters() {
  document.getElementById('filter-mes').value = 'todos';
  document.getElementById('filter-trainer').value = '';
  document.getElementById('filter-supervisor').value = '';
  document.getElementById('filter-coordinador').value = '';

  currentSortColumn = null;
  isAscending = true;

  loadDashboardData();
}

// ==========================================
// 4. LÓGICA DE ORDENAMIENTO (ASC / DESC)
// ==========================================
function setupTableHeaderEvents() {
  const headers = document.querySelectorAll('#agents-table th');
  headers.forEach(header => {
    header.addEventListener('click', () => {
      const columnKey = header.getAttribute('data-column');
      if (!columnKey) return;

      if (currentSortColumn === columnKey) {
        isAscending = !isAscending;
      } else {
        currentSortColumn = columnKey;
        isAscending = true;
      }

      applySort();
    });
  });
}

function applySort() {
  filteredData.sort((a, b) => {
    let valA = getColumnValue(a, currentSortColumn);
    let valB = getColumnValue(b, currentSortColumn);

    let numA = parseFloat(valA.toString().replace('%', '').replace(',', '.'));
    let numB = parseFloat(valB.toString().replace('%', '').replace(',', '.'));

    if (!isNaN(numA) && !isNaN(numB)) {
      return isAscending ? numA - numB : numB - numA;
    }

    valA = valA.toString().toLowerCase();
    valB = valB.toString().toLowerCase();

    if (valA < valB) return isAscending ? -1 : 1;
    if (valA > valB) return isAscending ? 1 : -1;
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

// ==========================================
// 5. HELPER DE CUMPLIMIENTO (SEMÁFORO)
// ==========================================
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
// 6. RENDERIZADO DE TABLA
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
// 7. INICIALIZACIÓN
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
  populateMonthSelector(); // <--- SE EJECUTA AQUÍ AL INICIAR
  document.getElementById('filter-mes').addEventListener('change', loadDashboardData);
  document.getElementById('btn-reset').addEventListener('click', resetAllFilters);
  setupTableHeaderEvents();
  preloadAllMonths();
});