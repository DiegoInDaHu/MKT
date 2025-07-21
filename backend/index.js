const path = require('path');
const express = require('express');
const session = require('express-session');
const sqlite3 = require('sqlite3').verbose();
const SQLiteStore = require('connect-sqlite3')(session);
const fs = require('fs');
const https = require('https');
const crypto = require('crypto');

const app = express();
const db = new sqlite3.Database(path.join(__dirname, 'db.sqlite'));
let monitorServer;
let monitorPort = process.env.MONITOR_PORT || 4000;
let statusOffset = 0;
const SSL_CERT = process.env.SSL_CERT || path.join(__dirname, 'ssl/cert.pem');
const SSL_KEY = process.env.SSL_KEY || path.join(__dirname, 'ssl/key.pem');

app.set('views', path.join(__dirname, '../frontend'));
app.set('view engine', 'ejs');

// Ensure users table and default user
function initDb(cb) {
  db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, username TEXT UNIQUE, password TEXT)`);
    db.run(`CREATE TABLE IF NOT EXISTS mikrotiks (id INTEGER PRIMARY KEY, nombre TEXT, cloud TEXT, token TEXT, modelo TEXT, ip_interna TEXT, offline_timeout INTEGER DEFAULT 5, last_seen INTEGER, visible INTEGER DEFAULT 1)`);
    db.run(`ALTER TABLE mikrotiks ADD COLUMN last_seen INTEGER`, () => {});
    db.run(`ALTER TABLE mikrotiks ADD COLUMN offline_timeout INTEGER DEFAULT 5`, () => {});
    db.run(`ALTER TABLE mikrotiks ADD COLUMN visible INTEGER DEFAULT 1`, () => {});
    db.run(`ALTER TABLE mikrotiks ADD COLUMN token TEXT`, () => {});
    db.run(`CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT)`);
    db.get(`SELECT COUNT(*) as count FROM users WHERE username = ?`, ['admin'], (err, row) => {
      if (row.count === 0) {
        db.run(`INSERT INTO users (username, password) VALUES (?, ?)`, ['admin', 'admin']);
      }
    });
    const defaultPort = process.env.MONITOR_PORT || 4000;
    const defaultOffset = 0;
    db.get(`SELECT value FROM settings WHERE key = ?`, ['monitor_port'], (err, row) => {
      const port = row ? parseInt(row.value) || defaultPort : defaultPort;
      if (!row) {
        db.run(`INSERT INTO settings (key, value) VALUES (?, ?)`, ['monitor_port', defaultPort]);
      }
      db.get(`SELECT value FROM settings WHERE key = ?`, ['state_offset'], (e2, r2) => {
        statusOffset = r2 ? parseInt(r2.value) || defaultOffset : defaultOffset;
        if (!r2) {
          db.run(`INSERT INTO settings (key, value) VALUES (?, ?)`, ['state_offset', defaultOffset]);
        }
        cb(port);
      });
    });
  });
}

initDb(port => startMonitorServer(port));

app.use(express.urlencoded({ extended: true }));
app.use('/static', express.static(path.join(__dirname, '../frontend/static')));

app.use(session({
  store: new SQLiteStore({ db: 'sessions.sqlite', dir: __dirname }),
  secret: 'secretkey',
  resave: false,
  saveUninitialized: false
}));

function checkAuth(req, res, next) {
  if (req.session.userId) {
    next();
  } else {
    res.redirect('/login');
  }
}

app.get('/login', (req, res) => {
  res.render('login');
});

app.post('/login', (req, res) => {
  const { username, password } = req.body;
  db.get(`SELECT * FROM users WHERE username = ? AND password = ?`, [username, password], (err, row) => {
    if (row) {
      req.session.userId = row.id;
      req.session.username = row.username;
      res.redirect('/dashboard');
    } else {
      res.send(`<script>alert('Credenciales incorrectas');window.location='/login';</script>`);
    }
  });
});

app.get('/dashboard', checkAuth, (req, res) => {
  res.render('dashboard', { username: req.session.username });
});

// List all users
app.get('/users', checkAuth, (req, res) => {
  db.all(`SELECT id, username FROM users`, [], (err, rows) => {
    res.render('users', { username: req.session.username, users: rows });
  });
});

// Render edit form for a user
app.get('/users/edit/:id', checkAuth, (req, res) => {
  db.get(`SELECT id, username, password FROM users WHERE id = ?`, [req.params.id], (err, row) => {
    if (!row) return res.redirect('/users');
    res.render('editUser', { username: req.session.username, user: row });
  });
});

// Add new user
app.post('/users/add', checkAuth, (req, res) => {
  const { newUsername, newPassword } = req.body;
  if (!newUsername || !newPassword) return res.redirect('/users');
  db.run(`INSERT INTO users (username, password) VALUES (?, ?)`, [newUsername, newPassword], () => {
    res.redirect('/users');
  });
});

// Update existing user
app.post('/users/edit/:id', checkAuth, (req, res) => {
  const { username: u, password: p } = req.body;
  db.run(`UPDATE users SET username = ?, password = ? WHERE id = ?`, [u, p, req.params.id], () => {
    res.redirect('/users');
  });
});

// Delete user
app.post('/users/delete/:id', checkAuth, (req, res) => {
  db.run(`DELETE FROM users WHERE id = ?`, [req.params.id], () => {
    res.redirect('/users');
  });
});

// List Mikrotik devices
app.get('/mikrotiks', checkAuth, (req, res) => {
  db.all(`SELECT * FROM mikrotiks`, [], (err, rows) => {
    const now = Date.now();
    const devices = rows.map(r => {
      const timeout = r.offline_timeout || 5;
      const limit = timeout * 60 * 1000 + statusOffset * 1000;
      return {
        ...r,
        status: r.last_seen && (now - r.last_seen <= limit) ? 'Online' : 'Offline'
      };
    });
    res.render('mikrotiks', { username: req.session.username, mikrotiks: devices });
  });
});

// API endpoint returning Mikrotik status
app.get('/api/mikrotiks', checkAuth, (req, res) => {
  db.all(`SELECT * FROM mikrotiks WHERE visible = 1`, [], (err, rows) => {
    const now = Date.now();
    const devices = rows.map(r => {
      const timeout = r.offline_timeout || 5;
      const limit = timeout * 60 * 1000 + statusOffset * 1000;
      return {
        id: r.id,
        nombre: r.nombre,
        status: r.last_seen && (now - r.last_seen <= limit) ? 'Online' : 'Offline'
      };
    });
    res.json(devices);
  });
});

// Render edit form for Mikrotik
app.get('/mikrotiks/edit/:id', checkAuth, (req, res) => {
  db.get(`SELECT * FROM mikrotiks WHERE id = ?`, [req.params.id], (err, row) => {
    if (!row) return res.redirect('/mikrotiks');
    res.render('editMikrotik', { username: req.session.username, mikrotik: row });
  });
});

// Add Mikrotik
app.post('/mikrotiks/add', checkAuth, (req, res) => {
  const { nombre, cloud, modelo, ip_interna, offline_timeout, token } = req.body;
  if (!nombre || !cloud || !modelo || !ip_interna || !token) return res.redirect('/mikrotiks');
  const timeout = parseInt(offline_timeout) || 5;
  db.run(`INSERT INTO mikrotiks (nombre, cloud, token, modelo, ip_interna, offline_timeout, last_seen, visible) VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
    [nombre, cloud, token, modelo, ip_interna, timeout, 0], () => {
      res.redirect('/mikrotiks');
    });
});

