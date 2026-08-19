// ==========================================
// 1. CONFIGURACIÓN DE ENLACES POR MES
// ==========================================
const MONTH_URLS = {
  febrero: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRlckyPnPqEGlq9J9wk_1HwxkfHQqt6X4wHxNtPpRg-RRATO3asLAigUxUyin9D1OS0joXIpJkG8-tL/pub?gid=0&single=true&output=csv',
  marzo: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRlckyPnPqEGlq9J9wk_1HwxkfHQqt6X4wHxNtPpRg-RRATO3asLAigUxUyin9D1OS0joXIpJkG8-tL/pub?gid=397555912&single=true&output=csv'
};

let rawData = [];

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

  // PapaParse descarga y limpia el CSV
  Papa.parse(csvUrl, {
    download: true,
    header: true,
    skipEmptyLines: true,
    transformHeader: function(h) {
      return h.trim(); // Quita espacios al inicio o final del nombre de las columnas
    },
    complete: function(results) {
      rawData = results.data;
      console.log(`Datos de ${selectedMonth} cargados exitosamente:`, rawData);
      
      resetSelect('filter-trainer');
      resetSelect('filter-supervisor');
      resetSelect('filter-coordinador');
      
      populateFilters(rawData);
      renderTable(rawData);
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

  const filtered = rawData.filter(item => {
    const matchTrainer = !trainerVal || item['TRAINER'] === trainerVal;
    const matchSupervisor = !supervisorVal || item['SUPERVISOR'] === supervisorVal;
    const matchCoordinador = !coordinadorVal || item['COORDINADOR'] === coordinadorVal;
    return matchTrainer && matchSupervisor && matchCoordinador;
  });

  renderTable(filtered);
}

// ==========================================
// 4. RENDERIZADO DE TABLA
// ==========================================
function renderTable(data) {
  const tbody = document.querySelector('#agents-table tbody');
  tbody.innerHTML = '';

  if (!data || data.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;">No hay datos disponibles.</td></tr>';
    return;
  }

  data.forEach(row => {
    // Busca automáticamente cualquier columna que empiece por META
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
// 5. INICIALIZACIÓN
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('filter-mes').addEventListener('change', loadDashboardData);
  loadDashboardData();
});