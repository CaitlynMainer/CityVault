module.exports = function startApp(config) {
  global.BASE_DIR = __dirname;

  const fs = require('fs');
  const express = require('express');
  const path = require('path');
  const session = require('express-session');
  const FileStore = require('session-file-store')(session);
  const expressLayouts = require('express-ejs-layouts');
  const sql = require('mssql');
  const adminRoutes = require('./routes/admin');
  const cookieParser = require('cookie-parser');
  const flash = require('connect-flash');
  const saveReturnTo = require('./middleware/saveReturnTo');
  const { stringClean } = require('./utils/textSanitizer');
  const compression = require('compression');
  const { startScheduledTasks } = require('./services/scheduler');
  const ensureSchema = require('./utils/ensureSchema');
  const morgan = require('morgan');
  const rfs = require('rotating-file-stream');
  const readline = require('readline');  
  const ensureConfigDefaults = require(global.BASE_DIR + '/utils/ensureConfigDefaults');
  const SQLiteStore = require('connect-sqlite3')(session);

  const migrateSessionsToSQLite = require('./utils/migrateSessionsToSQLite');

  const sessionsDir = path.join(__dirname, 'sessions');
  const sqlitePath = path.join(__dirname, 'data', 'sessions.sqlite');

  migrateSessionsToSQLite(sessionsDir, sqlitePath);
  
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

  const app = express();

  app.use(cookieParser());
  app.use(express.urlencoded({ extended: true }));

  app.use(session({
    store: new SQLiteStore({
      db: 'sessions.sqlite',
      dir: path.join(__dirname, 'data')
    }),
    secret: config.session_secret,
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: {
      maxAge: 365 * 24 * 60 * 60 * 1000,
      secure: true,
      signed: true
    }
  }));

  app.use(require('./middleware/attachUserInfo'));
  const logDir = path.join(__dirname, 'logs');
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }

  const accessLogStream = rfs.createStream('access.log', {
    interval: '1d',
    path: logDir,
    maxFiles: config.logs.accessRetentionDays || 30,
    compress: config.logs.compress ? 'gzip' : false
  });

  const errorLogStream = rfs.createStream('error.log', {
    interval: '1d',
    path: logDir,
    maxFiles: config.logs.accessRetentionDays || 30,
    compress: config.logs.compress ? 'gzip' : false
  });

  app.use(morgan('combined', { stream: accessLogStream }));
  app.use(flash());
  app.use(compression());
  app.use(saveReturnTo);

  app.use((req, res, next) => {
    res.locals.currentPath = req.path;
    res.locals.username = req.session.username || null;
    res.locals.role = req.user?.role || null;
    res.locals.getMessages = () => ({
      success: req.flash('success'),
      error: req.flash('error')
    });
    res.locals.config = config;
    next();
  });

  app.locals.stringClean = stringClean;

  app.set('view engine', 'ejs');
  // Look in userContent/views first, fallback to views
  app.set('views', [
    path.join(__dirname, 'userContent', 'views'),
    path.join(__dirname, 'views')
  ]);
  
  app.use(expressLayouts);
  app.set('layout', 'layout');
  app.use(express.json());

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

  const routes = require('./routes');
  app.use(routes);

  // Serve all other /images from disk
  app.use('/images', express.static(path.join(BASE_DIR, 'public/images'), {
    maxAge: '7d'
  }));

  // Serve all remaining static files (CSS, JS, etc.)
  app.use(express.static(path.join(__dirname, 'public')));

  // Final 404 fallback
  app.use((req, res) => {
    res.status(404).render('error', {
      title: 'Page Not Found',
      message: 'The page you requested does not exist.'
    });
  });


  app.use((err, req, res, next) => {
    const logLine = [
      `[${new Date().toISOString()}]`,
      `URL: ${req.method} ${req.originalUrl}`,
      `Status: ${res.statusCode}`,
      `Message: ${err.message}`,
      `Stack:\n${err.stack || 'No stack'}\n\n`
    ].join('\n');

    errorLogStream.write(logLine);
    console.error(logLine);

    if (res.headersSent) {
      // Don't try to send a response again
      return next(err);
    }

    res.status(500).render('error', {
      title: 'Internal Server Error',
      message: 'An unexpected error occurred.'
    });
  });


  ensureSchema(authConfig).then(() => {
    // optional: log success
  }).catch(err => {
    console.error('[schema] Error ensuring schema:', err);
  });
  startScheduledTasks();

  const outputPath = path.join(global.BASE_DIR, 'renders');
  const renderOutputPath = path.join(global.BASE_DIR, 'public', 'images', 'portrait');
  fs.mkdirSync(outputPath, { recursive: true });

  ensureConfigDefaults({
    costumeRendering: {
      outputPath,
      renderOutputPath,
      enabled: false,
      autoStartImageServer: false
    }
  });
  if (config.costumeRendering?.autoStartImageServer) {
    const { ensureImageServerInstalled, launchImageServer } = require('./utils/imageServerSetup');

    ensureImageServerInstalled()
      .then(() => launchImageServer(config))
      .catch(err => {
        console.error('[ImageServer] Installation error:', err);
      });
  }
  return app;
};