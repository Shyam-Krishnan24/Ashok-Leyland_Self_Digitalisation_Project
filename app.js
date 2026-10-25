/**
 * Ashok Leyland Engine History Card - Enterprise Manufacturing Execution System (MES)
 * Sequential Multi-Operator Assembly Line Quality Tracking System
 */

// Global App State
const API_BASE = window.location.origin;
let currentAuth = null;
let currentEngine = null;
let selectedEngineBarcode = null;
let currentInspectionResult = '';

// Quality inspection gates are inserted after every 25 operator stations.
// With the current 76-station master card, gates are after stations 25, 50 and 75.
const INSPECTION_INTERVAL = 25;

// Workforce / Supervisor state (backward-compatible with the original operator workflow)
const SUPERVISOR_USER = 'supervisor';
const DEFAULT_PIN = '1234';
const WORKFORCE_KEY = 'al_workforce_db_v2';
const ASSIGNMENTS_KEY = 'al_daily_assignments_v2';
const BREAK_REQUESTS_KEY = 'al_break_requests_v1';
const BREAK_DURATIONS = [5, 10, 15, 20, 30, 60, 120];

function getWorkforce() {
  try {
    const raw = localStorage.getItem(WORKFORCE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (e) { return {}; }
}

function saveWorkforce(data) {
  localStorage.setItem(WORKFORCE_KEY, JSON.stringify(data));
}

function getAssignments() {
  try {
    const raw = localStorage.getItem(ASSIGNMENTS_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (e) { return {}; }
}

function saveAssignments(data) {
  localStorage.setItem(ASSIGNMENTS_KEY, JSON.stringify(data));
}

function todayKey() {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

function ensureDefaultWorkforce() {
  const workforce = getWorkforce();
  let changed = false;
  STATIONS_LIST.forEach((station, i) => {
    const number = i + 1;
    ['D','A','N'].forEach(shift => {
      const username = `operator${shift.toLowerCase()}-${number}`;
      if (!workforce[username]) {
        workforce[username] = { username, name: `Operator ${number}`, role: 'operator', shift: shift === 'D' ? 'Day' : shift === 'A' ? 'Afternoon' : 'Night', active: true, temporary: false, stationId: station.id, pin: DEFAULT_PIN };
        changed = true;
      }
    });
  });
  if (changed) saveWorkforce(workforce);
  return workforce;
}

function getWorkerProfile(username) {
  const workforce = ensureDefaultWorkforce();
  return workforce[String(username || '').toLowerCase()] || null;
}

function getTodayAssignments() {
  const all = getAssignments();
  return all[todayKey()] || {};
}

function saveTodayAssignment(username, assignment) {
  const all = getAssignments();
  const key = todayKey();
  if (!all[key]) all[key] = {};
  all[key][username] = { ...assignment, assignedAt: new Date().toISOString() };
  saveAssignments(all);
}

function removeTodayAssignment(username) {
  const all = getAssignments();
  const key = todayKey();
  if (all[key]) { delete all[key][username]; saveAssignments(all); }
}

function getEffectiveStationForUser(username, fallbackStationId) {
  const assignment = getTodayAssignments()[String(username || '').toLowerCase()];
  if (assignment && assignment.stationId) {
    return STATIONS_LIST.find(s => s.id === assignment.stationId) || STATIONS_LIST[0];
  }
  return STATIONS_LIST.find(s => s.id === fallbackStationId) || STATIONS_LIST[0];
}

function getBreakRequests() {
  try {
    const raw = localStorage.getItem(BREAK_REQUESTS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}

function saveBreakRequests(requests) {
  localStorage.setItem(BREAK_REQUESTS_KEY, JSON.stringify(requests));
}

function getOpenBreakRequest(username) {
  return getBreakRequests().find(request =>
    request.username === String(username || '').toLowerCase() &&
    (request.status === 'pending' || request.status === 'approved')
  ) || null;
}

function isSupervisor() { return !!currentAuth && currentAuth.role === 'supervisor'; }
function isInspector() { return !!currentAuth && currentAuth.role === 'inspector'; }

function getInspectionCheckpoint(afterStationNumber) {
  const n = Number(afterStationNumber);
  if (!Number.isInteger(n) || n < INSPECTION_INTERVAL || n > TOTAL_STATIONS_COUNT || n % INSPECTION_INTERVAL !== 0) return null;
  return {
    number: n,
    key: String(n),
    afterStationNumber: n,
    afterStation: STATIONS_LIST[n - 1],
    nextStation: STATIONS_LIST[n] || null,
    label: `Inspection ${Math.ceil(n / INSPECTION_INTERVAL)}`
  };
}

function getInspectionCheckpointForOperator(operatorIndex) {
  const n = Number(operatorIndex);
  if (!Number.isInteger(n) || n <= 1) return null;
  return getInspectionCheckpoint(n - 1);
}

function getEngineInspection(engine, checkpointNumber) {
  return engine && engine.inspections && engine.inspections[String(checkpointNumber)]
    ? engine.inspections[String(checkpointNumber)]
    : null;
}

function getPendingInspectionEngines(checkpoint) {
  if (!checkpoint || !checkpoint.afterStation) return [];
  return getAllRegisteredEngines().filter(engine => {
    const previousSection = engine.sections && engine.sections[checkpoint.afterStation.id];
    if (!previousSection) return false;
    const inspection = getEngineInspection(engine, checkpoint.number);
    return !inspection || inspection.status !== 'PASSED';
  });
}

function isEngineReleasedThroughInspection(engine, checkpoint) {
  if (!checkpoint) return true;
  const inspection = getEngineInspection(engine, checkpoint.number);
  return !!inspection && inspection.status === 'PASSED';
}

// 75 Ordered Assembly & Quality Inspection Stations Definition
const STATIONS_LIST = [
  // Page 1
  { id: 'CB01', name: 'Block Preparation & Coolant Holes Check', page: 1 },
  { id: 'CB02', name: 'Block Guide & PCN Fitment', page: 1 },
  { id: 'CB03', name: 'Shell Bearing & Crankshaft Assembly', page: 1 },
  { id: 'CB04-CB05', name: 'Bearing Caps & Crankshaft Torquing', page: 1 },
  { id: 'CB06', name: 'Free Rotation & End Play Inspection (IPV-1)', page: 1 },
  { id: 'CB07', name: 'Oil Flow & Engine Name Plate Punching', page: 1 },
  { id: 'CB08', name: 'Transfer to Short Block Line', page: 1 },
  { id: 'SB01', name: 'Dowel Pins, Steel Balls & Oil Pump Assembly', page: 1 },
  { id: 'SB02', name: 'Timing Back Plate & Camshaft Assembly', page: 1 },

  // Page 2
  { id: 'SB03', name: 'Idler Gear & Flywheel Housing Fitment', page: 2 },
  { id: 'SB04', name: 'Flywheel Housing Torquing & PTFE Oil Seal', page: 2 },
  { id: 'SB04A', name: 'Idler Gear Nut Runner & Backlash Check', page: 2 },
  { id: 'SB05', name: 'FIP Sub-Assembly & Cam Sensor Fitment', page: 2 },
  { id: 'SB05A', name: 'Flywheel Mounting Torquing (180-360 Nm)', page: 2 },
  { id: 'SB06', name: 'Timing Gear Case Assembly & Tightening', page: 2 },
  { id: 'SB07', name: 'Damper Hub, Poly V Pulley & Lub Oil Pipes', page: 2 },
  { id: 'SB08', name: 'Piston / Con-rod Sub-Assembly Stuffing', page: 2 },

  // Page 3
  { id: 'SB08A', name: 'Conrod Caps Matching & Accumulator Bracket', page: 3 },
  { id: 'SB09A', name: 'Conrod Nut Runner Torquing & Strainer Fitment', page: 3 },
  { id: 'SB10-SB11', name: 'Piston Torque to Turn & Fuel Filter Studs', page: 3 },
  { id: 'SB12', name: 'Sump Sealant Application & Fitment', page: 3 },
  { id: 'SB13', name: 'Sump Nut Runner Torquing (34 Bolts)', page: 3 },
  { id: 'LB01', name: 'Front Lifting Bracket, Oil Cooler & Starter', page: 3 },
  { id: 'LB02', name: 'Cylinder Head Gasket & Head Sub-Assembly', page: 3 },
  { id: 'LB03', name: 'Exhaust Manifold & Water Pump Fitment', page: 3 },
  { id: 'LB03A', name: 'Push Rods & Rocker Lever Assembly', page: 3 },

  // Page 4
  { id: 'LB04', name: 'Cylinder Head Bolts Nut Runner Torquing', page: 4 },
  { id: 'LB05', name: 'Rocker Lever Torquing & Air Compressor Fitment', page: 4 },
  { id: 'LB05A', name: 'Valve Clearance (Tappet Setting) Checking', page: 4 },
  { id: 'LB06', name: 'Air Compressor Bracket & Rear Hanger Fitment', page: 4 },
  { id: 'LB07', name: 'Fuel Rail (Common Rail) & Injector Fitment', page: 4 },
  { id: 'LB08', name: 'Injector Clamping Nut Runner Torquing', page: 4 },
  { id: 'LB08A', name: 'Rocker Cover & Internal Wiring Harness', page: 4 },
  { id: 'LB09', name: 'Turbocharger Sub-Assembly Fitment', page: 4 },
  { id: 'LB10', name: 'Turbo Oil Feed / Drain Pipes & Heat Shield', page: 4 },
  { id: 'LB10A', name: 'EGR Cooler Sub-Assembly Fitment', page: 4 },

  // Page 5
  { id: 'LB11', name: 'Alternator & AC Compressor Fitment', page: 5 },
  { id: 'LB12', name: 'Auto Tensioner & Idler Pulley Assembly', page: 5 },
  { id: 'LB12A', name: 'Poly V Belt Routing & Tension Check (Q-GATE-1)', page: 5 },
  { id: 'LB13', name: 'Coolant Outlet Pipe & Thermostat Fitment', page: 5 },
  { id: 'LB13A', name: 'Water Pipe & Bypass Hose Clamping', page: 5 },
  { id: 'LB14', name: 'EGR Coolant Pipes & Support Brackets', page: 5 },
  { id: 'LB15', name: 'Exhaust Brake Valve Fitment', page: 5 },
  { id: 'LB16', name: 'Engine Wiring Harness Routing & Sensor Hookup', page: 5 },
  { id: 'LB16A', name: 'Wiring Harness Clamping & Securing', page: 5 },
  { id: 'LB17', name: 'Damper Nut Final Nut Runner Torquing', page: 5 },
  { id: 'LB18', name: 'Fan Adaptor & Viscometric Fan Fitment', page: 5 },

  // Page 6
  { id: 'LB19', name: 'Oil Level Gauge (Dipstick) Tube Fitment', page: 6 },
  { id: 'LB20', name: 'CCV / OCV Filter Assembly Fitment', page: 6 },
  { id: 'LB20A', name: 'CCV Hoses & Drain Pipe Fitment', page: 6 },
  { id: 'LB21', name: 'Fuel High Pressure Pipes Fitment (1 to 6)', page: 6 },
  { id: 'LB22', name: 'HP Pipes Final Torquing & Clamping', page: 6 },
  { id: 'LB22A', name: 'Fuel Return Lines & Leak-off Connections', page: 6 },
  { id: 'LB23', name: 'Air Intake Manifold / Elbow Fitment', page: 6 },
  { id: 'LB23A', name: 'Intake Throttle Valve (ITV) Fitment', page: 6 },

  // Page 7
  { id: 'LB24', name: 'Sensors (CR Pressure, Boost, Cam, Crank) Fitment', page: 7 },
  { id: 'LB25', name: 'Oil Pressure & Coolant Temp Sensors Fitment', page: 7 },
  { id: 'LB26', name: 'Glow Plugs / Heater Fitment & Wiring', page: 7 },
  { id: 'LB26A', name: 'Engine ECU Bracket & ECU Fitment', page: 7 },
  { id: 'LB27', name: 'Engine Ground Cable & Heat Sleeves Check', page: 7 },
  { id: 'LB28', name: 'HC Dozer Injector & Coolant Lines Fitment', page: 7 },
  { id: 'LB28A', name: 'Rocker Cover Wire Bracket & Breather Hose', page: 7 },
  { id: 'LB29', name: 'Oil Filler Cap & Secondary Seals Check', page: 7 },
  { id: 'LB30', name: 'Flywheel Housing Axial Sensor Verification', page: 7 },
  { id: 'LB30A', name: 'Transport Brackets & Dummy Caps Fitment', page: 7 },
  { id: 'LB31', name: 'Final Mechanical Fastener Torque Verification', page: 7 },

  // Page 8
  { id: 'LB32', name: 'Coolant Hose Clamps Final Torque Verification', page: 8 },
  { id: 'LB33', name: 'ECOS System Cold Leak Testing Validation', page: 8 },
  { id: 'LB34', name: 'Engine Oil Filling (Specified Grade & Vol)', page: 8 },
  { id: 'LB35', name: 'End of Line Q-GATE-4 Comprehensive Audit', page: 8 },
  { id: 'LB36', name: 'Engine Lifting Decision: Testing vs Rectification', page: 8 },

  // Page 9 & 10
  { id: 'PAGE9-QR', name: 'Aggregate QR Code Scanning & Serialization Grid', page: 9 },
  { id: 'TESTING-LEAK', name: 'Hot Testing Inspector Check: Leak & Noise', page: 10 },
  { id: 'DRESSING', name: 'Engine Dressing Points Verification', page: 10 },
  { id: 'FINAL-INSP', name: 'Final Quality Inspection Points (1 to 52)', page: 10 },
  { id: 'FIREWALL-PASS', name: 'Quality Firewall Sign-Off & Release', page: 10 }
];

const TOTAL_STATIONS_COUNT = STATIONS_LIST.length;

// Initialization
document.addEventListener('DOMContentLoaded', () => {
  ensureDefaultWorkforce();
  initLoginHelper();
  checkAuthSession();
  window.addEventListener('storage', event => {
    if (event.key === BREAK_REQUESTS_KEY) {
      if (isSupervisor()) renderSupervisorDashboard();
      updateBreakRequestButton();
    }
    if (event.key === ASSIGNMENTS_KEY) {
      if (isSupervisor()) {
        renderSupervisorDashboard();
      } else if (currentAuth && currentAuth.role === 'operator') {
        const currentStationId = currentAuth.stationId;
        currentAuth.stationObj = getEffectiveStationForUser(currentAuth.username, currentAuth.stationId);
        currentAuth.stationId = currentAuth.stationObj.id;
        if (currentStationId !== currentAuth.stationId && document.getElementById('view-station')?.classList.contains('active')) {
          currentAuth.operatorIndex = STATIONS_LIST.findIndex(station => station.id === currentAuth.stationId) + 1;
          renderTestSectionWorkspace();
          showToast(`Your station assignment changed to ${currentAuth.stationId}.`, 'info');
        }
      }
    }
  });
  window.setInterval(updateBreakRequestButton, 30000);
});

/**
 * Populate quick-access login selector helper with Day, Afternoon, and Night Shifts
 */
function initLoginHelper() {
  const select = document.getElementById('login-quick-select');
  if (!select) return;

  select.innerHTML = '<option value="">-- Quick Select User --</option><option value="supervisor">👨‍💼 Supervisor - Overall Access</option><option value="inspector">🔎 Inspector - Quality Inspection</option>';
  
  // Day Shift Group (operatord-1 to operatord-75)
  const optGroupDay = document.createElement('optgroup');
  optGroupDay.label = `Day Shift (operatord-1 to operatord-${TOTAL_STATIONS_COUNT})`;
  for (let i = 1; i <= TOTAL_STATIONS_COUNT; i++) {
    const station = STATIONS_LIST[i - 1];
    const opt = document.createElement('option');
    opt.value = `operatord-${i}`;
    opt.textContent = `operatord-${i} - [${station.id}] ${station.name}`;
    optGroupDay.appendChild(opt);
  }
  select.appendChild(optGroupDay);

  // Afternoon Shift Group (operatora-1 to operatora-75)
  const optGroupAfternoon = document.createElement('optgroup');
  optGroupAfternoon.label = `Afternoon Shift (operatora-1 to operatora-${TOTAL_STATIONS_COUNT})`;
  for (let i = 1; i <= TOTAL_STATIONS_COUNT; i++) {
    const station = STATIONS_LIST[i - 1];
    const opt = document.createElement('option');
    opt.value = `operatora-${i}`;
    opt.textContent = `operatora-${i} - [${station.id}] ${station.name}`;
    optGroupAfternoon.appendChild(opt);
  }
  select.appendChild(optGroupAfternoon);

  // Night Shift Group (operatorn-1 to operatorn-75)
  const optGroupNight = document.createElement('optgroup');
  optGroupNight.label = `Night Shift (operatorn-1 to operatorn-${TOTAL_STATIONS_COUNT})`;
  for (let i = 1; i <= TOTAL_STATIONS_COUNT; i++) {
    const station = STATIONS_LIST[i - 1];
    const opt = document.createElement('option');
    opt.value = `operatorn-${i}`;
    opt.textContent = `operatorn-${i} - [${station.id}] ${station.name}`;
    optGroupNight.appendChild(opt);
  }
  select.appendChild(optGroupNight);

  select.addEventListener('change', (e) => {
    if (e.target.value) {
      document.getElementById('login-username').value = e.target.value;
      document.getElementById('login-password').value = '1234';
    }
  });
}

/**
 * Handle Operator Login Authentication (Day: operatord-X, Afternoon: operatora-X, Night: operatorn-X)
 */
function handleLogin(e) {
  if (e) e.preventDefault();

  const userField = document.getElementById('login-username');
  const passField = document.getElementById('login-password');
  const errorMsg = document.getElementById('login-error-msg');
  if (errorMsg) errorMsg.style.display = 'none';

  const username = (userField ? userField.value : '').trim().toLowerCase();
  const password = (passField ? passField.value : '').trim();
  if (!username || !password) return showLoginError('Please enter both Username and Password');

  // Dedicated quality inspector account. Inspector work is queue-based and only appears at 25/50/75 gates.
  if (username === 'inspector' || username === 'inspector1') {
    if (password !== DEFAULT_PIN) return showLoginError('Invalid Inspector PIN. Use the configured inspector PIN.');
    currentAuth = {
      username: 'inspector', role: 'inspector',
      displayName: 'Inspector • Quality Inspection', shift: 'All Shifts',
      operatorIndex: null, stationId: null, stationObj: null
    };
    localStorage.setItem('al_auth_user', JSON.stringify(currentAuth));
    currentEngine = null;
    currentInspectionResult = '';
    updateTopbarDisplay();
    switchView('station');
    return;
  }

  // Supervisor has overall access to workforce, assignments, engines and master cards.
  if (username === SUPERVISOR_USER || username === 'supervisor1') {
    if (password !== DEFAULT_PIN) return showLoginError('Invalid Supervisor PIN. Use the configured supervisor PIN.');
    currentAuth = { username: SUPERVISOR_USER, role: 'supervisor', displayName: 'Supervisor • Overall Access', shift: 'All Shifts', operatorIndex: null, stationId: null, stationObj: null };
    localStorage.setItem('al_auth_user', JSON.stringify(currentAuth));
    updateTopbarDisplay();
    switchView('supervisor');
    return;
  }

  const profile = getWorkerProfile(username);
  if (!profile) return showLoginError('User not found. Ask the supervisor to add or activate this worker.');
  if (profile.active === false) return showLoginError('This worker account is inactive. Contact the supervisor.');
  if (password !== (profile.pin || DEFAULT_PIN)) return showLoginError('Invalid Password / PIN');

  const dayMatch = username.match(/^operatord-(\d+)$/i);
  const afternoonMatch = username.match(/^operatora-(\d+)$/i);
  const nightMatch = username.match(/^operatorn-(\d+)$/i);
  let operatorIndex = profile.stationId ? STATIONS_LIST.findIndex(s => s.id === profile.stationId) + 1 : 1;
  if (dayMatch || afternoonMatch || nightMatch) operatorIndex = parseInt((dayMatch || afternoonMatch || nightMatch)[1], 10);
  const fallbackStation = STATIONS_LIST[operatorIndex - 1] || STATIONS_LIST[0];
  const effectiveStation = getEffectiveStationForUser(username, profile.stationId || fallbackStation.id);
  operatorIndex = STATIONS_LIST.findIndex(station => station.id === effectiveStation.id) + 1;
  const shiftText = profile.shift === 'Afternoon' ? 'Afternoon' : profile.shift === 'Night' ? 'Night' : 'Day';

  currentAuth = {
    username, operatorIndex, shift: shiftText, role: profile.role || 'operator', temporary: !!profile.temporary,
    stationId: effectiveStation.id, stationObj: effectiveStation, displayName: profile.name || 'Operator'
  };
  localStorage.setItem('al_auth_user', JSON.stringify(currentAuth));
  updateTopbarDisplay();
  switchView('station');
}

function showLoginError(msg) {
  const errorMsg = document.getElementById('login-error-msg');
  if (errorMsg) {
    errorMsg.textContent = msg;
    errorMsg.style.display = 'block';
  } else {
    showToast(msg, 'error');
  }
}

/**
 * Check existing authentication session
 */
function checkAuthSession() {
  try {
    const saved = localStorage.getItem('al_auth_user');
    if (saved) {
      currentAuth = JSON.parse(saved);
      if (currentAuth && currentAuth.role === 'supervisor') {
        updateTopbarDisplay();
        switchView('supervisor');
        return;
      }
      if (currentAuth && currentAuth.role === 'inspector') {
        currentEngine = null;
        currentInspectionResult = '';
        updateTopbarDisplay();
        switchView('station');
        return;
      }
      if (currentAuth && currentAuth.username) {
        const profile = getWorkerProfile(currentAuth.username);
        const fallback = currentAuth.stationId || (STATIONS_LIST[(currentAuth.operatorIndex || 1) - 1] || STATIONS_LIST[0]).id;
        currentAuth.stationObj = getEffectiveStationForUser(currentAuth.username, fallback);
        currentAuth.stationId = currentAuth.stationObj.id;
        currentAuth.operatorIndex = STATIONS_LIST.findIndex(station => station.id === currentAuth.stationId) + 1;
        if (profile) currentAuth.displayName = profile.name || 'Operator';
        updateTopbarDisplay();
        switchView('station');
        return;
      }
    }
  } catch (e) {}

  switchView('login');
}

/**
 * Handle Operator Logout
 */
function handleLogout() {
  localStorage.removeItem('al_auth_user');
  currentAuth = null;
  currentEngine = null;
  currentInspectionResult = '';
  selectedEngineBarcode = null;
  updateTopbarDisplay();
  switchView('login');
}

/**
 * Update top bar header with authenticated operator information
 */
function updateTopbarDisplay() {
  const topbarOp = document.getElementById('topbar-op-display');
  const userSidebarTag = document.getElementById('sidebar-user-tag');

  if (currentAuth) {
    const text = currentAuth.displayName;
    if (topbarOp) topbarOp.textContent = text;
    if (userSidebarTag) userSidebarTag.textContent = text;
  } else {
    if (topbarOp) topbarOp.textContent = 'Not Signed In';
    if (userSidebarTag) userSidebarTag.textContent = 'Not Signed In';
  }

  const supervisorTab = document.getElementById('tab-supervisor');
  const supervisorView = document.getElementById('view-supervisor');
  const stationTab = document.getElementById('tab-station');
  const supervisorVisible = isSupervisor();
  if (supervisorTab) supervisorTab.hidden = !supervisorVisible;
  if (supervisorView) supervisorView.hidden = !supervisorVisible;
  // Test sections are an operator/inspector workspace, never a supervisor workspace.
  if (stationTab) stationTab.hidden = supervisorVisible;
  updateBreakRequestButton();
}

function updateBreakRequestButton() {
  const button = document.getElementById('break-request-button');
  const status = document.getElementById('break-request-status');
  if (!button || !status) return;
  const isOperator = !!currentAuth && currentAuth.role === 'operator';
  button.hidden = !isOperator;
  status.hidden = !isOperator;
  if (!isOperator) return;

  const request = getOpenBreakRequest(currentAuth.username);
  button.disabled = !!request;
  if (!request) {
    button.textContent = '☕ Request Break';
    status.textContent = '';
    status.className = 'break-request-status';
  } else if (request.status === 'pending') {
    button.textContent = 'Break Requested';
    status.textContent = `${request.durationLabel} requested • Waiting for supervisor`;
    status.className = 'break-request-status pending';
  } else {
    const elapsed = Date.parse(request.endsAt) <= Date.now();
    button.textContent = elapsed ? 'Break Awaiting Closure' : 'On Break';
    status.textContent = elapsed
      ? 'Break time elapsed • Waiting for supervisor'
      : `Break approved • Ends ${new Date(request.endsAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
    status.className = 'break-request-status approved';
  }
}

function openBreakRequestDialog() {
  if (!currentAuth || currentAuth.role !== 'operator') return;
  if (getOpenBreakRequest(currentAuth.username)) {
    updateBreakRequestButton();
    return;
  }
  const dialog = document.getElementById('break-request-dialog');
  if (dialog && typeof dialog.showModal === 'function') dialog.showModal();
}

function submitBreakRequest(event) {
  if (event) event.preventDefault();
  if (!currentAuth || currentAuth.role !== 'operator') return;

  const duration = Number(document.getElementById('break-duration')?.value);
  if (!BREAK_DURATIONS.includes(duration)) {
    showToast('Choose a valid break duration.', 'warning');
    return;
  }
  if (getOpenBreakRequest(currentAuth.username)) {
    showToast('You already have a pending or active break request.', 'warning');
    updateBreakRequestButton();
    return;
  }

  const station = getEffectiveStationForUser(currentAuth.username, currentAuth.stationId);
  const requestedAt = new Date().toISOString();
  const request = {
    id: `break-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    username: currentAuth.username,
    operatorName: currentAuth.displayName,
    shift: currentAuth.shift,
    stationId: station.id,
    stationName: station.name,
    durationMinutes: duration,
    durationLabel: duration < 60 ? `${duration} min` : `${duration / 60} hour${duration === 120 ? 's' : ''}`,
    requestedAt,
    status: 'pending'
  };
  saveBreakRequests([request, ...getBreakRequests()]);
  const dialog = document.getElementById('break-request-dialog');
  if (dialog && typeof dialog.close === 'function') dialog.close();
  updateBreakRequestButton();
  showToast('Break request sent to the supervisor.', 'success');
}

/**
 * View Switcher
 * @param {'login'|'station'|'fullcard'|'supervisor'} viewName 
 */
function switchView(viewName) {
  if (!currentAuth && viewName !== 'login') {
    viewName = 'login';
  }
  if (viewName === 'supervisor' && !isSupervisor()) {
    viewName = 'station';
  }
  if (viewName === 'station' && isSupervisor()) {
    viewName = 'supervisor';
  }

  document.querySelectorAll('.app-view').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.sidebar-nav-btn').forEach(btn => btn.classList.remove('active'));

  const targetView = document.getElementById(`view-${viewName}`);
  const targetTab = document.getElementById(`tab-${viewName}`);

  if (targetView) targetView.classList.add('active');
  if (targetTab) targetTab.classList.add('active');

  const appLayout = document.querySelector('.app-layout');
  if (viewName === 'login') {
    if (appLayout) appLayout.classList.add('login-mode');
  } else {
    if (appLayout) appLayout.classList.remove('login-mode');
  }

  if (viewName === 'station') {
    renderTestSectionWorkspace();
  } else if (viewName === 'fullcard') {
    renderMasterCardView();
  } else if (viewName === 'supervisor') {
    renderSupervisorDashboard();
  }
}

// Window attachments for inline HTML handlers
window.handleLogin = handleLogin;
window.handleLogout = handleLogout;
window.switchView = switchView;
window.openBreakRequestDialog = openBreakRequestDialog;
window.submitBreakRequest = submitBreakRequest;
window.assignBreakCover = assignBreakCover;
window.createAndAssignTemporaryCover = createAndAssignTemporaryCover;
window.declineBreakRequest = declineBreakRequest;
window.completeBreakRequest = completeBreakRequest;
window.submitActiveStation = submitActiveStation;
window.setRowStatus = setRowStatus;
window.handleRemarkInput = handleRemarkInput;
window.selectEngineFromQueue = selectEngineFromQueue;
window.clearActiveEngine = clearActiveEngine;
window.loadMasterCardForBarcode = loadMasterCardForBarcode;
window.toggleAuditCard = toggleAuditCard;
window.setHpOption = setHpOption;
window.setShiftOption = setShiftOption;
window.saveDailyAssignment = saveDailyAssignment;
window.addTemporaryWorker = addTemporaryWorker;
window.toggleWorkerActive = toggleWorkerActive;
window.deleteTemporaryWorker = deleteTemporaryWorker;
window.supervisorOpenStation = supervisorOpenStation;
window.setInspectionResult = setInspectionResult;
window.submitInspectionResult = submitInspectionResult;

let currentSelectedHp = '250 HP';
let currentSelectedShift = 'I';

function setHpOption(hp) {
  currentSelectedHp = hp;
  document.querySelectorAll('.hp-box-clickable').forEach(el => {
    el.classList.toggle('active', el.getAttribute('data-hp') === hp);
  });
}

function setShiftOption(shift) {
  currentSelectedShift = shift;
  document.querySelectorAll('.shift-box-clickable').forEach(el => {
    el.classList.toggle('active', el.getAttribute('data-shift') === shift);
  });
}

/**
 * RENDER TEST SECTION WORKSPACE FOR CURRENT OPERATOR
 * Features authentic Image 1 Document Header & Precaution/Specification Block
 */
function renderTestSectionWorkspace() {
  if (!currentAuth) {
    switchView('login');
    return;
  }
  if (isSupervisor()) {
    switchView('supervisor');
    return;
  }

  if (isInspector()) {
    renderInspectionWorkspace();
    return;
  }

  const container = document.getElementById('active-station-workspace-container');
  if (!container) return;

  const currentStationObj = getEffectiveStationForUser(currentAuth.username, currentAuth.stationId);
  currentAuth.stationId = currentStationObj.id;
  currentAuth.stationObj = currentStationObj;

  // Default shift selection according to logged in operator
  if (currentAuth.shift.includes('Afternoon')) currentSelectedShift = 'II';
  else if (currentAuth.shift.includes('Night')) currentSelectedShift = 'III';
  else currentSelectedShift = 'I';

  if (currentAuth.operatorIndex === 1) {
    renderStation1Workspace(container, currentStationObj);
  } else {
    renderSubsequentStationWorkspace(container, currentStationObj);
  }
}

/**
 * Helper to build the authentic Image 1 Header Card & Component Serials Table
 */
function buildOfficialDocumentHeaderHtml(engine, isStation1 = false) {
  const engineNo = engine ? engine.barcode : '';
  const dateStr = engine && engine.date ? new Date(engine.date).toLocaleDateString() : new Date().toLocaleDateString();
  const shiftVal = engine && engine.shift ? engine.shift : currentSelectedShift;
  const hpVal = engine && engine.hp_rating ? engine.hp_rating : currentSelectedHp;
  const comps = (engine && engine.components) || {};

  return `
    <div class="official-history-card-header-block">
      <!-- Top Brand Line -->
      <div class="official-doc-header">
        <div class="header-left">
          <div class="company-logo-text">Ashok Leyland</div>
          <div class="plant-location">Hosur - I</div>
        </div>
        <div class="header-center">
          <div class="safety-instruction-en">Close the opened parts in Engine</div>
          <div class="safety-instruction-ta">என்ஜினின் திறந்திருக்கும் பாகங்களை மூடுக</div>
          <div class="safety-instruction-ta-sub">எஞ்சினில் திறந்து வைத்தால் தூசுகள் ஒட்டிக்கொள்ளும்</div>
        </div>
        <div class="header-right">
          <div class="brand-title">ASHOK LEYLAND</div>
          <div class="brand-tagline">Koi Manzil Door Nahin</div>
        </div>
      </div>

      <!-- Title Bar -->
      <div class="card-title-bar">
        <h1 class="card-main-title">"H" SERIES ENGINE HISTORY CARD (AUTO ENGINES)</h1>
        <div class="document-code">HLEF 4790F-L2A</div>
      </div>

      <!-- Engine Meta Specification Form -->
      <div class="engine-meta-form">
        <div class="meta-row meta-row-1">
          <div class="field-group flex-2">
            <label for="header-engine-no">Engine No. / Spec.:</label>
            <input type="text" id="header-engine-no" value="${engineNo}" placeholder="Enter Engine No." ${!isStation1 ? 'readonly' : ''} oninput="syncEngineInputs(this.value)">
          </div>
          <div class="field-group flex-1">
            <label for="header-date">Date :</label>
            <input type="text" id="header-date" value="${dateStr}" readonly>
          </div>
          <div class="field-group flex-1 shift-group">
            <label>Shift :</label>
            <div class="shift-options">
              <span class="shift-box shift-box-clickable ${shiftVal === 'I' ? 'active' : ''}" data-shift="I" onclick="setShiftOption('I')">I</span>
              <span class="shift-box shift-box-clickable ${shiftVal === 'II' ? 'active' : ''}" data-shift="II" onclick="setShiftOption('II')">II</span>
              <span class="shift-box shift-box-clickable ${shiftVal === 'III' ? 'active' : ''}" data-shift="III" onclick="setShiftOption('III')">III</span>
            </div>
          </div>
        </div>

        <div class="meta-row meta-row-2">
          <div class="barcode-box">
            <label for="header-barcode-input" class="barcode-label">PASTE BAR CODE STICKER HERE</label>
            <input type="text" id="header-barcode-input" class="barcode-input" placeholder="Enter Bar Code" value="${engineNo}" ${!isStation1 ? 'readonly' : ''} oninput="syncEngineInputs(this.value)">
          </div>
          <div class="model-spec-block">
            <div class="model-title-row">
              <span class="model-label">Model</span>
              <span class="model-value">H6 BSVI - 4V Engines</span>
              <div class="hp-options">
                <span class="hp-box hp-box-clickable ${hpVal === '250 HP' ? 'active' : ''}" data-hp="250 HP" onclick="setHpOption('250 HP')">250 HP</span>
                <span class="hp-box hp-box-clickable ${hpVal === '280 HP' ? 'active' : ''}" data-hp="280 HP" onclick="setHpOption('280 HP')">280 HP</span>
              </div>
            </div>
            <div class="deviation-box">
              <label for="header-major-deviation">Major Deviation Observed, to be taken care in all stages</label>
              <input type="text" id="header-major-deviation" value="${engine ? (engine.major_deviation || '') : ''}">
            </div>
          </div>
        </div>
      </div>

      <!-- Server Note -->
      <aside class="server-note">
        <p><strong>Note :</strong> Sl. No. CB05, SB04A, 05A, 09A, LB04, 08 &amp; 17- Nut runner datas stored in respective machine Computers / Servers</p>
      </aside>

      <!-- Precaution Section -->
      <section class="precautions-section">
        <h2 class="precautions-heading">PRECAUTION:</h2>
        <ol>
          <li>Ensure all parts are cleaned. Should be free from dust, scuff, burr, oil and paint.</li>
          <li>Lubricate with Engine oil wherever necessary.</li>
          <li>Nuts / Bolts must turn while torqueing</li>
          <li>Refer work instruction sheet.</li>
          <li>Write 'S' in the Remarks column for shortage, If any assembly issues, Write the details in the respective rows in detail.</li>
        </ol>
      </section>

      <!-- 12 Components Serial Numbers Table -->
      <section class="components-serial-section">
        <table class="serial-numbers-table">
          <tbody>
            <tr>
              <td><strong>1. Cylinder Block Sl.No.</strong></td>
              <td><input type="text" id="comp-1" value="${comps.c1 || ''}"></td>
              <td><strong>7. FIP Sl.No. &amp; Type</strong></td>
              <td><input type="text" id="comp-7" value="${comps.c7 || ''}"></td>
            </tr>
            <tr>
              <td><strong>2. Block Model</strong></td>
              <td>PCN model only</td>
              <td><strong>8. Air compressor Sl.No.</strong></td>
              <td><input type="text" id="comp-8" value="${comps.c8 || ''}"></td>
            </tr>
            <tr>
              <td><strong>3. Liner color on Block</strong></td>
              <td>
                <span class="checkbox-option"><input type="checkbox" id="comp-3-y" ${comps.c3 === 'Yellow' ? 'checked' : ''}> Yellow</span>
                <span class="checkbox-option"><input type="checkbox" id="comp-3-b" ${comps.c3 === 'Blue' ? 'checked' : ''}> Blue</span>
              </td>
              <td><strong>9. Starter motor Sl.No./ Make</strong></td>
              <td>LTVS / SEG <input type="text" class="inline-input" id="comp-9" value="${comps.c9 || ''}"></td>
            </tr>
            <tr>
              <td><strong>4. Crank shaft brg make</strong></td>
              <td>BM <input type="text" class="inline-input" id="comp-4" value="${comps.c4 || ''}"></td>
              <td><strong>10. Alternator Sl.No. / Make</strong></td>
              <td>LTVS / SEG <input type="text" class="inline-input" id="comp-10" value="${comps.c10 || ''}"></td>
            </tr>
            <tr>
              <td><strong>5. Thrust washer make</strong></td>
              <td>BM <input type="text" class="inline-input" id="comp-5" value="${comps.c5 || ''}"></td>
              <td><strong>11. Turbocharger Sl.No. / Make</strong></td>
              <td>TEL / CTTL <input type="text" class="inline-input" id="comp-11" value="${comps.c11 || ''}"></td>
            </tr>
            <tr>
              <td><strong>6. Cr. shaft Sl.No.</strong></td>
              <td><input type="text" id="comp-6" value="${comps.c6 || ''}"></td>
              <td><strong>12. Cyl. head serial No.</strong></td>
              <td><input type="text" id="comp-12" value="${comps.c12 || ''}"></td>
            </tr>
          </tbody>
        </table>
      </section>
    </div>
  `;
}

function syncEngineInputs(val) {
  const el1 = document.getElementById('header-engine-no');
  const el2 = document.getElementById('header-barcode-input');
  if (el1 && el1.value !== val) el1.value = val;
  if (el2 && el2.value !== val) el2.value = val;
}

/**
 * Operator 1 Workspace (Station 1: CB01)
 */
function renderStation1Workspace(container, stationObj) {
  let html = `
    <div class="page-container test-section-document-card">
      <!-- Authentic Ashok Leyland Image 1 Document Header Block -->
      ${buildOfficialDocumentHeaderHtml(currentEngine, true)}

      <!-- Clean Station Title -->
      <div class="station-section-banner">
        <span class="station-badge">${stationObj.id}</span>
        <h2>${stationObj.id} - ${stationObj.name}</h2>
        <span class="station-op-tag">${currentAuth.displayName}</span>
      </div>

      <!-- Checklist Table -->
      <div class="station-table-container">
        ${generateChecklistTableHtml(stationObj.id, currentEngine)}
      </div>

      <!-- Single Simple SUBMIT Button -->
      <div class="station-submit-bar">
        <button type="button" class="btn-single-submit" onclick="submitActiveStation('${stationObj.id}')">
          SUBMIT
        </button>
      </div>
    </div>
  `;

  container.innerHTML = html;
}

/**
 * Operator 2..N Workspace (Station 2..N)
 */
function renderSubsequentStationWorkspace(container, stationObj) {
  const prevStationIndex = currentAuth.operatorIndex - 2;
  const prevStationObj = STATIONS_LIST[prevStationIndex];

  const allEngines = getAllRegisteredEngines();

  const inspectionGate = getInspectionCheckpointForOperator(currentAuth.operatorIndex);
  const pendingEngines = allEngines.filter(eng => {
    const hasPrev = eng.sections && eng.sections[prevStationObj.id];
    const isCompletedHere = eng.sections && eng.sections[stationObj.id];
    if (!hasPrev || isCompletedHere) return false;
    return isEngineReleasedThroughInspection(eng, inspectionGate);
  });

  const gatedEnginesWaitingForInspection = inspectionGate
    ? allEngines.filter(eng => {
        const hasPrev = eng.sections && eng.sections[prevStationObj.id];
        const isCompletedHere = eng.sections && eng.sections[stationObj.id];
        return hasPrev && !isCompletedHere && !isEngineReleasedThroughInspection(eng, inspectionGate);
      })
    : [];

  const completedEnginesHere = allEngines.filter(eng => {
    return eng.sections && eng.sections[stationObj.id];
  });

  // If no engine selected, show the incoming engine queue menu
  if (!currentEngine) {
    let html = `
      <div class="page-container test-section-document-card">
        <div class="station-section-banner">
          <span class="station-badge">${stationObj.id}</span>
          <h2>${stationObj.id} - ${stationObj.name}</h2>
          <span class="station-op-tag">${currentAuth.displayName}</span>
        </div>

        <div class="engine-queue-section">
          <div class="queue-header">
            <h2>📋 Engines Ready for Inspection (${pendingEngines.length} in Queue)</h2>
            <p>${inspectionGate
              ? `Quality gate after <strong>Operator ${inspectionGate.afterStationNumber} [${inspectionGate.afterStation.id}]</strong>. Only engines passed by the Inspector can continue to <strong>${stationObj.id}</strong>.`
              : `Select an engine submitted by <strong>Operator ${currentAuth.operatorIndex - 1} [${prevStationObj.id}]</strong> to begin inspection for <strong>${stationObj.id}</strong>.`}</p>
            ${inspectionGate && gatedEnginesWaitingForInspection.length > 0 ? `<div class="queue-gate-note">🔒 ${gatedEnginesWaitingForInspection.length} engine(s) are waiting for the ${escapeHtml(inspectionGate.label)} before ${escapeHtml(stationObj.id)}.</div>` : ''}
          </div>

          <div class="engine-queue-grid">`;

    if (pendingEngines.length === 0) {
      html += `
        <div class="empty-queue-card">
          <span class="empty-queue-icon">⏳</span>
          <h3>No Pending Engines in Queue</h3>
          <p>When <strong>Operator ${currentAuth.operatorIndex - 1}</strong> submits an engine at <strong>[${prevStationObj.id}]</strong>, it will appear here automatically.</p>
        </div>`;
    } else {
      pendingEngines.forEach(eng => {
        const prevSec = eng.sections[prevStationObj.id];
        const submittedTime = prevSec.submitted_at ? new Date(prevSec.submitted_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Recent';
        
        html += `
          <div class="queue-engine-card" onclick="selectEngineFromQueue('${eng.barcode}')">
            <div class="queue-card-top">
              <span class="queue-barcode-tag">║▌ ${eng.barcode}</span>
              <span class="queue-time-tag">⏰ ${submittedTime}</span>
            </div>
            <div class="queue-card-body">
              <strong class="queue-model">${eng.spec || 'H6 BSVI - 4V'} (${eng.hp_rating || '250 HP'})</strong>
              <div class="queue-prev-op">
                <span>Prior Inspector:</span>
                <strong>${prevSec.operator_name || prevSec.operator_token}</strong>
              </div>
            </div>
            <div class="queue-card-action">
              <button type="button" class="btn-start-inspection">Select Engine &amp; Inspect →</button>
            </div>
          </div>`;
      });
    }

    html += `
          </div>
        </div>`;

    if (completedEnginesHere.length > 0) {
      html += `
        <div class="completed-history-section">
          <h3>✅ Completed by You at ${stationObj.id} (${completedEnginesHere.length} Engines)</h3>
          <div class="completed-chips-row">
            ${completedEnginesHere.map(eng => `
              <button type="button" class="completed-chip-btn" onclick="selectEngineFromQueue('${eng.barcode}')">
                ✓ ${eng.barcode}
              </button>
            `).join('')}
          </div>
        </div>`;
    }

    html += `</div>`;
    container.innerHTML = html;
    return;
  }

  // Engine is selected: render Image 1 Document Header + Predecessor Audit + Active Checklist + SUBMIT
  const prevIndex = currentAuth.operatorIndex - 1;
  let html = `
    <div class="page-container test-section-document-card">
      <div class="active-engine-bar-top">
        <span>Inspecting Engine: <strong>${currentEngine.barcode}</strong></span>
        <button type="button" class="btn-change-engine" onclick="clearActiveEngine()">
          ↩ Return to Queue Menu
        </button>
      </div>

      <!-- Authentic Ashok Leyland Image 1 Document Header Block -->
      ${buildOfficialDocumentHeaderHtml(currentEngine, false)}

      <!-- Clean Station Title -->
      <div class="station-section-banner">
        <span class="station-badge">${stationObj.id}</span>
        <h2>${stationObj.id} - ${stationObj.name}</h2>
        <span class="station-op-tag">${currentAuth.displayName}</span>
      </div>

      <!-- Predecessor Audit Stream (Prior Operators' entries) -->
      <div class="predecessor-audit-container">
        ${generatePredecessorAuditHtml(prevIndex, currentEngine)}
      </div>

      <!-- Active Station Checklist -->
      <div class="station-table-container">
        ${generateChecklistTableHtml(stationObj.id, currentEngine)}
      </div>

      <!-- Single Simple SUBMIT Button -->
      <div class="station-submit-bar">
        <button type="button" class="btn-single-submit" onclick="submitActiveStation('${stationObj.id}')">
          SUBMIT
        </button>
      </div>
    </div>
  `;

  container.innerHTML = html;
}

/**
 * Inspector workspace: the inspector receives engines only after every 25th operator station.
 * Inspection state is separate from station completion state so the original queue remains intact.
 */
function renderInspectionWorkspace() {
  const container = document.getElementById('active-station-workspace-container');
  if (!container || !isInspector()) return;

  const checkpoints = [];
  for (let n = INSPECTION_INTERVAL; n <= TOTAL_STATIONS_COUNT; n += INSPECTION_INTERVAL) {
    checkpoints.push(getInspectionCheckpoint(n));
  }
  const pendingByCheckpoint = checkpoints.map(cp => ({ checkpoint: cp, engines: getPendingInspectionEngines(cp) }));
  const totalPending = pendingByCheckpoint.reduce((sum, item) => sum + item.engines.length, 0);

  if (!currentEngine) {
    let html = `
      <div class="inspection-page-container">
        <div class="inspection-queue-header">
          <div>
            <div class="inspection-eyebrow">QUALITY CONTROL • INSPECTION QUEUE</div>
            <h1>Inspection Queue</h1>
            <p>Inspect every engine after each 25 completed operator stations before the next group can continue.</p>
          </div>
          <div class="inspection-queue-count"><strong>${totalPending}</strong><span>Pending</span></div>
        </div>
        <div class="inspection-queue-list">`;

    pendingByCheckpoint.forEach(({ checkpoint, engines }) => {
      html += `
        <section class="inspection-queue-group">
          <div class="inspection-queue-group-head">
            <div>
              <span class="inspection-gate-badge">${escapeHtml(checkpoint.label)}</span>
              <h2>After ${checkpoint.afterStationNumber}. ${escapeHtml(checkpoint.afterStation.id)}</h2>
              <p>${checkpoint.nextStation ? `Pass releases the engine to ${escapeHtml(checkpoint.nextStation.id)} — ${escapeHtml(checkpoint.nextStation.name)}.` : 'Final quality gate after the last station.'}</p>
            </div>
            <span class="inspection-group-count">${engines.length} engine${engines.length === 1 ? '' : 's'}</span>
          </div>
          <div class="inspection-engine-grid">`;

      if (!engines.length) {
        html += `<div class="inspection-empty">✓ No engines are waiting at this inspection gate.</div>`;
      } else {
        engines.forEach(engine => {
          const prev = engine.sections && engine.sections[checkpoint.afterStation.id];
          const submitted = prev && prev.submitted_at ? new Date(prev.submitted_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Recent';
          const previousStatus = prev && prev.status === 'COMPLETED_PASSED' ? 'Passed' : 'Failures noted';
          html += `
            <button type="button" class="inspection-engine-card" onclick="selectEngineFromQueue('${escapeAttr(engine.barcode)}')">
              <div class="inspection-engine-top">
                <span class="inspection-barcode">${escapeHtml(engine.barcode)}</span>
                <span class="inspection-time">${escapeHtml(submitted)}</span>
              </div>
              <strong>${escapeHtml(engine.spec || 'H6 BSVI - 4V Engines')}</strong>
              <span>${escapeHtml(engine.hp_rating || '250 HP')}</span>
              <div class="inspection-prev">Previous: ${escapeHtml(checkpoint.afterStation.id)} • ${escapeHtml(previousStatus)}</div>
              <span class="inspection-select">Select Engine &amp; Inspect →</span>
            </button>`;
        });
      }
      html += `</div></section>`;
    });

    html += `</div></div>`;
    container.innerHTML = html;
    return;
  }

  const checkpointNumber = checkpoints.find(cp => {
    const previous = cp.afterStation;
    return currentEngine.sections && currentEngine.sections[previous.id] && !getEngineInspection(currentEngine, cp.number);
  })?.number || checkpoints.find(cp => getEngineInspection(currentEngine, cp.number))?.number || INSPECTION_INTERVAL;
  const checkpoint = getInspectionCheckpoint(checkpointNumber) || checkpoints[0];
  const savedInspection = getEngineInspection(currentEngine, checkpoint.number);
  currentInspectionResult = savedInspection?.status || '';

  container.innerHTML = `
    <div class="inspection-page-container">
      <div class="inspection-title-row">
        <div>
          <h1>Inspection</h1>
          <p>Check <span>•</span> Verify <span>•</span> Ensure Quality</p>
        </div>
        <div class="inspection-user">
          <div class="inspection-calendar">▣</div>
          <div><strong>${new Date().toLocaleDateString(undefined,{day:'2-digit',month:'short',year:'numeric'})}</strong><small>${new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}</small></div>
          <div class="inspection-user-divider"></div>
          <div class="inspection-avatar">●</div>
          <div><strong>INSPECTOR</strong><small>Quality Inspector</small></div>
        </div>
      </div>

      <section class="inspection-details-card">
        <div class="inspection-section-heading"><div class="inspection-icon">♧</div><h2>Inspection Details</h2></div>
        <div class="inspection-fields">
          <label>Item / Product<input value="${escapeAttr(currentEngine.spec || 'H6 BSVI - 4V Engines')}" readonly></label>
          <label>Batch No.<input value="${escapeAttr(currentEngine.barcode || '')}" readonly></label>
          <label>Inspection Criteria<input value="${escapeAttr(`Quality gate after ${checkpoint.afterStation.id} • Before ${checkpoint.nextStation ? checkpoint.nextStation.id : 'Final Release'}`)}" readonly></label>
          <label>Remarks (Optional)<input id="inspection-remarks" placeholder="Add remarks here..." value="${escapeAttr(savedInspection?.remarks || '')}"></label>
        </div>

        <div class="inspection-result-box">
          <div><h3>Inspection Result</h3><p>Select the appropriate action based on the inspection result.</p></div>
          <div class="inspection-result-actions">
            <button type="button" class="inspection-result-btn pass ${currentInspectionResult === 'PASSED' ? 'active' : ''}" onclick="setInspectionResult('PASSED')">✓ <span>Pass</span></button>
            <button type="button" class="inspection-result-btn fail ${currentInspectionResult === 'FAILED' ? 'active' : ''}" onclick="setInspectionResult('FAILED')">✕ <span>Fail</span></button>
            <button type="button" class="inspection-result-btn proceed" onclick="submitInspectionResult()">➜ <span>Prosed</span></button>
          </div>
        </div>

        <div class="inspection-notes">
          <h3>Additional Notes</h3>
          <textarea id="inspection-notes-input" placeholder="Enter any additional notes...">${escapeHtml(savedInspection?.notes || '')}</textarea>
        </div>

        <div class="inspection-engine-footer">
          <span>Engine <strong>${escapeHtml(currentEngine.barcode)}</strong> • ${escapeHtml(checkpoint.label)}</span>
          <button type="button" class="inspection-return-btn" onclick="clearActiveEngine()">↩ Return to Inspection Queue</button>
        </div>
      </section>
    </div>`;
}

function setInspectionResult(result) {
  if (!isInspector()) return;
  currentInspectionResult = result;
  document.querySelectorAll('.inspection-result-btn').forEach(btn => btn.classList.remove('active'));
  const target = document.querySelector(`.inspection-result-btn.${result === 'PASSED' ? 'pass' : 'fail'}`);
  if (target) target.classList.add('active');
}

function submitInspectionResult() {
  if (!isInspector() || !currentEngine) return;
  if (!currentInspectionResult) {
    showToast('⚠️ Select Pass or Fail before proceeding.', 'warning');
    return;
  }

  const checkpoints = [];
  for (let n = INSPECTION_INTERVAL; n <= TOTAL_STATIONS_COUNT; n += INSPECTION_INTERVAL) checkpoints.push(getInspectionCheckpoint(n));
  const checkpoint = checkpoints.find(cp => {
    const sec = currentEngine.sections && currentEngine.sections[cp.afterStation.id];
    const rec = getEngineInspection(currentEngine, cp.number);
    return sec && (!rec || rec.status !== 'PASSED');
  }) || checkpoints[0];
  if (!checkpoint) return;

  const remarks = document.getElementById('inspection-remarks')?.value.trim() || '';
  const notes = document.getElementById('inspection-notes-input')?.value.trim() || '';
  const localDB = JSON.parse(localStorage.getItem('al_engines_db') || '{}');
  const engine = localDB[currentEngine.barcode];
  if (!engine) {
    showToast(`❌ Engine ${currentEngine.barcode} not found`, 'error');
    return;
  }
  if (!engine.inspections) engine.inspections = {};

  engine.inspections[String(checkpoint.number)] = {
    checkpoint: checkpoint.number,
    checkpoint_label: checkpoint.label,
    after_station_id: checkpoint.afterStation.id,
    after_station_name: checkpoint.afterStation.name,
    released_station_id: checkpoint.nextStation ? checkpoint.nextStation.id : null,
    status: currentInspectionResult,
    inspector_token: currentAuth.username,
    inspector_name: currentAuth.displayName,
    remarks,
    notes,
    inspected_at: new Date().toISOString()
  };
  engine.updated_at = new Date().toISOString();
  localStorage.setItem('al_engines_db', JSON.stringify(localDB));
  currentEngine = null;

  if (currentInspectionResult === 'PASSED') {
    showToast(`✅ Inspection ${checkpoint.number} passed. Engine released to ${checkpoint.nextStation ? checkpoint.nextStation.id : 'Final Release'}.`, 'success');
  } else {
    showToast(`❌ Inspection ${checkpoint.number} failed. Engine remains blocked until a passing inspection is recorded.`, 'error');
  }
  currentInspectionResult = '';
  renderInspectionWorkspace();
}

/**
 * Select an engine from the operator/inspector queue menu
 */
function selectEngineFromQueue(barcode) {
  const allEngines = getAllRegisteredEngines();
  const found = allEngines.find(e => e.barcode === barcode);
  if (found) {
    currentEngine = found;
    if (isInspector()) currentInspectionResult = '';
    renderTestSectionWorkspace();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } else {
    showToast(`Engine ${barcode} not found`, 'error');
  }
}

/**
 * Deselect active engine and return to queue menu
 */
function clearActiveEngine() {
  currentEngine = null;
  currentInspectionResult = '';
  renderTestSectionWorkspace();
}

/**
 * Helper to generate predecessor audit stream for previous operators
 */
function generatePredecessorAuditHtml(currentIdx, engine) {
  if (!engine || currentIdx === 0) return '';

  const priorStations = STATIONS_LIST.slice(0, currentIdx);
  let html = `
    <div class="audit-stream-accordion">
      <div class="audit-summary-header">
        <h3>📋 Predecessor Operators Inspection Trail (${priorStations.length} Completed Stages)</h3>
      </div>`;

  priorStations.forEach(st => {
    const secData = engine.sections && engine.sections[st.id];
    if (secData) {
      const isPassed = secData.status === 'COMPLETED_PASSED';
      const statusTag = isPassed ? '<span class="tag-pass">✓ Passed</span>' : '<span class="tag-fail">⚠️ Failures Noted</span>';

      html += `
        <div class="audit-card completed">
          <div class="audit-card-head" onclick="toggleAuditCard(this)">
            <div class="audit-head-left">
              <span class="audit-stage-badge">${st.id}</span>
              <strong class="audit-stage-name">${st.name}</strong>
            </div>
            <div class="audit-head-right">
              <span class="audit-operator-pill">👤 ${secData.operator_name || secData.operator_token}</span>
              ${statusTag}
              <span class="audit-toggle-arrow">▼</span>
            </div>
          </div>
          <div class="audit-card-body">
            <table class="audit-table">
              <thead>
                <tr>
                  <th style="width: 40px;">#</th>
                  <th>Aspects Inspected</th>
                  <th>Spec &amp; Method</th>
                  <th class="text-center" style="width: 80px;">Status</th>
                  <th>Operator Remarks / Failure Notes</th>
                </tr>
              </thead>
              <tbody>
                ${(secData.test_cases || []).map((tc, idx) => `
                  <tr class="${tc.status === 'fail' ? 'audit-row-fail' : 'audit-row-pass'}">
                    <td>${idx + 1}</td>
                    <td><strong>${tc.aspect || ''}</strong></td>
                    <td>${tc.spec || '-'} ${tc.method ? `(${tc.method})` : ''}</td>
                    <td class="text-center">
                      <span class="audit-status-tag ${tc.status === 'fail' ? 'tag-fail' : 'tag-pass'}">
                        ${tc.status === 'fail' ? '✗ FAIL' : '✓ PASS'}
                      </span>
                    </td>
                    <td>${tc.remark || '-'}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>`;
    }
  });

  html += `</div>`;
  return html;
}

/**
 * Generates the clean inspection checklist table for a specific station
 */
function generateChecklistTableHtml(sectionId, engine) {
  const masterRows = document.querySelectorAll(`tr[data-section="${sectionId}"]`);
  
  if (!masterRows || masterRows.length === 0) {
    return `
      <div class="table-fallback-info">
        <p>Inspection criteria for Section <strong>${sectionId}</strong>.</p>
      </div>`;
  }

  let tableHtml = `
    <table class="process-checklist-table active-station-table" id="table-${sectionId}">
      <thead>
        <tr>
          <th style="width: 45px;">No.</th>
          <th class="col-aspects">Aspects to be checked</th>
          <th class="col-spec">Spec &amp; Units</th>
          <th class="col-method">Method</th>
          <th class="col-status" style="width: 110px;">Status</th>
          <th class="col-remarks">Remarks (Compulsory on Failure)</th>
        </tr>
      </thead>
      <tbody>`;

  masterRows.forEach((row, idx) => {
    const cells = row.querySelectorAll('td');
    let aspectText = '';
    let specText = '';
    let methodText = '';
    let hintText = '';

    const hasStageId = row.querySelector('.stage-id') !== null;
    const offset = hasStageId ? 1 : 0;

    if (cells.length > offset) aspectText = cells[offset].innerText.trim();
    if (cells.length > offset + 1) specText = cells[offset + 1].innerText.trim();
    if (cells.length > offset + 2) methodText = cells[offset + 2].innerText.trim();

    const hintEl = row.querySelector('.pdf-remark-hint');
    if (hintEl) hintText = hintEl.innerText.trim();

    let existingStatus = '';
    let existingRemark = '';
    if (engine && engine.sections && engine.sections[sectionId]) {
      const tc = (engine.sections[sectionId].test_cases || [])[idx];
      if (tc) {
        existingStatus = tc.status || '';
        existingRemark = tc.remark || '';
      }
    }

    tableHtml += `
      <tr class="active-item-row ${existingStatus === 'pass' ? 'row-passed' : existingStatus === 'fail' ? 'row-failed' : ''}" data-item-idx="${idx + 1}">
        <td class="text-center font-bold">${idx + 1}</td>
        <td><strong>${aspectText}</strong></td>
        <td>${specText || '-'}</td>
        <td>${methodText || '-'}</td>
        <td class="status-cell">
          <div class="status-btn-group" role="group">
            <button type="button" class="status-btn pass-btn ${existingStatus === 'pass' ? 'active' : ''}" onclick="setRowStatus(this, 'pass')" title="Pass">✓</button>
            <button type="button" class="status-btn fail-btn ${existingStatus === 'fail' ? 'active' : ''}" onclick="setRowStatus(this, 'fail')" title="Fail">✗</button>
          </div>
          <input type="hidden" class="row-status-value" value="${existingStatus}">
        </td>
        <td class="remarks-cell">
          <div class="remark-container">
            ${hintText ? `<div class="pdf-remark-hint">📌 ${hintText}</div>` : ''}
            <input type="text" class="remark-input ${existingStatus === 'fail' && !existingRemark ? 'remark-compulsory remark-invalid' : ''}" 
                   placeholder="Enter remark (Mandatory on failure)..." 
                   value="${existingRemark}"
                   oninput="handleRemarkInput(this)">
            <div class="remark-error-msg" style="${existingStatus === 'fail' && !existingRemark ? 'display:block;' : ''}">
              ❌ Remark is COMPULSORY for failed test case!
            </div>
          </div>
        </td>
      </tr>`;
  });

  tableHtml += `</tbody></table>`;
  return tableHtml;
}

/**
 * Handle Submitting the Active Station
 */
async function submitActiveStation(sectionId) {
  if (!currentAuth) {
    switchView('login');
    return;
  }
  if (isSupervisor()) {
    showToast('Supervisor accounts cannot submit operator test sections.', 'warning');
    switchView('supervisor');
    return;
  }

  let barcode = '';
  let devVal = '';
  let comps = {};

  if (currentAuth.operatorIndex === 1) {
    const input = document.getElementById('header-barcode-input') || document.getElementById('header-engine-no');
    if (!input || !input.value.trim()) {
      showToast('⚠️ Please enter Engine Number / Barcode in the header', 'warning');
      if (input) input.focus();
      return;
    }
    barcode = input.value.trim().toUpperCase();

    const devEl = document.getElementById('header-major-deviation');
    if (devEl) devVal = devEl.value.trim();

    // Collect components
    const c1 = document.getElementById('comp-1'); if (c1) comps.c1 = c1.value;
    const c7 = document.getElementById('comp-7'); if (c7) comps.c7 = c7.value;
    const c8 = document.getElementById('comp-8'); if (c8) comps.c8 = c8.value;
    const c9 = document.getElementById('comp-9'); if (c9) comps.c9 = c9.value;
    const c4 = document.getElementById('comp-4'); if (c4) comps.c4 = c4.value;
    const c10 = document.getElementById('comp-10'); if (c10) comps.c10 = c10.value;
    const c5 = document.getElementById('comp-5'); if (c5) comps.c5 = c5.value;
    const c11 = document.getElementById('comp-11'); if (c11) comps.c11 = c11.value;
    const c6 = document.getElementById('comp-6'); if (c6) comps.c6 = c6.value;
    const c12 = document.getElementById('comp-12'); if (c12) comps.c12 = c12.value;
    const c3y = document.getElementById('comp-3-y');
    const c3b = document.getElementById('comp-3-b');
    if (c3y && c3y.checked) comps.c3 = 'Yellow';
    else if (c3b && c3b.checked) comps.c3 = 'Blue';
  } else {
    if (!currentEngine) {
      showToast('⚠️ No active engine selected', 'error');
      return;
    }
    barcode = currentEngine.barcode;
    comps = currentEngine.components || {};
    devVal = currentEngine.major_deviation || '';
  }

  const table = document.getElementById(`table-${sectionId}`);
  let testCases = [];

  if (table) {
    const rows = table.querySelectorAll('tbody tr.active-item-row');
    let unselectedCount = 0;
    let failedWithoutRemarkCount = 0;
    let firstFailedInput = null;
    let firstUnselectedRow = null;

    rows.forEach((row, idx) => {
      const aspect = row.cells[1].innerText.trim();
      const spec = row.cells[2].innerText.trim();
      const method = row.cells[3].innerText.trim();
      const statusInput = row.querySelector('.row-status-value');
      const remarkInput = row.querySelector('.remark-input');
      const remarkError = row.querySelector('.remark-error-msg');

      const status = statusInput ? statusInput.value : '';
      const remark = remarkInput ? remarkInput.value.trim() : '';

      if (!status) {
        unselectedCount++;
        if (!firstUnselectedRow) firstUnselectedRow = row;
      } else if (status === 'fail' && !remark) {
        failedWithoutRemarkCount++;
        if (remarkInput) {
          remarkInput.classList.add('remark-compulsory', 'remark-invalid');
        }
        if (remarkError) {
          remarkError.style.display = 'block';
        }
        if (!firstFailedInput) firstFailedInput = remarkInput;
      }

      testCases.push({
        item_no: idx + 1,
        aspect,
        spec,
        method,
        status,
        remark
      });
    });

    if (unselectedCount > 0) {
      showToast(`⚠️ Please evaluate all test items in ${sectionId} (${unselectedCount} pending)`, 'warning');
      if (firstUnselectedRow) {
        firstUnselectedRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
        firstUnselectedRow.classList.add('row-highlight-warn');
        setTimeout(() => firstUnselectedRow.classList.remove('row-highlight-warn'), 2000);
      }
      return;
    }

    if (failedWithoutRemarkCount > 0) {
      showToast(`❌ Remark is COMPULSORY for all failed test cases!`, 'error');
      if (firstFailedInput) {
        firstFailedInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
        firstFailedInput.focus();
      }
      return;
    }
  }

  const payload = {
    operator_token: currentAuth.username,
    operator_name: currentAuth.displayName,
    test_cases: testCases
  };

  // 1. Update Database / Local Storage
  const localDB = JSON.parse(localStorage.getItem('al_engines_db') || '{}');
  if (!localDB[barcode]) {
    localDB[barcode] = {
      barcode: barcode,
      spec: 'H6 BSVI - 4V Engines',
      hp_rating: currentSelectedHp || '250 HP',
      shift: currentSelectedShift || 'I',
      major_deviation: devVal,
      components: comps,
      date: new Date(),
      current_station: sectionId,
      sections: {},
      created_at: new Date(),
      updated_at: new Date()
    };
  } else {
    if (Object.keys(comps).length > 0) localDB[barcode].components = comps;
    if (devVal) localDB[barcode].major_deviation = devVal;
  }

  const hasFailures = testCases.some(t => t.status === 'fail');
  localDB[barcode].sections[sectionId] = {
    section_id: sectionId,
    operator_token: currentAuth.username,
    operator_name: currentAuth.displayName,
    status: hasFailures ? 'COMPLETED_WITH_FAILURES' : 'COMPLETED_PASSED',
    submitted_at: new Date(),
    test_cases: testCases
  };
  localDB[barcode].updated_at = new Date();

  // Try saving to backend API as well
  try {
    await fetch(`${API_BASE}/api/engines/init`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(localDB[barcode])
    });
    await fetch(`${API_BASE}/api/engines/${barcode}/section/${sectionId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
  } catch (e) {}

  localStorage.setItem('al_engines_db', JSON.stringify(localDB));

  const completedSectionsCount = Object.keys(localDB[barcode].sections).length;
  if (completedSectionsCount === TOTAL_STATIONS_COUNT) {
    // no success toast for completion notification
  }

  // WORKFLOW HANDLING
  if (currentAuth.operatorIndex === 1) {
    currentEngine = null;
    renderTestSectionWorkspace();
    const input = document.getElementById('header-barcode-input') || document.getElementById('header-engine-no');
    if (input) {
      input.value = '';
      input.focus();
    }
  } else {
    currentEngine = null;
    renderTestSectionWorkspace();
  }
}

/**
 * MASTER CARD VIEW
 */
function renderMasterCardView() {
  const container = document.getElementById('master-card-engine-selector-container');
  if (!container) return;

  const allEngines = getAllRegisteredEngines();
  
  let html = `
    <div class="master-card-controls">
      <label for="master-card-engine-select" class="master-select-label">Select Engine to View History Card:</label>
      <select id="master-card-engine-select" class="master-select-dropdown" onchange="loadMasterCardForBarcode(this.value)">
        <option value="">-- Choose Engine Serial / Barcode --</option>
        ${allEngines.map(eng => {
          const compCount = Object.keys(eng.sections || {}).length;
          return `<option value="${eng.barcode}" ${selectedEngineBarcode === eng.barcode ? 'selected' : ''}>
            ${eng.barcode} (${compCount}/${TOTAL_STATIONS_COUNT} Sections Completed)
          </option>`;
        }).join('')}
      </select>
      <button type="button" class="btn-print-card" onclick="window.print()">🖨️ Print Master Card</button>
    </div>
  `;

  container.innerHTML = html;

  if (!selectedEngineBarcode && allEngines.length > 0) {
    selectedEngineBarcode = allEngines[0].barcode;
    const select = document.getElementById('master-card-engine-select');
    if (select) select.value = selectedEngineBarcode;
  }

  syncMasterCardTables(selectedEngineBarcode);
}

function loadMasterCardForBarcode(barcode) {
  selectedEngineBarcode = barcode;
  syncMasterCardTables(barcode);
}

function syncMasterCardTables(barcode) {
  if (!barcode) return;

  const allEngines = getAllRegisteredEngines();
  const engine = allEngines.find(e => e.barcode === barcode);
  if (!engine) return;

  const barcodeInput = document.getElementById('barcode-input');
  if (barcodeInput) barcodeInput.value = engine.barcode;

  const specInput = document.getElementById('engine-no-spec');
  if (specInput) specInput.value = `${engine.barcode} / ${engine.spec || 'H6 BSVI'}`;

  // Reflect all completed sections in master tables
  if (engine.sections) {
    Object.keys(engine.sections).forEach(secId => {
      const secData = engine.sections[secId];
      const badge = document.getElementById(`badge-${secId}`);
      if (badge) {
        if (secData.status === 'COMPLETED_PASSED') {
          badge.textContent = '✓ Passed';
          badge.className = 'sec-status-badge submitted-success';
        } else {
          badge.textContent = '⚠️ Failures Noted';
          badge.className = 'sec-status-badge submitted-warn';
        }
      }

      const rows = document.querySelectorAll(`tr[data-section="${secId}"]`);
      if (rows && secData.test_cases) {
        rows.forEach((row, idx) => {
          const tc = secData.test_cases[idx];
          if (tc) {
            const passBtn = row.querySelector('.pass-btn');
            const failBtn = row.querySelector('.fail-btn');
            const statusInput = row.querySelector('.row-status-value');
            const remarkInput = row.querySelector('.remark-input');

            if (statusInput) statusInput.value = tc.status;
            if (tc.status === 'pass' && passBtn) {
              passBtn.classList.add('active');
              if (failBtn) failBtn.classList.remove('active');
              row.classList.add('row-passed');
            } else if (tc.status === 'fail' && failBtn) {
              failBtn.classList.add('active');
              if (passBtn) passBtn.classList.remove('active');
              row.classList.add('row-failed');
            }
            if (remarkInput && tc.remark) {
              remarkInput.value = tc.remark;
            }
          }
        });
      }
    });
  }
}

function getAllRegisteredEngines() {
  try {
    const raw = localStorage.getItem('al_engines_db');
    if (raw) {
      const parsed = JSON.parse(raw);
      return Object.values(parsed).sort((a, b) => new Date(b.updated_at || 0) - new Date(a.updated_at || 0));
    }
  } catch (e) {}
  return [];
}

function toggleAuditCard(el) {
  const card = el.closest('.audit-card');
  if (card) {
    card.classList.toggle('expanded');
  }
}

function renderSupervisorDashboard() {
  const container = document.getElementById('supervisor-dashboard-container');
  if (!container || !isSupervisor()) return;
  const workforce = ensureDefaultWorkforce();
  const workers = Object.values(workforce).filter(w => w && w.active !== false);
  const assignments = getTodayAssignments();
  const engines = getAllRegisteredEngines();
  const breakRequests = getBreakRequests().filter(request => request.status !== 'completed' && request.status !== 'declined');
  const pendingBreakCount = breakRequests.filter(request => request.status === 'pending').length;
  const assignedCount = workers.filter(w => assignments[w.username]).length;
  const tempCount = workers.filter(w => w.temporary).length;

  const workerRows = workers.map((w, i) => {
    const a = assignments[w.username] || {};
    const current = a.stationId || '';
    const isAssigned = Boolean(current);
    return `<tr>
      <td><strong>${escapeHtml(w.name || w.username)}</strong><div class="worker-id">${escapeHtml(w.username)}${w.temporary ? ' • Temporary' : ''}</div></td>
      <td><span class="shift-badge shift-${escapeAttr((w.shift || 'Day').toLowerCase())}">${escapeHtml(w.shift || 'Day')}</span></td>
      <td><div class="assignment-field"><span class="assignment-state ${isAssigned ? 'is-assigned' : 'is-unassigned'}">${isAssigned ? 'Assigned' : 'Unassigned'}</span><select class="assignment-select" id="assign-${escapeAttr(w.username)}">
        <option value="">-- Unassigned --</option>${STATIONS_LIST.map(st => `<option value="${escapeAttr(st.id)}" ${st.id === current ? 'selected' : ''}>${escapeHtml(st.id)} — ${escapeHtml(st.name)}</option>`).join('')}
      </select></div></td>
      <td><div class="assignment-actions"><button class="supervisor-action-btn primary" onclick="saveDailyAssignment('${escapeAttr(w.username)}')">Assign</button><button class="supervisor-action-btn ghost" onclick="supervisorOpenStation('${escapeAttr(current || w.stationId || STATIONS_LIST[0].id)}')">View</button></div></td>
    </tr>`;
  }).join('');

  const breakRequestCards = breakRequests.map(request => {
    const isPending = request.status === 'pending';
    const isElapsed = !isPending && Date.parse(request.endsAt) <= Date.now();
    const coverWorker = request.coverUsername ? workforce[request.coverUsername] : null;
    return `<article class="break-request-card ${isPending ? 'is-pending' : 'is-approved'}">
      <div class="break-request-card-heading">
        <div><strong>${escapeHtml(request.operatorName || request.username)}</strong><span class="worker-id">${escapeHtml(request.username)} • ${escapeHtml(request.shift || 'Shift not set')}</span></div>
        <span class="break-state ${isPending ? 'pending' : 'approved'}">${isPending ? 'Pending' : isElapsed ? 'Break time elapsed' : 'On break'}</span>
      </div>
      <p>Requested ${escapeHtml(request.durationLabel)} at ${new Date(request.requestedAt).toLocaleString()} • Cover station: <strong>${escapeHtml(request.stationId)} — ${escapeHtml(request.stationName)}</strong></p>
      ${isPending ? `<div class="break-cover-controls">
        <label for="break-cover-${escapeAttr(request.id)}">Assign an active operator</label>
        <div class="break-cover-row">
          <select id="break-cover-${escapeAttr(request.id)}" class="supervisor-input">
            <option value="">Choose a replacement</option>
            ${workers.filter(worker => worker.username !== request.username).map(worker => `<option value="${escapeAttr(worker.username)}">${escapeHtml(worker.name || worker.username)} (${escapeHtml(worker.username)})${worker.temporary ? ' • Temporary' : ''}</option>`).join('')}
          </select>
          <button class="supervisor-action-btn primary" onclick="assignBreakCover('${escapeAttr(request.id)}')">Assign &amp; Approve</button>
          <button class="supervisor-action-btn danger" onclick="declineBreakRequest('${escapeAttr(request.id)}')">Decline</button>
        </div>
        <details class="break-temp-cover">
          <summary>Create a temporary person and assign as cover</summary>
          <div class="break-temp-cover-fields">
            <input id="break-temp-name-${escapeAttr(request.id)}" class="supervisor-input" placeholder="Full name" aria-label="Temporary cover full name">
            <input id="break-temp-id-${escapeAttr(request.id)}" class="supervisor-input" placeholder="Login ID, e.g. temp-001" aria-label="Temporary cover login ID">
            <input id="break-temp-pin-${escapeAttr(request.id)}" class="supervisor-input" placeholder="PIN (default 1234)" aria-label="Temporary cover PIN">
            <button class="supervisor-action-btn secondary" onclick="createAndAssignTemporaryCover('${escapeAttr(request.id)}')">Create &amp; Assign</button>
          </div>
        </details>
      </div>` : `<div class="break-approved-info">
        <span>Assigned cover: <strong>${escapeHtml(coverWorker ? `${coverWorker.name} (${coverWorker.username})` : request.coverUsername || 'Unavailable')}</strong></span>
        <span>Break ends: <strong>${new Date(request.endsAt).toLocaleString()}</strong></span>
        <button class="supervisor-action-btn ghost" onclick="completeBreakRequest('${escapeAttr(request.id)}')">End Break &amp; Restore Assignment</button>
      </div>`}
    </article>`;
  }).join('');

  container.innerHTML = `
    <div class="supervisor-header">
      <div><span class="supervisor-eyebrow">WORKFORCE CONTROL CENTER</span><h1>Supervisor Dashboard</h1><p>Overall access • Daily workforce planning • Temporary personnel • Station flexibility</p></div>
      <div class="supervisor-date">${new Date().toLocaleDateString(undefined,{weekday:'short',year:'numeric',month:'short',day:'numeric'})}</div>
    </div>
    <div class="supervisor-kpis">
      <div class="supervisor-kpi"><span>Active Workers</span><strong>${workers.length}</strong><small>Currently active</small></div>
      <div class="supervisor-kpi"><span>Assigned Today</span><strong>${assignedCount} / ${workers.length}</strong><small>Workers assigned</small></div>
      <div class="supervisor-kpi"><span>Temporary Persons</span><strong>${tempCount}</strong><small>Active temporary</small></div>
      <div class="supervisor-kpi"><span>Pending Break Requests</span><strong>${pendingBreakCount}</strong><small>Awaiting cover assignment</small></div>
      <div class="supervisor-kpi"><span>Engine Records</span><strong>${engines.length}</strong><small>Recorded engines</small></div>
    </div>
    <section class="supervisor-panel break-requests-panel">
      <div class="panel-heading"><div><h2>Operator Break Requests</h2><p>Assign a replacement operator or create a temporary person. The requested break starts when a cover is assigned.</p></div></div>
      <div class="break-request-list">${breakRequestCards || '<div class="empty-state">No pending or active break requests.</div>'}</div>
    </section>
    <div class="supervisor-grid">
      <section class="supervisor-panel daily-assignment-panel">
        <div class="panel-heading"><div><h2>Daily Worker Assignment</h2><p>Assign every worker to any station for today. Reassignment is immediate and does not change the original station sequence.</p></div><button class="supervisor-action-btn secondary" onclick="switchView('fullcard')">Open Master Cards</button></div>
        <div class="assignment-toolbar"><input id="worker-search" class="supervisor-input" placeholder="Search worker or ID..." oninput="filterWorkerRows(this.value)"><select id="shift-filter" class="supervisor-input" onchange="filterWorkerRows(document.getElementById('worker-search').value)"><option value="All">All shifts</option><option value="Day">Day</option><option value="Afternoon">Afternoon</option><option value="Night">Night</option></select></div>
        <div class="supervisor-table-wrap"><table class="supervisor-table"><thead><tr><th>Worker</th><th>Shift</th><th>Today's Station</th><th>Actions</th></tr></thead><tbody id="worker-assignment-body">${workerRows}</tbody></table></div>
      </section>
      <section class="supervisor-panel temporary-persons-panel">
        <div class="panel-heading"><div><h2>Temporary Persons</h2><p>Add contract/temporary workers without changing the permanent operator accounts.</p></div></div>
        <form class="temp-worker-form" onsubmit="addTemporaryWorker(event)">
          <input id="temp-name" class="supervisor-input" placeholder="Full name" required>
          <input id="temp-id" class="supervisor-input" placeholder="Login ID e.g. temp-001" required pattern="[a-zA-Z0-9._-]+">
          <input id="temp-pin" class="supervisor-input" placeholder="PIN" value="1234" required>
          <select id="temp-shift" class="supervisor-input"><option>Day</option><option>Afternoon</option><option>Night</option></select>
          <button class="supervisor-action-btn primary" type="submit">+ Add Temporary Person</button>
        </form>
        <div class="temp-list">${workers.filter(w=>w.temporary).length ? workers.filter(w=>w.temporary).map(w=>`<div class="temp-person"><div><strong>${escapeHtml(w.name)}</strong><span>${escapeHtml(w.username)} • ${escapeHtml(w.shift)}</span></div><div><button class="supervisor-action-btn ghost" onclick="toggleWorkerActive('${escapeAttr(w.username)}')">${w.active===false?'Activate':'Deactivate'}</button><button class="supervisor-action-btn danger" onclick="deleteTemporaryWorker('${escapeAttr(w.username)}')">Remove</button></div></div>`).join('') : '<div class="empty-state">No temporary workers yet.</div>'}</div>
      </section>
    </div>
  `;
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));
}
function escapeAttr(value) { return escapeHtml(value).replace(/`/g, '&#96;'); }

function filterWorkerRows(query) {
  const q = String(query || '').toLowerCase();
  const shift = (document.getElementById('shift-filter')?.value || 'All');
  document.querySelectorAll('#worker-assignment-body tr').forEach(row => {
    const text = row.textContent.toLowerCase();
    const shiftMatch = shift === 'All' || text.includes(shift.toLowerCase());
    row.style.display = (!q || text.includes(q)) && shiftMatch ? '' : 'none';
  });
}

function saveDailyAssignment(username) {
  if (!isSupervisor()) return;
  const select = document.getElementById(`assign-${username}`);
  if (!select) return;
  const stationId = select.value;
  if (!stationId) { removeTodayAssignment(username); showToast(`↩️ ${username} is unassigned for today`, 'info'); renderSupervisorDashboard(); return; }
  const station = STATIONS_LIST.find(s=>s.id===stationId);
  saveTodayAssignment(username, { stationId, stationName: station?.name || stationId, assignedBy: SUPERVISOR_USER });
  showToast(`✅ ${username} assigned to ${stationId}`, 'success');
  renderSupervisorDashboard();
}

function addTemporaryWorker(e) {
  if (e) e.preventDefault();
  if (!isSupervisor()) return;
  const name = document.getElementById('temp-name')?.value.trim();
  const username = document.getElementById('temp-id')?.value.trim().toLowerCase();
  const pin = document.getElementById('temp-pin')?.value.trim() || DEFAULT_PIN;
  const shift = document.getElementById('temp-shift')?.value || 'Day';
  if (!name || !username) return showToast('Enter the temporary person name and login ID.', 'warning');
  if (!createTemporaryWorkerProfile(name, username, pin, shift)) return;
  showToast(`✅ Temporary person ${name} added`, 'success');
  renderSupervisorDashboard();
}

function createTemporaryWorkerProfile(name, username, pin, shift) {
  if (username === SUPERVISOR_USER || getWorkerProfile(username)) {
    showToast('That login ID already exists.', 'error');
    return false;
  }
  const workforce = ensureDefaultWorkforce();
  workforce[username] = { username, name, role: 'operator', shift, active: true, temporary: true, stationId: null, pin };
  saveWorkforce(workforce);
  return true;
}

function assignBreakCover(requestId, workerUsername) {
  if (!isSupervisor()) return;
  const requests = getBreakRequests();
  const request = requests.find(item => item.id === requestId);
  const selectedUsername = workerUsername || document.getElementById(`break-cover-${requestId}`)?.value;
  const worker = ensureDefaultWorkforce()[String(selectedUsername || '').toLowerCase()];
  if (!request || request.status !== 'pending') {
    showToast('This break request is no longer pending.', 'warning');
    renderSupervisorDashboard();
    return;
  }
  if (!worker || worker.active === false || worker.username === request.username) {
    showToast('Choose an active operator other than the person requesting the break.', 'warning');
    return;
  }

  const previousAssignment = getTodayAssignments()[worker.username] || null;
  const station = STATIONS_LIST.find(item => item.id === request.stationId);
  if (!station) {
    showToast('The requested station could not be found. The request was not approved.', 'error');
    return;
  }
  saveTodayAssignment(worker.username, {
    stationId: station.id,
    stationName: station.name,
    assignedBy: SUPERVISOR_USER,
    breakRequestId: request.id
  });
  const startedAt = new Date();
  request.status = 'approved';
  request.coverUsername = worker.username;
  request.coverName = worker.name || worker.username;
  request.previousCoverAssignment = previousAssignment;
  request.startedAt = startedAt.toISOString();
  request.endsAt = new Date(startedAt.getTime() + request.durationMinutes * 60000).toISOString();
  request.approvedBy = SUPERVISOR_USER;
  saveBreakRequests(requests);
  showToast(`${worker.name || worker.username} assigned to cover ${request.stationId}.`, 'success');
  renderSupervisorDashboard();
  updateBreakRequestButton();
}

function createAndAssignTemporaryCover(requestId) {
  if (!isSupervisor()) return;
  const request = getBreakRequests().find(item => item.id === requestId);
  if (!request || request.status !== 'pending') {
    showToast('This break request is no longer pending.', 'warning');
    renderSupervisorDashboard();
    return;
  }
  const name = document.getElementById(`break-temp-name-${requestId}`)?.value.trim();
  const username = document.getElementById(`break-temp-id-${requestId}`)?.value.trim().toLowerCase();
  const pin = document.getElementById(`break-temp-pin-${requestId}`)?.value.trim() || DEFAULT_PIN;
  if (!name || !username) {
    showToast('Enter a name and login ID for the temporary cover.', 'warning');
    return;
  }
  if (!/^[a-zA-Z0-9._-]+$/.test(username)) {
    showToast('Use only letters, numbers, dots, underscores, or hyphens in the login ID.', 'warning');
    return;
  }
  if (!createTemporaryWorkerProfile(name, username, pin, request.shift || 'Day')) return;
  assignBreakCover(requestId, username);
}

function declineBreakRequest(requestId) {
  if (!isSupervisor()) return;
  const requests = getBreakRequests();
  const request = requests.find(item => item.id === requestId);
  if (!request || request.status !== 'pending') return;
  request.status = 'declined';
  request.declinedAt = new Date().toISOString();
  request.declinedBy = SUPERVISOR_USER;
  saveBreakRequests(requests);
  renderSupervisorDashboard();
  updateBreakRequestButton();
  showToast('Break request declined.', 'info');
}

function completeBreakRequest(requestId) {
  if (!isSupervisor()) return;
  const requests = getBreakRequests();
  const request = requests.find(item => item.id === requestId);
  if (!request || request.status !== 'approved') return;
  const assignments = getTodayAssignments();
  const coverAssignment = assignments[request.coverUsername];
  if (coverAssignment && coverAssignment.breakRequestId === request.id) {
    if (request.previousCoverAssignment) {
      saveTodayAssignment(request.coverUsername, request.previousCoverAssignment);
    } else {
      removeTodayAssignment(request.coverUsername);
    }
  }
  request.status = 'completed';
  request.completedAt = new Date().toISOString();
  request.completedBy = SUPERVISOR_USER;
  saveBreakRequests(requests);
  renderSupervisorDashboard();
  updateBreakRequestButton();
  showToast('Break ended and the cover operator’s previous assignment was restored.', 'success');
}

function toggleWorkerActive(username) {
  if (!isSupervisor()) return;
  const workforce = ensureDefaultWorkforce();
  if (!workforce[username]) return;
  workforce[username].active = workforce[username].active === false;
  saveWorkforce(workforce);
  showToast(`${username} is now ${workforce[username].active ? 'active' : 'inactive'}`, 'info');
  renderSupervisorDashboard();
}

function deleteTemporaryWorker(username) {
  if (!isSupervisor()) return;
  const workforce = ensureDefaultWorkforce();
  if (!workforce[username]?.temporary) return;
  delete workforce[username];
  saveWorkforce(workforce);
  removeTodayAssignment(username);
  showToast(`🗑️ Temporary person removed`, 'info');
  renderSupervisorDashboard();
}

function supervisorOpenStation(stationId) {
  if (!isSupervisor()) return;
  const station = STATIONS_LIST.find(s=>s.id===stationId) || STATIONS_LIST[0];
  const container = document.getElementById('supervisor-dashboard-container');
  if (!container) return;
  const engines = getAllRegisteredEngines();
  const completed = engines.filter(e => e.sections && e.sections[station.id]);
  container.innerHTML = `<div class="supervisor-header"><div><span class="supervisor-eyebrow">SUPERVISOR STATION MONITOR</span><h1>${escapeHtml(station.id)} — ${escapeHtml(station.name)}</h1><p>Overall access view • ${completed.length} engine record(s) completed at this station.</p></div><button class="supervisor-action-btn secondary" onclick="renderSupervisorDashboard()">← Back to Dashboard</button></div><div class="supervisor-panel"><div class="station-monitor-grid">${completed.length ? completed.map(e=>`<div class="monitor-card"><strong>${escapeHtml(e.barcode)}</strong><span>${escapeHtml(e.overall_status || 'IN_PROGRESS')}</span><small>${new Date(e.updated_at || Date.now()).toLocaleString()}</small></div>`).join('') : '<div class="empty-state">No engine records have been completed at this station yet.</div>'}</div></div>`;
}

function setRowStatus(btn, status) {
  const row = btn.closest('tr');
  if (!row) return;

  const btnGroup = row.querySelector('.status-btn-group');
  const statusInput = row.querySelector('.row-status-value');
  const remarkInput = row.querySelector('.remark-input');
  const remarkError = row.querySelector('.remark-error-msg');
  const passBtn = btnGroup ? btnGroup.querySelector('.pass-btn') : null;
  const failBtn = btnGroup ? btnGroup.querySelector('.fail-btn') : null;

  if (statusInput.value === status) {
    statusInput.value = '';
    if (passBtn) passBtn.classList.remove('active');
    if (failBtn) failBtn.classList.remove('active');
    row.classList.remove('row-passed', 'row-failed');
    if (remarkInput) remarkInput.classList.remove('remark-compulsory', 'remark-invalid');
    if (remarkError) remarkError.style.display = 'none';
  } else {
    statusInput.value = status;
    if (status === 'pass') {
      if (passBtn) passBtn.classList.add('active');
      if (failBtn) failBtn.classList.remove('active');
      row.classList.add('row-passed');
      row.classList.remove('row-failed');
      if (remarkInput) remarkInput.classList.remove('remark-compulsory', 'remark-invalid');
      if (remarkError) remarkError.style.display = 'none';
    } else if (status === 'fail') {
      if (failBtn) failBtn.classList.add('active');
      if (passBtn) passBtn.classList.remove('active');
      row.classList.add('row-failed');
      row.classList.remove('row-passed');
      if (remarkInput) {
        remarkInput.classList.add('remark-compulsory');
        if (!remarkInput.value.trim()) {
          remarkInput.classList.add('remark-invalid');
          if (remarkError) remarkError.style.display = 'block';
          remarkInput.focus();
        }
      }
    }
  }
}

function handleRemarkInput(input) {
  const row = input.closest('tr');
  if (!row) return;

  const statusInput = row.querySelector('.row-status-value');
  const remarkError = row.querySelector('.remark-error-msg');

  if (statusInput && statusInput.value === 'fail') {
    if (input.value.trim().length > 0) {
      input.classList.remove('remark-invalid');
      if (remarkError) remarkError.style.display = 'none';
    } else {
      input.classList.add('remark-invalid');
      if (remarkError) remarkError.style.display = 'block';
    }
  }
}

function showToast(message, type = 'info') {
  let toastContainer = document.getElementById('toast-container');
  if (!toastContainer) {
    toastContainer = document.createElement('div');
    toastContainer.id = 'toast-container';
    toastContainer.className = 'toast-container';
    document.body.appendChild(toastContainer);
  }

  const toast = document.createElement('div');
  toast.className = `toast-message toast-${type}`;
  toast.textContent = message;

  toastContainer.appendChild(toast);

  setTimeout(() => toast.classList.add('show'), 10);
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => {
      if (toast.parentElement) toast.parentElement.removeChild(toast);
    }, 300);
  }, 3500);
}
