const path = require('path');
const express = require('express');
const session = require('express-session');
const sqlite3 = require('sqlite3').verbose();
const SQLiteStore = require('connect-sqlite3')(session);

const app = express();
const db = new sqlite3.Database(path.join(__dirname, 'db.sqlite'));

// Ensure users table and default user
function initDb() {
  db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, username TEXT UNIQUE, password TEXT)`);
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
  const filePath = path.join(__dirname, '../frontend/login.html');
  res.sendFile(filePath);
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
  const html = `<!DOCTYPE html>
  <html><head><meta charset='utf-8'><title>Dashboard</title><link rel='stylesheet' href='/static/style.css'></head>
  <body><h1>Dashboard Principal</h1><p>Bienvenido, ${req.session.username}!</p><a href='/logout'>Cerrar sesión</a></body></html>`;
  res.send(html);
});

app.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/login');
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor iniciado en puerto ${PORT}`);
});
