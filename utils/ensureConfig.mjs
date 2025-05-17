import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import sql from 'mssql';

let inquirer;
async function getInquirer() {
  if (!inquirer) {
    const mod = await import('inquirer');
    inquirer = mod.default || mod;
  }
  return inquirer;
}

const configPath = path.join(global.BASE_DIR || __dirname, 'data', 'config.json');

async function validateSqlConnection({ dbHost, dbPort, dbUser, dbPass, dbName }) {
  const config = {
    server: dbHost,
    port: dbPort,
    user: dbUser,
    password: dbPass,
    database: dbName,
    options: {
      encrypt: false,
      trustServerCertificate: true
    },
    connectionTimeout: 5000
  };

  try {
    const pool = await sql.connect(config);
    await pool.close();
    return true;
  } catch (err) {
    console.error('\n❌ Failed to connect to SQL Server:\n' + err.message);
    return false;
  }
}

async function runSetupWizard() {
  console.log('🛠️  No config.json found. Starting setup wizard...\n');

  const inq = await getInquirer();
  const answers = await inq.prompt([
    {
      type: 'input',
      name: 'siteName',
      message: 'Site name:',
      default: 'CityVault'
    },
    {
      type: 'input',
      name: 'domain',
      message: 'Public domain (e.g. cityvault.example.com):',
      default: 'localhost'
    },
    {
      type: 'input',
      name: 'ipAddr',
      message: 'Server IP address:',
      default: '0.0.0.0'
    }
  ]);

  let authValid = false;
  let authAnswers;

  while (!authValid) {
    authAnswers = await inq.prompt([
      {
        type: 'input',
        name: 'dbHost',
        message: 'Auth DB host:',
        default: 'localhost'
      },
      {
        type: 'number',
        name: 'dbPort',
        message: 'Auth DB port:',
        default: 1433
      },
      {
        type: 'input',
        name: 'dbUser',
        message: 'Auth DB user:',
        default: 'sa'
      },
      {
        type: 'password',
        name: 'dbPass',
        message: 'Auth DB password:',
        mask: '*',
        validate: input => input ? true : 'Password cannot be empty'
      },
      {
        type: 'input',
        name: 'dbName',
        message: 'Auth DB name:',
        default: 'cohauth'
      }
    ]);

    console.log('\n🔌 Testing connection to SQL Server (cohauth)...');
    authValid = await validateSqlConnection(authAnswers);
    if (!authValid) {
      console.log('Please check your credentials and try again.\n');
    }
  }

  let chatValid = false;
  let chatAnswers;

  while (!chatValid) {
    chatAnswers = await inq.prompt([
      {
        type: 'input',
        name: 'dbHost',
        message: 'Chat DB host:',
        default: authAnswers.dbHost
      },
      {
        type: 'number',
        name: 'dbPort',
        message: 'Chat DB port:',
        default: authAnswers.dbPort
      },
      {
        type: 'input',
        name: 'dbUser',
        message: 'Chat DB user:',
        default: authAnswers.dbUser
      },
      {
        type: 'password',
        name: 'dbPass',
        message: 'Chat DB password:',
        mask: '*',
        default: authAnswers.dbPass
      },
      {
        type: 'input',
        name: 'dbName',
        message: 'Chat DB name:',
        default: 'cohchat'
      }
    ]);

    console.log('\n🔌 Testing connection to SQL Server (cohchat)...');
    chatValid = await validateSqlConnection(chatAnswers);
    if (!chatValid) {
      console.log('Please check your credentials and try again.\n');
    }
  }

  const emailAnswers = await inq.prompt([
    {
      type: 'confirm',
      name: 'enableEmail',
      message: 'Enable email confirmations / resets?',
      default: false
    },
    {
      type: 'input',
      name: 'mailerApiKey',
      message: 'Enter Mailersend API key:',
      when: a => a.enableEmail,
      validate: input => input ? true : 'API key cannot be empty'
    },
    {
      type: 'input',
      name: 'fromEmail',
      message: 'Default from email (e.g. noreply@yourdomain.com):',
      when: a => a.enableEmail,
      validate: input => input.includes('@') || 'Must be a valid email'
    }
  ]);
  if (!emailAnswers.mailerApiKey) emailAnswers.mailerApiKey = '';
  if (!emailAnswers.fromEmail) emailAnswers.fromEmail = '';
  const sessionSecret = crypto.randomBytes(32).toString('hex');

  const finalConfig = {
    siteName: answers.siteName,
    domain: answers.domain,
    ipAddr: answers.ipAddr,
    session_secret: sessionSecret,
    mailersend: {
      apiKey: emailAnswers?.mailerApiKey || '',
      fromEmail: emailAnswers?.fromEmail || ''
    },
    auth: authAnswers,
    chat: chatAnswers,
    servers: {},
    schedule: {
      tasks: {
        badgeSpotlight: {
          intervalMinutes: 15,
          handler: 'homeWidgets.regenerateBadgeSpotlight'
        },
        checkForUpdates: {
          intervalMinutes: 60,
          handler: 'updateChecker.checkForUpdates'
        }
      }
    },
    logs: {
      accessRetentionDays: 30,
      compress: true
    }
  };

  fs.writeFileSync(configPath, JSON.stringify(finalConfig, null, 2));
  console.log('\n✅ Config saved to data/config.json\n');
}

export default async function ensureConfig() {
  if (!fs.existsSync(configPath)) {
    await runSetupWizard();
  }
}