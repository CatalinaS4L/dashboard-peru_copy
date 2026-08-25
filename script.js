// ==========================================
// 1. ENLACES DIRECTOS A GOOGLE SHEETS
// ==========================================
const timestamp = new Date().getTime();

const MONTH_URLS = {
  febrero: `https://docs.google.com/spreadsheets/d/e/2PACX-1vRlckyPnPqEGlq9J9wk_1HwxkfHQqt6X4wHxNtPpRg-RRATO3asLAigUxUyin9D1OS0joXIpJkG8-tL/pub?gid=0&single=true&output=csv&_cb=${timestamp}`,
  marzo: `https://docs.google.com/spreadsheets/d/e/2PACX-1vRlckyPnPqEGlq9J9wk_1HwxkfHQqt6X4wHxNtPpRg-RRATO3asLAigUxUyin9D1OS0joXIpJkG8-tL/pub?gid=397555912&single=true&output=csv&_cb=${timestamp}`,
  abril: `https://docs.google.com/spreadsheets/d/e/2PACX-1vRlckyPnPqEGlq9J9wk_1HwxkfHQqt6X4wHxNtPpRg-RRATO3asLAigUxUyin9D1OS0joXIpJkG8-tL/pub?gid=1499336465&single=true&output=csv&_cb=${timestamp}`,
  mayo: `https://docs.google.com/spreadsheets/d/e/2PACX-1vRlckyPnPqEGlq9J9wk_1HwxkfHQqt6X4wHxNtPpRg-RRATO3asLAigUxUyin9D1OS0joXIpJkG8-tL/pub?gid=289433826&single=true&output=csv&_cb=${timestamp}`,
  junio: `https://docs.google.com/spreadsheets/d/e/2PACX-1vRlckyPnPqEGlq9J9wk_1HwxkfHQqt6X4wHxNtPpRg-RRATO3asLAigUxUyin9D1OS0joXIpJkG8-tL/pub?gid=632786864&single=true&output=csv&_cb=${timestamp}`
};

let allMonthsData = {};
let rawData = [];
let filteredData = [];

let sortState = {
  'agents-table': { column: null, isAsc: true },
  'supervisors-table': { column: null, isAsc: true },
  'coordinators-table': { column: null, isAsc: true }
};

// Función auxiliar para extraer valores seleccionados de un <select multiple>
function getSelectValues(selectElement) {
  if (!selectElement) return [];
  const result = [];
  const options = selectElement.options;
  for (let i = 0; i < options.length; i++) {
    if (options[i].selected && options[i].value !== '' && options[i].value !== 'todos') {
      result.push(options[i].value);
    }
  }
  return result;
}

// Función de lectura tolerante a prefijos
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

// Lista exacta de palabras clave con emojis (Case-Sensitive)
const EXACT_KEYWORDS = [
  "📅 Fecha",
  "🔗 URLTr:",
  "🗣️ Speech:",
  "📚 Producto:",
  "🛡️ Objeciones:",
  "🤝 Cierre:",
  "📌 Acuerdos \\+ Estado:"
];

// Función auxiliar para extraer el valor exacto según las etiquetas personalizadas
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
  selectMes.innerHTML = '';

  Object.keys(MONTH_URLS).forEach(monthKey => {
    const option = document.createElement('option');
    option.value = monthKey;
    const formattedName = monthKey.charAt(0).toUpperCase() + monthKey.slice(1);
    option.textContent = `${formattedName} 2026`;
    selectMes.appendChild(option);
  });

  if (!selectMes.dataset.hasListener) {
    selectMes.addEventListener('change', loadDashboardData);
    selectMes.dataset.hasListener = "true";
  }
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
          console.log(`[OK] Descargado ${month}:`, results.data);

          const validData = (results.data || []).map(row => ({
            ...row,
            _MES_ORIGEN: month
          })).filter(row => {
            const agentVal = getRowValue(row, 'PROMOTOR');
            return agentVal && agentVal !== '';
          });

          console.log(`[FILTRADO] Filas válidas para ${month}: ${validData.length}`);
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
  const selectedMonths = getSelectValues(document.getElementById('filter-mes'));
  const agentMonthsMap = buildAgentMonthsMap();

  // Si no hay meses seleccionados, se cargan todos por defecto
  if (selectedMonths.length === 0) {
    rawData = [];
    Object.keys(allMonthsData).forEach(m => {
      rawData = rawData.concat(allMonthsData[m]);
    });
  } else {
    // Concatenar únicamente los meses seleccionados
    rawData = [];
    selectedMonths.forEach(m => {
      if (allMonthsData[m]) {
        rawData = rawData.concat(allMonthsData[m]);
      }
    });
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

  populateFilters(rawData);
  filterData();
}

function renderAllTables() {
  if (sortState['agents-table'].column) {
    applyAgentSort();
  } else {
    renderTable(filteredData);
  }

  renderLeadersTables(filteredData);
  
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

  const currentSelected = getSelectValues(select);
  select.innerHTML = '';

  options.sort().forEach(opt => {
    const option = document.createElement('option');
    option.value = opt;
    option.textContent = opt;
    if (currentSelected.includes(opt)) {
      option.selected = true;
    }
    select.appendChild(option);
  });

  if (!select.dataset.hasListener) {
    select.addEventListener('change', filterData);
    select.dataset.hasListener = "true";
  }
}

