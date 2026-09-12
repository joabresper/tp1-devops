const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const { hostname } = require('node:os');
const app = require('../app');
const redisClient = require('../db/redis');

let server;
let baseUrl;

before(async () => {
  server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  baseUrl = `http://127.0.0.1:${server.address().port}/api`;
});

after(() => new Promise((resolve, reject) => {
  server.close((error) => error ? reject(error) : resolve());
  server.closeAllConnections();
}));

beforeEach((t) => {
  // Doble de Redis: estas pruebas aíslan la API y no requieren un servidor externo.
  const tasks = new Map();
  t.mock.method(redisClient, 'ping', async () => 'PONG');
  t.mock.method(redisClient, 'hVals', async () => [...tasks.values()]);
  t.mock.method(redisClient, 'hGet', async (key, id) => tasks.get(id) ?? null);
  t.mock.method(redisClient, 'hSet', async (key, id, value) => {
    tasks.set(id, value);
    return 1;
  });
  t.mock.method(redisClient, 'hDel', async (key, id) => Number(tasks.delete(id)));
  t.mock.method(redisClient, 'eval', async (script, options) => {
    const [id, value] = options.arguments;
    if (!tasks.has(id)) return 0;
    tasks.set(id, value);
    return 1;
  });
});

async function request(path, method = 'GET', body) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  assert.equal(response.headers.get('x-api-instance'), hostname());
  return response;
}

test('CRUD: crea, lista, consulta, edita, completa y elimina una tarea', async () => {
  assert.deepEqual(await (await request('/tareas')).json(), []);
  const created = await request('/tareas', 'POST', { title: '  Estudiar DevOps  ' });
  assert.equal(created.status, 201);
  const task = await created.json();
  assert.match(task.id, /^[0-9a-f-]{36}$/);
  assert.equal(task.title, 'Estudiar DevOps');
  assert.equal(task.completed, false);
  assert.equal(created.headers.get('location'), `/api/tareas/${task.id}`);
  assert.deepEqual(await (await request('/tareas')).json(), [task]);
  assert.deepEqual(await (await request(`/tareas/${task.id}`)).json(), task);

  const changed = await request(`/tareas/${task.id}`, 'PUT', { title: 'Entregar TP', completed: true });
  assert.equal(changed.status, 200);
  assert.deepEqual(await changed.json(), { id: task.id, title: 'Entregar TP', completed: true });
  assert.equal((await (await request(`/tareas/${task.id}`)).json()).completed, true);

  assert.equal((await request(`/tareas/${task.id}`, 'DELETE')).status, 204);
  assert.equal((await request(`/tareas/${task.id}`)).status, 404);
  assert.equal((await request(`/tareas/${task.id}`, 'PUT', { title: 'No revivir' })).status, 404);
  assert.equal((await request(`/tareas/${task.id}`, 'DELETE')).status, 404);
  assert.deepEqual(await (await request('/tareas')).json(), []);
});

test('rechaza títulos inválidos y estados que no sean booleanos sin escribir en Redis', async () => {
  for (const body of [undefined, null, [], {}, { title: '   ' }, { title: 5 },
    { title: 'a'.repeat(201) }, { title: 'Válida', completed: 'true' },
    { title: 'Válida', completed: null }]) {
    for (const [path, method] of [['/tareas', 'POST'], ['/tareas/id', 'PUT']]) {
      assert.equal((await request(path, method, body)).status, 400);
    }
  }
  assert.equal(redisClient.hSet.mock.callCount(), 0);
  assert.equal(redisClient.eval.mock.callCount(), 0);
  assert.equal((await request('/tareas', 'POST', { title: 'a'.repeat(200) })).status, 201);
});

test('rechaza JSON mal formado y cuerpos demasiado grandes', async () => {
  const malformed = await fetch(`${baseUrl}/tareas`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{',
  });
  assert.equal(malformed.status, 400);
  assert.equal(malformed.headers.get('x-api-instance'), hostname());
  assert.match((await malformed.json()).error, /JSON/);
  assert.equal((await request('/tareas', 'POST', { title: 'a'.repeat(11000) })).status, 413);
  assert.equal(redisClient.hSet.mock.callCount(), 0);
});

test('dos tareas conservan identidades y estados independientes', async () => {
  const first = await (await request('/tareas', 'POST', { title: 'Zeta' })).json();
  const second = await (await request('/tareas', 'POST', { title: 'Alfa' })).json();
  assert.notEqual(first.id, second.id);
  await request(`/tareas/${first.id}`, 'PUT', { title: 'Zeta', completed: true });
  const tasks = await (await request('/tareas')).json();
  assert.deepEqual(tasks, [second, { ...first, completed: true }]);
});

test('un fallo de Redis devuelve 503 sin fingir una escritura exitosa ni filtrar detalles', async (t) => {
  t.mock.method(console, 'error', () => {});
  for (const method of ['hVals', 'hGet', 'hSet', 'eval', 'hDel']) {
    t.mock.method(redisClient, method, async () => { throw new Error('detalle privado'); });
  }
  for (const [path, method, body] of [
    ['/tareas', 'GET'], ['/tareas/id', 'GET'], ['/tareas', 'POST', { title: 'Tarea' }],
    ['/tareas/id', 'PUT', { title: 'Tarea' }], ['/tareas/id', 'DELETE'],
  ]) {
    const response = await request(path, method, body);
    assert.equal(response.status, 503);
    const result = await response.json();
    assert.ok(result.error);
    assert.doesNotMatch(result.error, /detalle privado/);
  }
});

test('una ruta inexistente devuelve 404 en JSON', async () => {
  const response = await request('/inexistente');
  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { error: 'Ruta no encontrada.' });
});

test('health comprueba Redis e instance identifica esta API sin depender de Redis', async (t) => {
  const healthy = await request('/health');
  assert.equal(healthy.status, 200);
  assert.deepEqual(await healthy.json(), { status: 'OK', redis: 'OK' });
  assert.equal(redisClient.ping.mock.callCount(), 1);

  t.mock.method(console, 'error', () => {});
  t.mock.method(redisClient, 'ping', async () => { throw new Error('Redis no disponible'); });
  assert.equal((await request('/health')).status, 503);
  const instance = await request('/instance');
  assert.equal(instance.status, 200);
  assert.equal(instance.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await instance.json(), { service: 'api', instance: hostname() });
});
