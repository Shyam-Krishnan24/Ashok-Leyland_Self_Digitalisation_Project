/**
 * Ashok Leyland Engine History Card - Zero-Dependency Enterprise MES Server
 * Supports MongoDB connection and resilient Local File Storage.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/ashok_leyland_engines';

// Local storage fallback paths
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}
const localDbPath = path.join(dataDir, 'engines.json');
if (!fs.existsSync(localDbPath)) {
  fs.writeFileSync(localDbPath, JSON.stringify({}), 'utf8');
}

let isMongoConnected = false;
let EngineModel = null;

try {
  const mongoose = require('mongoose');
  const EngineSchema = new mongoose.Schema({
    barcode: { type: String, required: true, unique: true, index: true },
    spec: { type: String, default: 'H6 BSVI - 4V Engines' },
    hp_rating: { type: String, default: '250 HP' },
    shift: { type: String, default: 'I' },
    date: { type: Date, default: Date.now },
    major_deviation: { type: String, default: '' },
    current_station: { type: String, default: 'CB01' },
    overall_status: { type: String, default: 'IN_PROGRESS' },
    components: { type: Object, default: {} },
    sections: { type: Object, default: {} },
    qr_codes: { type: Object, default: {} },
    final_signoff: { type: Object, default: {} },
    created_at: { type: Date, default: Date.now },
    updated_at: { type: Date, default: Date.now }
  });

  try {
    EngineModel = mongoose.model('EngineHistoryCard', EngineSchema);
  } catch (e) {
    EngineModel = mongoose.models.EngineHistoryCard;
  }

  mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 2000 })
    .then(() => {
      isMongoConnected = true;
      console.log('✅ Connected to MongoDB at:', MONGODB_URI);
    })
    .catch(() => {
      isMongoConnected = false;
      console.log('ℹ️ Operating in High-Reliability Local Storage mode (data/engines.json).');
    });
} catch (e) {
  console.log('ℹ️ Operating in High-Reliability Local Storage mode (data/engines.json).');
}

function getLocalEngines() {
  try {
    const raw = fs.readFileSync(localDbPath, 'utf8');
    return JSON.parse(raw || '{}');
  } catch (e) {
    return {};
  }
}

function saveLocalEngines(data) {
  fs.writeFileSync(localDbPath, JSON.stringify(data, null, 2), 'utf8');
}

// 69 Stations Ordered List
const STATIONS = [
  { id: 'CB01', name: 'Block Preparation & Coolant Holes Check', page: 1 },
  { id: 'CB02', name: 'Block Guide & PCN Fitment', page: 1 },
  { id: 'CB03', name: 'Shell Bearing & Crankshaft Assembly', page: 1 },
  { id: 'CB04-CB05', name: 'Bearing Caps & Crankshaft Torquing', page: 1 },
  { id: 'CB06', name: 'Free Rotation & End Play Inspection (IPV-1)', page: 1 },
  { id: 'CB07', name: 'Oil Flow & Engine Name Plate Punching', page: 1 },
  { id: 'CB08', name: 'Transfer to Short Block Line', page: 1 },
  { id: 'SB01', name: 'Dowel Pins, Steel Balls & Oil Pump Assembly', page: 1 },
  { id: 'SB02', name: 'Timing Back Plate & Camshaft Assembly', page: 1 },
  { id: 'SB03', name: 'Idler Gear & Flywheel Housing Fitment', page: 2 },
  { id: 'SB04', name: 'Flywheel Housing Torquing & PTFE Oil Seal', page: 2 },
  { id: 'SB04A', name: 'Idler Gear Nut Runner & Backlash Check', page: 2 },
  { id: 'SB05', name: 'FIP Sub-Assembly & Cam Sensor Fitment', page: 2 },
  { id: 'SB05A', name: 'Flywheel Mounting Torquing (180-360 Nm)', page: 2 },
  { id: 'SB06', name: 'Timing Gear Case Assembly & Tightening', page: 2 },
  { id: 'SB07', name: 'Damper Hub, Poly V Pulley & Lub Oil Pipes', page: 2 },
  { id: 'SB08', name: 'Piston / Con-rod Sub-Assembly Stuffing', page: 2 },
  { id: 'SB08A', name: 'Conrod Caps Matching & Accumulator Bracket', page: 3 },
  { id: 'SB09A', name: 'Conrod Nut Runner Torquing & Strainer Fitment', page: 3 },
  { id: 'SB10-SB11', name: 'Piston Torque to Turn & Fuel Filter Studs', page: 3 },
  { id: 'SB12', name: 'Sump Sealant Application & Fitment', page: 3 },
  { id: 'SB13', name: 'Sump Nut Runner Torquing (34 Bolts)', page: 3 },
  { id: 'LB01', name: 'Front Lifting Bracket, Oil Cooler & Starter', page: 3 },
  { id: 'LB02', name: 'Cylinder Head Gasket & Head Sub-Assembly', page: 3 },
  { id: 'LB03', name: 'Exhaust Manifold & Water Pump Fitment', page: 3 },
  { id: 'LB03A', name: 'Push Rods & Rocker Lever Assembly', page: 3 },
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
  { id: 'LB19', name: 'Oil Level Gauge (Dipstick) Tube Fitment', page: 6 },
  { id: 'LB20', name: 'CCV / OCV Filter Assembly Fitment', page: 6 },
  { id: 'LB20A', name: 'CCV Hoses & Drain Pipe Fitment', page: 6 },
  { id: 'LB21', name: 'Fuel High Pressure Pipes Fitment (1 to 6)', page: 6 },
  { id: 'LB22', name: 'HP Pipes Final Torquing & Clamping', page: 6 },
  { id: 'LB22A', name: 'Fuel Return Lines & Leak-off Connections', page: 6 },
  { id: 'LB23', name: 'Air Intake Manifold / Elbow Fitment', page: 6 },
  { id: 'LB23A', name: 'Intake Throttle Valve (ITV) Fitment', page: 6 },
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
  { id: 'LB32', name: 'Coolant Hose Clamps Final Torque Verification', page: 8 },
  { id: 'LB33', name: 'ECOS System Cold Leak Testing Validation', page: 8 },
  { id: 'LB34', name: 'Engine Oil Filling (Specified Grade & Vol)', page: 8 },
  { id: 'LB35', name: 'End of Line Q-GATE-4 Comprehensive Audit', page: 8 },
  { id: 'LB36', name: 'Engine Lifting Decision: Testing vs Rectification', page: 8 },
  { id: 'PAGE9-QR', name: 'Aggregate QR Code Scanning & Serialization Grid', page: 9 },
  { id: 'TESTING-LEAK', name: 'Hot Testing Inspector Check: Leak & Noise', page: 10 },
  { id: 'DRESSING', name: 'Engine Dressing Points Verification', page: 10 },
  { id: 'FINAL-INSP', name: 'Final Quality Inspection Points (1 to 52)', page: 10 },
  { id: 'FIREWALL-PASS', name: 'Quality Firewall Sign-Off & Release', page: 10 }
];

const MIME_TYPES = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml'
};

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;

  const sendJson = (statusCode, data) => {
    res.writeHead(statusCode, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
  };

  const getBody = () => {
    return new Promise((resolve) => {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', () => {
        try {
          resolve(body ? JSON.parse(body) : {});
        } catch (e) {
          resolve({});
        }
      });
    });
  };

  if (pathname === '/api/stations' && req.method === 'GET') {
    return sendJson(200, { success: true, count: STATIONS.length, stations: STATIONS });
  }

  if (pathname === '/api/engines' && req.method === 'GET') {
    try {
      if (isMongoConnected && EngineModel) {
        const list = await EngineModel.find({}, 'barcode spec hp_rating shift current_station overall_status updated_at').sort({ updated_at: -1 });
        return sendJson(200, { success: true, count: list.length, engines: list, storage: 'MongoDB' });
      }
      const local = getLocalEngines();
      const list = Object.values(local).map(e => ({
        barcode: e.barcode,
        spec: e.spec,
        hp_rating: e.hp_rating,
        shift: e.shift,
        current_station: e.current_station,
        overall_status: e.overall_status,
        updated_at: e.updated_at
      }));
      return sendJson(200, { success: true, count: list.length, engines: list, storage: 'Local File' });
    } catch (err) {
      return sendJson(500, { success: false, error: err.message });
    }
  }

  if (pathname === '/api/engines/init' && req.method === 'POST') {
    const body = await getBody();
    const barcode = (body.barcode || '').trim().toUpperCase();
    if (!barcode) {
      return sendJson(400, { success: false, error: 'Engine barcode is required' });
    }

    try {
      if (isMongoConnected && EngineModel) {
        let engine = await EngineModel.findOne({ barcode });
        if (!engine) {
          engine = new EngineModel({
            barcode,
            spec: body.spec || 'H6 BSVI - 4V Engines',
            hp_rating: body.hp_rating || '250 HP',
            shift: body.shift || 'I',
            current_station: 'CB01',
            overall_status: 'IN_PROGRESS',
            sections: {}
          });
          await engine.save();
        }
        return sendJson(200, { success: true, engine, storage: 'MongoDB' });
      }

      const local = getLocalEngines();
      if (!local[barcode]) {
        local[barcode] = {
          barcode,
          spec: body.spec || 'H6 BSVI - 4V Engines',
          hp_rating: body.hp_rating || '250 HP',
          shift: body.shift || 'I',
          date: new Date(),
          current_station: 'CB01',
          overall_status: 'IN_PROGRESS',
          sections: {},
          created_at: new Date(),
          updated_at: new Date()
        };
        saveLocalEngines(local);
      }
      return sendJson(200, { success: true, engine: local[barcode], storage: 'Local File' });
    } catch (err) {
      return sendJson(500, { success: false, error: err.message });
    }
  }

  const getEngineMatch = pathname.match(/^\/api\/engines\/([^\/]+)$/);
  if (getEngineMatch && req.method === 'GET') {
    const barcode = decodeURIComponent(getEngineMatch[1]).trim().toUpperCase();
    try {
      if (isMongoConnected && EngineModel) {
        const engine = await EngineModel.findOne({ barcode });
        if (!engine) {
          return sendJson(404, { success: false, error: `Engine ${barcode} not found` });
        }
        return sendJson(200, { success: true, engine, storage: 'MongoDB' });
      }

      const local = getLocalEngines();
      const engine = local[barcode];
      if (!engine) {
        return sendJson(404, { success: false, error: `Engine ${barcode} not found` });
      }
      return sendJson(200, { success: true, engine, storage: 'Local File' });
    } catch (err) {
      return sendJson(500, { success: false, error: err.message });
    }
  }

  const sectionMatch = pathname.match(/^\/api\/engines\/([^\/]+)\/section\/([^\/]+)$/);
  if (sectionMatch && req.method === 'POST') {
    const barcode = decodeURIComponent(sectionMatch[1]).trim().toUpperCase();
    const sectionId = decodeURIComponent(sectionMatch[2]).trim();
    const body = await getBody();

    const { operator_token, operator_name, test_cases, remarks } = body;
    if (!operator_token || !operator_token.trim()) {
      return sendJson(400, { success: false, error: 'Operator Token No. is mandatory' });
    }

    let hasFailures = false;
    if (Array.isArray(test_cases)) {
      for (const tc of test_cases) {
        if (tc.status === 'fail') {
          hasFailures = true;
          if (!tc.remark || !tc.remark.trim()) {
            return sendJson(400, {
              success: false,
              error: `Validation Error: Test item #${tc.item_no || ''} failed but has NO compulsory remark!`
            });
          }
        }
      }
    }

    const sectionPayload = {
      section_id: sectionId,
      operator_token: operator_token.trim(),
      operator_name: operator_name ? operator_name.trim() : 'Operator',
      status: hasFailures ? 'COMPLETED_WITH_FAILURES' : 'COMPLETED_PASSED',
      submitted_at: new Date(),
      test_cases: test_cases || [],
      general_remarks: remarks || ''
    };

    const currentIndex = STATIONS.findIndex(s => s.id === sectionId);
    let nextStation = sectionId;
    if (currentIndex >= 0 && currentIndex < STATIONS.length - 1) {
      nextStation = STATIONS[currentIndex + 1].id;
    }

    try {
      if (isMongoConnected && EngineModel) {
        let engine = await EngineModel.findOne({ barcode });
        if (!engine) {
          engine = new EngineModel({ barcode, sections: {} });
        }
        if (!engine.sections) engine.sections = {};
        engine.sections[sectionId] = sectionPayload;
        engine.markModified('sections');
        engine.current_station = nextStation;
        engine.updated_at = new Date();
        await engine.save();

        return sendJson(200, {
          success: true,
          message: `Station ${sectionId} recorded in MongoDB. Engine progressed to ${nextStation}.`,
          section: sectionPayload,
          next_station: nextStation,
          engine,
          storage: 'MongoDB'
        });
      }

      const local = getLocalEngines();
      if (!local[barcode]) {
        local[barcode] = { barcode, sections: {}, current_station: 'CB01' };
      }
      if (!local[barcode].sections) local[barcode].sections = {};
      local[barcode].sections[sectionId] = sectionPayload;
      local[barcode].current_station = nextStation;
      local[barcode].updated_at = new Date();
      saveLocalEngines(local);

      return sendJson(200, {
        success: true,
        message: `Station ${sectionId} recorded. Engine progressed to ${nextStation}.`,
        section: sectionPayload,
        next_station: nextStation,
        engine: local[barcode],
        storage: 'Local File'
      });
    } catch (err) {
      return sendJson(500, { success: false, error: err.message });
    }
  }

  let filePath = path.join(__dirname, pathname === '/' ? 'index.html' : pathname);
  const extname = path.extname(filePath);
  const contentType = MIME_TYPES[extname] || 'application/octet-stream';

  fs.readFile(filePath, (err, data) => {
    if (err) {
      if (err.code === 'ENOENT') {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('404 Not Found');
      } else {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('500 Internal Server Error');
      }
    } else {
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(data);
    }
  });
});

server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
