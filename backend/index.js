const path = require('path');
const express = require('express');
const session = require('express-session');
const sqlite3 = require('sqlite3').verbose();
const SQLiteStore = require('connect-sqlite3')(session);

const app = express();
const db = new sqlite3.Database(path.join(__dirname, 'db.sqlite'));

app.set('views', path.join(__dirname, '../frontend'));
app.set('view engine', 'ejs');

// Ensure users table and default user
function initDb() {
  db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, username TEXT UNIQUE, password TEXT)`);
    db.run(`CREATE TABLE IF NOT EXISTS mikrotiks (id INTEGER PRIMARY KEY, nombre TEXT, cloud TEXT, modelo TEXT, ip_interna TEXT, offline_timeout INTEGER DEFAULT 5, last_seen INTEGER)`);
    db.run(`ALTER TABLE mikrotiks ADD COLUMN last_seen INTEGER`, () => {});
    db.run(`ALTER TABLE mikrotiks ADD COLUMN offline_timeout INTEGER DEFAULT 5`, () => {});
    db.get(`SELECT COUNT(*) as count FROM users WHERE username = ?`, ['admin'], (err, row) => {
      if (row.count === 0) {
        db.run(`INSERT INTO users (username, password) VALUES (?, ?)`, ['admin', 'admin']);
      }
    });
  });
}

initDb();

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
      return {
        ...r,
        status: r.last_seen && (now - r.last_seen <= timeout * 60 * 1000) ? 'Online' : 'Offline'
      };
    });
    res.render('mikrotiks', { username: req.session.username, mikrotiks: devices });
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
  const { nombre, cloud, modelo, ip_interna, offline_timeout } = req.body;
  if (!nombre || !cloud || !modelo || !ip_interna) return res.redirect('/mikrotiks');
  const timeout = parseInt(offline_timeout) || 5;
  db.run(`INSERT INTO mikrotiks (nombre, cloud, modelo, ip_interna, offline_timeout, last_seen) VALUES (?, ?, ?, ?, ?, ?)`,
    [nombre, cloud, modelo, ip_interna, timeout, 0], () => {
      res.redirect('/mikrotiks');
    });
});

// Update Mikrotik
app.post('/mikrotiks/edit/:id', checkAuth, (req, res) => {
  const { nombre, cloud, modelo, ip_interna, offline_timeout } = req.body;
  const timeout = parseInt(offline_timeout) || 5;
  db.run(`UPDATE mikrotiks SET nombre = ?, cloud = ?, modelo = ?, ip_interna = ?, offline_timeout = ? WHERE id = ?`,
    [nombre, cloud, modelo, ip_interna, timeout, req.params.id], () => {
      res.redirect('/mikrotiks');
    });
});

// Delete Mikrotik
app.post('/mikrotiks/delete/:id', checkAuth, (req, res) => {
  db.run(`DELETE FROM mikrotiks WHERE id = ?`, [req.params.id], () => {
    res.redirect('/mikrotiks');
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
  const { cloud } = req.query;
  if (!cloud) return res.status(400).send('missing cloud');
  const now = Date.now();
  db.run(`UPDATE mikrotiks SET last_seen = ? WHERE cloud = ?`, [now, cloud], function (err) {
    if (err || this.changes === 0) return res.status(404).send('not found');
    res.send('ok');
  });
});
const MONITOR_PORT = process.env.MONITOR_PORT || 4000;
monitorApp.listen(MONITOR_PORT, () => {
  console.log(`Monitor escuchando en puerto ${MONITOR_PORT}`);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor iniciado en puerto ${PORT}`);
});
