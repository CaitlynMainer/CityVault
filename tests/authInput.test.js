const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const baseDir = path.join(__dirname, '..');

function loadController(name, config) {
  const file = path.join(baseDir, 'controllers', name);
  const module = { exports: {} };
  const mocks = {
    mssql: {},
    crypto: {},
    [baseDir + '/utils/hashUtils']: { gameHashPassword: () => { throw new Error('Unexpected hash'); } },
    '../utils/hashUtils': { gameHashPassword: () => { throw new Error('Unexpected hash'); } },
    [baseDir + '/db']: { getAuthPool: () => { throw new Error('Unexpected database call'); } },
    [baseDir + '/utils/config']: config,
    [baseDir + '/services/mail']: {},
    '../services/mail': {}
  };
  new Function('require', 'module', 'global', fs.readFileSync(file, 'utf8'))(
    name => {
      if (Object.hasOwn(mocks, name)) return mocks[name];
      throw new Error(`Unexpected dependency: ${name}`);
    }, module, { BASE_DIR: baseDir }
  );
  return module.exports;
}

function response() {
  return {
    status(code) { this.code = code; return this; },
    send(body) { this.body = body; return this; },
    render(view) { this.view = view; return this; }
  };
}

test('disabled registration renders an existing view with a 403 status', () => {
  const controller = loadController('registerController.js', { allowRegistration: false });
  const res = response();
  controller.handleRegisterPage({}, res);
  assert.equal(res.code, 403);
  assert.equal(res.view, 'register-disabled');
  assert.ok(fs.existsSync(path.join(baseDir, 'views', `${res.view}.ejs`)));
});

test('login rejects missing or malformed credentials before hashing', async () => {
  const controller = loadController('loginController.js', {});
  for (const body of [undefined, {}, { username: 'user' }, { username: [], password: 'secret' }]) {
    const res = response();
    await controller.handleLogin({ body }, res);
    assert.equal(res.code, 400);
  }
});

test('registration rejects missing or malformed fields before hashing', async () => {
  const controller = loadController('registerController.js', { allowRegistration: true });
  for (const body of [undefined, {}, { username: 'user', password: 'secret' },
    { username: [], password: 'secret', email: 'user@example.com' }]) {
    const res = response();
    await controller.handleRegister({ body }, res);
    assert.equal(res.code, 400);
  }
});
