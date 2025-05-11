
global.BASE_DIR = __dirname;
const express = require('express');
const path = require('path');
const session = require('express-session');
const FileStore = require('session-file-store')(session);
const expressLayouts = require('express-ejs-layouts');
const sql = require('mssql');
const adminRoutes = require('./routes/admin');
const cookieParser = require('cookie-parser');
const flash = require('connect-flash');
require('dotenv').config();
const config = require('./utils/config');
const saveReturnTo = require('./middleware/saveReturnTo');
const { stringClean } = require('./utils/textSanitizer');

const authConfig = {
  user: config.auth.dbUser,
  password: config.auth.dbPass,
  server: config.auth.dbHost,
  database: config.auth.dbName,
  port: config.auth.dbPort,
  options: {
    encrypt: true,
    trustServerCertificate: true
  }
};

const readline = require('readline');

async function ensureSchema() {
  try {
    const pool = await sql.connect(authConfig);

    // Check for 'email' column
    const emailCheck = await pool.request().query(`
      SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_NAME = 'user_account' AND COLUMN_NAME = 'email'
    `);
    if (emailCheck.recordset.length === 0) {
      console.log("[INFO] Adding 'email' column to user_account...");
      await pool.request().query(`
        ALTER TABLE cohauth.dbo.user_account ADD email VARCHAR(254) NULL;
      `);
      console.log("[INFO] 'email' column added.");
    }

    // Check for 'role' column
    const roleCheck = await pool.request().query(`
      SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_NAME = 'user_account' AND COLUMN_NAME = 'role'
    `);
    if (roleCheck.recordset.length === 0) {
      console.log("[INFO] Adding 'role' column to user_account...");
      await pool.request().query(`
        ALTER TABLE cohauth.dbo.user_account ADD role VARCHAR(16) NOT NULL DEFAULT 'user';
      `);
      console.log("[INFO] 'role' column added.");
    }

    // Check for 'tracker' column
    const trackerCheck = await pool.request().query(`
      SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_NAME = 'user_account' AND COLUMN_NAME = 'tracker'
    `);
    if (trackerCheck.recordset.length === 0) {
      console.log("[INFO] Adding 'tracker' column to user_account...");
      await pool.request().query(`
        ALTER TABLE cohauth.dbo.user_account ADD tracker VARCHAR(1) NOT NULL DEFAULT '1';
      `);
      console.log("[INFO] 'tracker' column added.");
    }

    // Check if any admin user exists
    const adminCheck = await pool.request().query(`
      SELECT COUNT(*) AS count FROM cohauth.dbo.user_account WHERE role = 'admin'
    `);

    if (adminCheck.recordset[0].count === 0) {
      console.log("[WARN] No admin user found.");

      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
      });

      rl.question("Enter the AuthName of the user to promote to admin: ", async (authName) => {
        rl.close();

        const userCheck = await pool.request()
          .input('authName', sql.VarChar, authName)
          .query(`
            SELECT uid FROM cohauth.dbo.user_account WHERE account = @authName
          `);

        if (userCheck.recordset.length === 0) {
          console.log(`[ERROR] No user found with AuthName "${authName}".`);
        } else {
          const uid = userCheck.recordset[0].uid;

          await pool.request()
            .input('uid', sql.Int, uid)
            .query(`
              UPDATE cohauth.dbo.user_account SET role = 'admin' WHERE uid = @uid
            `);

          console.log(`[SUCCESS] User "${authName}" has been promoted to admin.`);
        }
      });
    }

  } catch (err) {
    console.error("[ERROR] Failed to ensure schema:", err);
  }
}


ensureSchema();

const app = express();
app.use(cookieParser());
// Middleware to parse form data
app.use(express.urlencoded({ extended: true }));

// Persistent sessions via file store
app.use(session({
  store: new FileStore({
    path: path.join(__dirname, 'sessions'),
    retries: 1,
    fileExtension: '.json',
    logFn: function () {} // ← silences all session logging
  }),
  secret: config.session_secret, // change this in production
  resave: false,
  saveUninitialized: false,  rolling: true, // Reset the cookie Max-Age on every response
  cookie: {
    maxAge: 365 * 24 * 60 * 60 * 1000, // 1 year in milliseconds
    secure: true // Set to true if using HTTPS
  }
}));

app.use(flash());

app.use(saveReturnTo);  // Place this before auth checks

app.use((req, res, next) => {
  res.locals.username = req.session.username || null;
  res.locals.role = req.session.role || null;

  // Use a function to defer reading flash until the view is rendered
  res.locals.getMessages = () => ({
    success: req.flash('success'),
    error: req.flash('error')
  });
  res.locals.config = config;
  next();
});
app.locals.stringClean = stringClean;
app.use('/images', express.static(path.join(BASE_DIR, 'public/images'), {
  maxAge: '7d', // cache for 7 days
}));
// EJS + Layout setup
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(expressLayouts);
app.set('layout', 'layout'); // uses views/layout.ejs

// Static files (CSS, images, etc.)
app.use(express.static(path.join(__dirname, 'public')));

app.use((req, res, next) => {
  const _setHeader = res.setHeader;
  res.setHeader = function (name, value) {
    if (name.toLowerCase() === 'strict-transport-security') {
      console.log(`[DEBUG] HSTS header attempted: ${value}`);
    }
    return _setHeader.apply(this, arguments);
  };
  next();
});



// Routes
const routes = require('./routes');
app.use(routes);

// 404 handler
app.use((req, res, next) => {
  res.status(404);
  res.render('404', { url: req.originalUrl });
});


const domain = config.domain;
const ipAddress = config.ipAddr;

module.exports = app;