module.exports = async function startApp(config) {
  global.BASE_DIR = __dirname;

  const fs = require('fs-extra');
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
  const migrateSessionsToSQLite = require(global.BASE_DIR + '/utils/migrateSessionsToSQLite');
  const { deployLauncherZip } = require('./utils/deployLauncherZip');
  const multer = require('multer');
  const upload = multer({ storage: multer.memoryStorage() });
  const { preloadAttributeMaps } = require('./utils/attributeMap');


  await preloadAttributeMaps(Object.keys(config.servers));
  console.log('[Init] Attribute maps preloaded for:', Object.keys(config.servers).join(', '));

  const sessionsDir = path.join(__dirname, 'sessions');
  const sqlitePath = path.join(__dirname, 'data', 'sessions.sqlite');

  const tmpDir = path.join(__dirname, 'tmp', 'imports');
  fs.ensureDirSync(tmpDir);
  fs.emptyDirSync(tmpDir);

  global.characterImportTasks = new Map(); // TaskID → { status, message, ... }
  global.importTmpDir = tmpDir;

  const exportTmpDir = path.join(__dirname, 'tmp', 'exports');
  fs.ensureDirSync(exportTmpDir);
  fs.emptyDirSync(exportTmpDir);
  global.characterExportTasks = new Map();
  global.exportTmpDir = exportTmpDir;
  fs.ensureDirSync(path.join(__dirname, 'public', 'exports'));


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
  const BetterSessionStore = require('./utils/BetterSessionStore');

  app.use(session({
    store: new BetterSessionStore(path.join(__dirname, 'data', 'sessions.sqlite'), {
      ttl: 365 * 24 * 60 * 60 // 1 year
    }),
    secret: config.session_secret,
    resave: false,
    saveUninitialized: true,
    rolling: true,
    cookie: {
      maxAge: 365 * 24 * 60 * 60 * 1000,
      secure: config.useAutoEncrypt === true,
      signed: true
    }
  }));

  // ✅ Now req.session will exist if the middleware creates it
  app.use((req, res, next) => {
    if (!req.session) {
      req.session = {}; // optional, safety net
    }
    if (!req.session.cookie) {
      req.session.cookie = {};
    }
    next();
  });


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
    //res.locals.role = req.user?.role || null;
    res.locals.currentUserRole = req.user?.role || null;
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

  app.locals.tooltip = function (content, tooltipText) {
    return `
      <span class="relative group cursor-pointer align-middle">
        ${content}
        <div class="absolute left-6 top-1 z-10 w-64 rounded bg-gray-800 text-white text-xs p-2 
                    opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none shadow-lg">
          ${tooltipText}
        </div>
      </span>
    `;
  };


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

  deployLauncherZip();


  ensureSchema(authConfig).then(() => {
    // optional: log success
  }).catch(err => {
    console.error('[schema] Error ensuring schema:', err);
  });
  startScheduledTasks();

  const outputPath = path.join(global.BASE_DIR, 'renders');
  const renderOutputPath = path.join(global.BASE_DIR, 'public', 'images', 'portrait');
  fs.mkdirSync(outputPath, { recursive: true });
  fs.mkdirSync(renderOutputPath, { recursive: true });

  ensureConfigDefaults({
    costumeRendering: {
      outputPath,
      renderOutputPath,
      enabled: false,
      autoStartImageServer: false
    },
    allowRegistration: true,
    accessLevelFilter: 0,
    minBadges: 500,
    quantizeBirthDate: 'day',
    useAutoEncrypt: true,
    schedule: {
      tasks: {
        buildStatsCache: {
          intervalMinutes: 60,
          handler: 'statsCache.buildStatsCache'
        }, convertAllPortraits: {
          intervalMinutes: 60,
          handler: 'portraitService.convertAllPortraits'
        }, renderCharacterCostumes: {
          intervalMinutes: 15,
          handler: 'renderCharacterCostumes.renderCharacterCostumes'
        }
      }
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