function filterData() {
  const searchVal = document.getElementById('filter-search')?.value.toLowerCase().trim() || '';
  
  const selectedTrainers = getSelectValues(document.getElementById('filter-trainer'));
  const selectedSupervisors = getSelectValues(document.getElementById('filter-supervisor'));
  const selectedCoordinadores = getSelectValues(document.getElementById('filter-coordinador'));
  const selectedStatuses = getSelectValues(document.getElementById('filter-status'));

  filteredData = rawData.filter(item => {
    const agentName = getRowValue(item, 'PROMOTOR').toLowerCase();
    const matchSearch = !searchVal || agentName.includes(searchVal);
    
    const matchTrainer = selectedTrainers.length === 0 || selectedTrainers.includes(getRowValue(item, 'TRAINER'));
    const matchSupervisor = selectedSupervisors.length === 0 || selectedSupervisors.includes(getRowValue(item, 'SUPERVISOR'));
    const matchCoordinador = selectedCoordinadores.length === 0 || selectedCoordinadores.includes(getRowValue(item, 'COORDINADOR'));
    const matchStatus = selectedStatuses.length === 0 || selectedStatuses.includes(getRowValue(item, 'STATUS AGENTE'));
    
    return matchSearch && matchTrainer && matchSupervisor && matchCoordinador && matchStatus;
  });

  renderAllTables();
}

function resetAllFilters() {
  const searchInput = document.getElementById('filter-search');
  if (searchInput) searchInput.value = '';

  ['filter-mes', 'filter-trainer', 'filter-supervisor', 'filter-coordinador', 'filter-status'].forEach(id => {
    const sel = document.getElementById(id);
    if (sel) {
      for (let i = 0; i < sel.options.length; i++) {
        sel.options[i].selected = false;
      }
    }
  });

  Object.keys(sortState).forEach(tableId => {
    sortState[tableId] = { column: null, isAsc: true };
  });

  loadDashboardData();
}

// ==========================================
// 4. CAMBIO DE PESTAÑAS
// ==========================================
function switchTab(tabName, evt) {
  document.querySelectorAll('.tab-button').forEach(btn => btn.classList.remove('active'));
  
  const tabAgents = document.getElementById('tab-agents');
  const tabLeaders = document.getElementById('tab-leaders');
  const tabTrends = document.getElementById('tab-trends');
  const tabSessions = document.getElementById('tab-sessions');

  if (tabAgents) tabAgents.style.display = 'none';
  if (tabLeaders) tabLeaders.style.display = 'none';
  if (tabTrends) tabTrends.style.display = 'none';
  if (tabSessions) tabSessions.style.display = 'none';

  if (tabName === 'agents' && tabAgents) tabAgents.style.display = 'block';
  if (tabName === 'leaders' && tabLeaders) tabLeaders.style.display = 'block';
  if (tabName === 'trends' && tabTrends) {
    tabTrends.style.display = 'block';
    renderTrendsTable();
  }
  if (tabName === 'sessions' && tabSessions) {
    tabSessions.style.display = 'block';
    renderTrainerSessions(filteredData);
  }

  if (evt && evt.currentTarget) {
    evt.currentTarget.classList.add('active');
  }
}

// ==========================================
// 5. ORDENAMIENTO
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

function getComplianceBadge(valueStr) {
  if (!valueStr) return '<span class="status-dot dot-red"></span>0%';
  
  let num = parseFloat(valueStr.replace('%', '').replace(',', '.'));
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
// 6. RENDERIZADO TABLAS Y TARJETAS
// ==========================================
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
    const selectedTrainers = getSelectValues(document.getElementById('filter-trainer'));
    const selectedSupervisors = getSelectValues(document.getElementById('filter-supervisor'));
    const selectedCoordinadores = getSelectValues(document.getElementById('filter-coordinador'));
    const selectedStatuses = getSelectValues(document.getElementById('filter-status'));

    const filteredMonthData = monthData.filter(item => {
      const agentName = getRowValue(item, 'PROMOTOR').toLowerCase();
      const matchSearch = !searchVal || agentName.includes(searchVal);
      const matchTrainer = selectedTrainers.length === 0 || selectedTrainers.includes(getRowValue(item, 'TRAINER'));
      const matchSupervisor = selectedSupervisors.length === 0 || selectedSupervisors.includes(getRowValue(item, 'SUPERVISOR'));
      const matchCoordinador = selectedCoordinadores.length === 0 || selectedCoordinadores.includes(getRowValue(item, 'COORDINADOR'));
      const matchStatus = selectedStatuses.length === 0 || selectedStatuses.includes(getRowValue(item, 'STATUS AGENTE'));
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

// ==========================================
// 7. INICIALIZACIÓN
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
  populateMonthSelector();
  
  const searchInput = document.getElementById('filter-search');
  if (searchInput) {
    searchInput.addEventListener('input', filterData);
  }

  document.getElementById('btn-reset').addEventListener('click', resetAllFilters);
  preloadAllMonths();
});