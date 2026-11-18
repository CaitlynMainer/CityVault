const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const baseDir = path.join(__dirname, '..');

function loadModule(file, mocks) {
  const module = { exports: {} };
  const code = fs.readFileSync(path.join(baseDir, file), 'utf8');
  const load = (name) => {
    if (Object.hasOwn(mocks, name)) return mocks[name];
    throw new Error(`Unexpected dependency: ${name}`);
  };
  new Function('require', 'module', 'global', '__dirname', code)(
    load, module, { BASE_DIR: baseDir }, path.dirname(path.join(baseDir, file))
  );
  return module.exports;
}

function response() {
  return {
    status(code) { this.code = code; return this; },
    send(body) { this.body = body; return this; }
  };
}

test('access-level changes reject non-admins before database access', async () => {
  let called = false;
  const controller = loadModule('controllers/admin/accessLevelController.js', {
    [baseDir + '/db']: { getGamePool: () => { called = true; } },
    [baseDir + '/utils/roles']: { isAdmin: role => role === 'admin' },
    mssql: {}
  });
  for (const user of [undefined, { role: 'user' }, { role: 'gm' }]) {
    const res = response();
    await controller.updateAccessLevel({ user }, res);
    assert.equal(res.code, 403);
  }
  assert.equal(called, false);
});

test('petition mutations reject non-GMs before database access', async () => {
  let called = false;
  const controller = loadModule('controllers/admin/petitionsController.js', {
    mssql: {},
    [baseDir + '/utils/config']: {},
    [baseDir + '/db']: { getGamePool: () => { called = true; } },
    [baseDir + '/utils/textSanitizer']: {},
    [baseDir + '/utils/mapNameLookup']: {},
    [baseDir + '/services/mail/template']: {},
    [baseDir + '/services/mail']: {},
    [baseDir + '/utils/roles']: { isGM: role => role === 'gm' || role === 'admin' }
  });
  for (const handler of ['markFetched', 'markDone', 'toggleStatus']) {
    for (const user of [undefined, { role: 'user' }]) {
      const res = response();
      await controller[handler]({ user }, res);
      assert.equal(res.code, 403);
    }
  }
  assert.equal(called, false);
});

test('character import ignores a forged viewerUsername without a session', async () => {
  let called = false;
  const controller = loadModule('controllers/api/characterImportController.js', {
    multer: {},
    'adm-zip': function () {},
    mssql: {},
    [baseDir + '/db']: { getAuthPool: () => { called = true; } },
    'fs-extra': {},
    path
  });
  const res = response();
  await controller.importCharacter({ params: { serverKey: 'test' }, body: { viewerUsername: 'admin' } }, res);
  assert.equal(res.code, 401);
  assert.equal(called, false);
});

test('admin router checks role before mounting any child routes', () => {
  const mounted = [];
  const guard = () => {};
  loadModule('routes/admin/index.js', {
    express: { Router: () => ({ use: (...args) => mounted.push(args) }) },
    [baseDir + '/middleware/requireAdmin']: guard,
    ...Object.fromEntries([
      'dashboard', 'manifest', 'users', 'updateAccessLevel', 'news', 'style',
      'blacklist', 'config', 'update', 'templates', 'servers', 'petitions', 'characterImport'
    ].map(name => [`./${name}`, {}]))
  });
  assert.equal(mounted[0][0], guard);
});

test('role update commits only after its audit note is written', async () => {
  const events = [];
  const pool = {
    request: () => ({
      input() { return this; },
      async query() { return { recordset: [{ account: 'target', role: 'user' }] }; }
    })
  };
  class Transaction {
    async begin() { events.push('begin'); }
    async commit() { events.push('commit'); }
    async rollback() { events.push('rollback'); }
  }
  class Request {
    input() { return this; }
    async query(query) {
      events.push(query.includes('INSERT INTO') ? 'note' : 'role');
    }
  }
  const controller = loadModule('controllers/admin/userController.js', {
    mssql: { Transaction, Request, Int: {}, VarChar: {}, Text: {} },
    [baseDir + '/db']: { getAuthPool: async () => pool },
    [baseDir + '/services/mail']: {},
    [baseDir + '/services/mail/template']: {},
    [baseDir + '/utils/roles']: { isGM: role => role === 'gm' || role === 'admin' },
    [baseDir + '/data/config.json']: {}
  });
  const res = { redirect(url) { this.url = url; } };
  await controller.updateUserRole({
    user: { role: 'admin' }, session: { username: 'actor' }, params: { uid: '2' },
    body: { newRole: 'gm', page: 1, search: '', limit: 10 }
  }, res);
  assert.deepEqual(events, ['begin', 'role', 'note', 'commit']);
  assert.match(res.url, /^\/admin\/users/);
});
