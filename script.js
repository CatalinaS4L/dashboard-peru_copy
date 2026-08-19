// ==========================================
// 1. CONFIGURACIÓN DE ENLACES POR MES
// ==========================================
const MONTH_URLS = {
  febrero: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRlckyPnPqEGlq9J9wk_1HwxkfHQqt6X4wHxNtPpRg-RRATO3asLAigUxUyin9D1OS0joXIpJkG8-tL/pub?gid=0&single=true&output=csv',
  marzo: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRlckyPnPqEGlq9J9wk_1HwxkfHQqt6X4wHxNtPpRg-RRATO3asLAigUxUyin9D1OS0joXIpJkG8-tL/pub?gid=397555912&single=true&output=csv'
};

let rawData = [];
let filteredData = []; // Datos filtrados sobre los que se aplicará el ordenamiento

// Control del estado de ordenamiento
let currentSortColumn = null;
let isAscending = true;

// ==========================================
// 2. DESCARGA Y PROCESAMIENTO DE DATOS
// ==========================================
function loadDashboardData() {
  const selectedMonth = document.getElementById('filter-mes').value;
  const csvUrl = MONTH_URLS[selectedMonth];

  if (!csvUrl) {
    console.error("No hay una URL configurada para el mes seleccionado:", selectedMonth);
    return;
  }

  Papa.parse(csvUrl, {
    download: true,
    header: true,
    skipEmptyLines: true,
    transformHeader: function(h) {
      return h.trim();
    },
    complete: function(results) {
      rawData = results.data;
      filteredData = [...rawData]; // Inicializar copia para filtrado
      
      resetSelect('filter-trainer');
      resetSelect('filter-supervisor');
      resetSelect('filter-coordinador');
      
      populateFilters(rawData);
      renderTable(filteredData);
    },
    error: function(err) {
      console.error("Error al cargar los datos desde Google Sheets:", err);
    }
  });
}

function resetSelect(elementId) {
  const select = document.getElementById(elementId);
  select.innerHTML = '<option value="">Todos</option>';
}

// ==========================================
// 3. LÓGICA DE FILTROS
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

  // Re-aplicar orden previo si existía
  if (currentSortColumn) {
    applySort();
  } else {
    renderTable(filteredData);
  }
}

// ==========================================
// 4. FUNCIÓN DE ORDENAMIENTO (ASC / DESC)
// ==========================================
function sortTable(columnKey) {
  // Si vuelve a hacer clic en la misma columna, invierte el orden (ASC -> DESC -> ASC)
  if (currentSortColumn === columnKey) {
    isAscending = !isAscending;
  } else {
    currentSortColumn = columnKey;
    isAscending = true;
  }

  applySort();
}

function applySort() {
  filteredData.sort((a, b) => {
    let valA = getColumnValue(a, currentSortColumn);
    let valB = getColumnValue(b, currentSortColumn);

    // Limpieza de valores para comparación numérica o porcentaje
    let numA = parseFloat(valA.toString().replace('%', '').replace(',', '.'));
    let numB = parseFloat(valB.toString().replace('%', '').replace(',', '.'));

    // Si ambos son números válidos, ordenar numéricamente
    if (!isNaN(numA) && !isNaN(numB)) {
      return isAscending ? numA - numB : numB - numA;
    }

    // De lo contrario, ordenar alfabéticamente
    valA = valA.toString().toLowerCase();
    valB = valB.toString().toLowerCase();

    if (valA < valB) return isAscending ? -1 : 1;
    if (valA > valB) return isAscending ? 1 : -1;
    return 0;
  });

  renderTable(filteredData);
}

// Función auxiliar para obtener valores según la llave de la columna
function getColumnValue(row, columnKey) {
  if (columnKey === 'META') {
    const metaKey = Object.keys(row).find(k => k.startsWith('META')) || 'META';
    return row[metaKey] || 0;
  }
  return row[columnKey] || '';
}

// ==========================================
// 5. RENDERIZADO DE TABLA
// ==========================================
function renderTable(data) {
  const tbody = document.querySelector('#agents-table tbody');
  tbody.innerHTML = '';

  if (!data || data.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;">No hay datos disponibles.</td></tr>';
    return;
  }

  data.forEach(row => {
    const metaKey = Object.keys(row).find(k => k.startsWith('META')) || 'META';
    
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${row['PROMOTOR'] || '-'}</strong></td>
      <td>${row['TRAINER'] || '-'}</td>
      <td>${row['SUPERVISOR'] || '-'}</td>
      <td>${row['COORDINADOR'] || '-'}</td>
      <td>${row[metaKey] || '0'}</td>
      <td>${row['CIERRE'] || '0'}</td>
      <td>${row['CUMPLIMIENTO MES'] || '0%'}</td>
      <td>${row['STATUS AGENTE'] || '-'}</td>
    `;
    tbody.appendChild(tr);
  });
}

// ==========================================
// 6. INICIALIZACIÓN
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('filter-mes').addEventListener('change', loadDashboardData);
  loadDashboardData();
});