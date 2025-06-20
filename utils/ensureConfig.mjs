import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import os from 'os';
import { fileURLToPath } from 'url';
import * as db from '../db/index.js';

let inquirer;
async function getInquirer() {
  if (!inquirer) {
    const mod = await import('inquirer');
    inquirer = mod.default || mod;
  }
  return inquirer;
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const configPath = path.join(global.BASE_DIR || __dirname, 'data', 'config.json');

// Use app's own DB pool system for validation
async function validateSqlConnection(cfg) {
  try {
    const pool = await db.createPool(cfg);
    await pool.close();
    return true;
  } catch (err) {
    console.error('\n❌ Failed to connect to SQL Server:\n' + err.message);
    return false;
  }
}

async function promptDbConfig(role, defaults) {
  const inq = await getInquirer();
  let valid = false;
  let answers;

  while (!valid) {
    answers = await inq.prompt([
      {
        type: 'confirm',
        name: 'useLocalDB',
        message: `Use LocalDB for ${role}? (Windows only, no username/password)`,
        default: false
      },
      {
        type: 'input',
        name: 'dbHost',
        message: `${role} DB host (e.g. localdb\\MSSQLLocalDB):`,
        default: 'localdb\\MSSQLLocalDB',
        when: a => a.useLocalDB
      },
      {
        type: 'input',
        name: 'dbHost',
        message: `${role} DB host:`,
        default: defaults.dbHost,
        when: a => !a.useLocalDB
      },
      {
        type: 'number',
        name: 'dbPort',
        message: `${role} DB port:`,
        default: defaults.dbPort,
        when: a => !a.useLocalDB
      },
      {
        type: 'input',
        name: 'dbUser',
        message: `${role} DB user:`,
        default: defaults.dbUser,
        when: a => !a.useLocalDB
      },
      {
        type: 'password',
        name: 'dbPass',
        message: `${role} DB password:`,
        mask: '*',
        default: defaults.dbPass,
        when: a => !a.useLocalDB,
        validate: input => input ? true : 'Password cannot be empty'
      },
      {
        type: 'input',
        name: 'dbName',
        message: `${role} DB name:`,
        default: defaults.dbName
      }
    ]);

    console.log(`\n🔌 Testing connection to SQL Server (${role})...`);
    valid = await validateSqlConnection(answers);
    if (!valid) {
      console.log('Please check your credentials and try again.\n');
    }
  }

  return answers;
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
    },
    {
      type: 'confirm',
      name: 'useAutoEncrypt',
      message: 'Enable AutoEncrypt HTTPS? (Let\'s Encrypt, production domains only)',
      default: true
    },
    {
      type: 'number',
      name: 'port',
      message: 'HTTP port to use:',
      default: 3000,
      when: answers => !answers.useAutoEncrypt
    }
  ]);


  const authAnswers = await promptDbConfig('Auth', {
    dbHost: 'localhost',
    dbPort: 1433,
    dbUser: 'sa',
    dbPass: '',
    dbName: 'cohauth'
  });

  const chatAnswers = await promptDbConfig('Chat', {
    dbHost: authAnswers.dbHost,
    dbPort: authAnswers.dbPort,
    dbUser: authAnswers.dbUser,
    dbPass: authAnswers.dbPass,
    dbName: 'cohchat'
  });

  const sessionSecret = crypto.randomBytes(32).toString('hex');

  const finalConfig = {
    siteName: answers.siteName,
    domain: answers.domain,
    ipAddr: answers.ipAddr,
	useAutoEncrypt: answers.useAutoEncrypt,
    session_secret: sessionSecret,
    email: {
      provider: '',
      fromEmail: '',
      mailersend: {
        apiKey: ''
      },
      smtp: {
        host: '',
        port: 587,
        secure: false,
        auth: {
          user: '',
          pass: ''
        }
      }
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
