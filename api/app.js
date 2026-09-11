const express = require('express');
const { randomUUID } = require('node:crypto');
const redisClient = require('./db/redis');

const app = express();
const TASKS_KEY = 'tareas';

app.use(express.json({ limit: '10kb' }));
app.use('/api', (req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'OK' });
});

function validateTask(req, res, next) {
  const title = typeof req.body?.title === 'string' ? req.body.title.trim() : '';
  if (!title || title.length > 200 ||
      (req.body.completed !== undefined && typeof req.body.completed !== 'boolean')) {
    return res.status(400).json({ error: 'El título debe tener entre 1 y 200 caracteres y completed debe ser booleano.' });
  }
  req.taskData = { title, completed: req.body.completed ?? false };
  next();
}

app.get('/api/tareas', async (req, res) => {
  // ponytail: lista completa para el TP; paginar si crece el volumen de tareas.
  const tasks = (await redisClient.hVals(TASKS_KEY)).map((value) => JSON.parse(value));
  res.json(tasks.sort((a, b) => a.title.localeCompare(b.title, 'es')));
});

app.get('/api/tareas/:id', async (req, res) => {
  const value = await redisClient.hGet(TASKS_KEY, req.params.id);
  if (!value) return res.status(404).json({ error: 'Tarea no encontrada.' });
  res.json(JSON.parse(value));
});

app.post('/api/tareas', validateTask, async (req, res) => {
  const task = { id: randomUUID(), ...req.taskData };
  await redisClient.hSet(TASKS_KEY, task.id, JSON.stringify(task));
  res.status(201).location(`/api/tareas/${task.id}`).json(task);
});

app.put('/api/tareas/:id', validateTask, async (req, res) => {
  const task = { id: req.params.id, ...req.taskData };
  // Redis ejecuta ambas operaciones juntas: un PUT no puede revivir una tarea eliminada.
  const updated = await redisClient.eval(`
    if redis.call('HEXISTS', KEYS[1], ARGV[1]) == 0 then return 0 end
    redis.call('HSET', KEYS[1], ARGV[1], ARGV[2])
    return 1
  `, { keys: [TASKS_KEY], arguments: [task.id, JSON.stringify(task)] });
  if (!updated) return res.status(404).json({ error: 'Tarea no encontrada.' });
  res.json(task);
});

app.delete('/api/tareas/:id', async (req, res) => {
  const deleted = await redisClient.hDel(TASKS_KEY, req.params.id);
  if (!deleted) return res.status(404).json({ error: 'Tarea no encontrada.' });
  res.sendStatus(204);
});

app.use('/api', (req, res) => res.status(404).json({ error: 'Ruta no encontrada.' }));

app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  if (error.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'El cuerpo debe ser JSON válido.' });
  }
  if (error.type === 'entity.too.large') {
    return res.status(413).json({ error: 'El cuerpo de la petición es demasiado grande.' });
  }
  console.error('Error al atender la petición:', error.message);
  res.status(503).json({ error: 'El servicio no está disponible. Intentá nuevamente.' });
});

module.exports = app;
