const request = require('supertest');
const express = require('express');
const todoRoutes = require('../routes/todos');

// Mockear el cliente de Redis
jest.mock('../db/redis', () => ({
  get: jest.fn(),
  set: jest.fn(),
  connect: jest.fn(),
  on: jest.fn()
}));

const redisClient = require('../db/redis');

const app = express();
app.use(express.json());
app.use('/api/todos', todoRoutes);

describe('API de ToDos', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('GET /api/todos debería retornar una lista vacía si no hay tareas', async () => {
    redisClient.get.mockResolvedValue(null);

    const response = await request(app).get('/api/todos');
    
    expect(response.status).toBe(200);
    expect(response.body).toEqual([]);
    expect(redisClient.get).toHaveBeenCalledWith('todos_list');
  });

  it('POST /api/todos debería crear una nueva tarea', async () => {
    redisClient.get.mockResolvedValue(JSON.stringify([])); // Inicia vacio
    redisClient.set.mockResolvedValue('OK'); // Simula guardado exitoso

    const response = await request(app)
      .post('/api/todos')
      .send({ title: 'Nueva Tarea de Prueba' });

    expect(response.status).toBe(201);
    expect(response.body.title).toBe('Nueva Tarea de Prueba');
    expect(response.body.completed).toBe(false);
    expect(response.body).toHaveProperty('id');
    
    expect(redisClient.set).toHaveBeenCalled();
  });
});