// Update Mikrotik
app.post('/mikrotiks/edit/:id', checkAuth, (req, res) => {
  const { nombre, cloud, modelo, ip_interna, offline_timeout, token } = req.body;
  const timeout = parseInt(offline_timeout) || 5;
  db.run(`UPDATE mikrotiks SET nombre = ?, cloud = ?, token = ?, modelo = ?, ip_interna = ?, offline_timeout = ? WHERE id = ?`,
    [nombre, cloud, token, modelo, ip_interna, timeout, req.params.id], () => {
      res.redirect('/mikrotiks');
    });
});

// Toggle Mikrotik visibility
app.post('/mikrotiks/:id/visible', checkAuth, (req, res) => {
  const visible = req.body.visible === '1' ? 1 : 0;
  db.run(`UPDATE mikrotiks SET visible = ? WHERE id = ?`, [visible, req.params.id], () => {
    res.sendStatus(200);
  });
});

// Delete Mikrotik
app.post('/mikrotiks/delete/:id', checkAuth, (req, res) => {
  db.run(`DELETE FROM mikrotiks WHERE id = ?`, [req.params.id], () => {
    res.redirect('/mikrotiks');
  });
});

// Settings view
app.get('/settings', checkAuth, (req, res) => {
  db.all(`SELECT key, value FROM settings WHERE key IN ('monitor_port','state_offset')`, (err, rows) => {
    let port = monitorPort;
    let offset = statusOffset;
    rows.forEach(r => {
      if (r.key === 'monitor_port') port = r.value;
      if (r.key === 'state_offset') offset = r.value;
    });
    res.render('settings', { username: req.session.username, port, offset });
  });
});

