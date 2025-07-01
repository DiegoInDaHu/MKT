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

app.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/login');
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor iniciado en puerto ${PORT}`);
});
