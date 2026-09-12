const redisClient = require('../db/redis');
const { v4: uuidv4 } = require('uuid');

const REDIS_KEY = 'todos_list';

// Helper functions for Redis list parsing
const getTodos = async () => {
  const data = await redisClient.get(REDIS_KEY);
  return data ? JSON.parse(data) : [];
};

const saveTodos = async (todos) => {
  await redisClient.set(REDIS_KEY, JSON.stringify(todos));
};

exports.getAll = async (req, res) => {
  try {
    const todos = await getTodos();
    res.json(todos);
  } catch (error) {
    console.error('Error al obtener tareas:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
};

exports.create = async (req, res) => {
  try {
    const { title } = req.body;
    if (!title) return res.status(400).json({ error: 'El título es requerido' });

    const todos = await getTodos();
    const newTodo = {
      id: uuidv4(),
      title,
      completed: false,
      createdAt: new Date().toISOString()
    };

    todos.push(newTodo);
    await saveTodos(todos);

    res.status(201).json(newTodo);
  } catch (error) {
    console.error('Error al crear tarea:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
};

exports.toggleComplete = async (req, res) => {
  try {
    const { id } = req.params;
    const todos = await getTodos();
    const todoIndex = todos.findIndex(t => t.id === id);

    if (todoIndex === -1) {
      return res.status(404).json({ error: 'Tarea no encontrada' });
    }

    todos[todoIndex].completed = !todos[todoIndex].completed;
    await saveTodos(todos);

    res.json(todos[todoIndex]);
  } catch (error) {
    console.error('Error al actualizar tarea:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
};

exports.remove = async (req, res) => {
  try {
    const { id } = req.params;
    let todos = await getTodos();
    
    const initialLength = todos.length;
    todos = todos.filter(t => t.id !== id);

    if (todos.length === initialLength) {
      return res.status(404).json({ error: 'Tarea no encontrada' });
    }

    await saveTodos(todos);
    res.json({ message: 'Tarea eliminada' });
  } catch (error) {
    console.error('Error al eliminar tarea:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
};