// Update only monitor port
app.post('/settings/port', checkAuth, (req, res) => {
  const newPort = parseInt(req.body.port);
  if (!newPort || newPort < 1 || newPort > 65535) {
    return res.redirect('/settings');
  }
  db.run(`UPDATE settings SET value = ? WHERE key = ?`, [newPort, 'monitor_port'], () => {
    if (newPort !== monitorPort) {
      startMonitorServer(newPort);
    }
    res.redirect('/settings');
  });
});

// Update only state offset
app.post('/settings/offset', checkAuth, (req, res) => {
  const newOffset = parseInt(req.body.state_offset);
  if (isNaN(newOffset) || newOffset < 0) {
    return res.redirect('/settings');
  }
  db.run(`UPDATE settings SET value = ? WHERE key = ?`, [newOffset, 'state_offset'], () => {
    statusOffset = newOffset;
    res.redirect('/settings');
  });
});

// Update settings
app.post('/settings', checkAuth, (req, res) => {
  const newPort = parseInt(req.body.port);
  const newOffset = parseInt(req.body.state_offset);
  if (!newPort || newPort < 1 || newPort > 65535 || isNaN(newOffset) || newOffset < 0) {
    return res.redirect('/settings');
  }
  db.serialize(() => {
    db.run(`UPDATE settings SET value = ? WHERE key = ?`, [newPort, 'monitor_port']);
    db.run(`UPDATE settings SET value = ? WHERE key = ?`, [newOffset, 'state_offset'], () => {
      if (newPort !== monitorPort) {
        startMonitorServer(newPort);
      }
      statusOffset = newOffset;
      res.redirect('/settings');
    });
  });
});

app.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/login');
  });
});

// Monitoring endpoint for Mikrotik heartbeats
const monitorApp = express();
monitorApp.get('/ping', (req, res) => {
  const { cloud, token } = req.query;
  if (!cloud || !token) return res.status(400).send('missing params');
  const now = Date.now();
  db.run(`UPDATE mikrotiks SET last_seen = ? WHERE cloud = ? AND token = ?`, [now, cloud, token], function (err) {
    if (err || this.changes === 0) return res.status(404).send('not found');
    res.send('ok');
  });
});

function startMonitorServer(port) {
  if (monitorServer) {
    monitorServer.close();
  }
  monitorPort = port;
  const options = {
    cert: fs.readFileSync(SSL_CERT),
    key: fs.readFileSync(SSL_KEY)
  };
  monitorServer = https.createServer(options, monitorApp).listen(port, () => {
    console.log(`Monitor HTTPS escuchando en puerto ${port}`);
  });
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor iniciado en puerto ${PORT}`);
});
