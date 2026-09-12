const express = require('express');
const redisClient = require('./db/redis');

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());

// Endpoint general de estado (Health Check)
app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'OK' });
});

// Otros enrutadores
app.use('/api/todos', require('./routes/todos'));

async function iniciar() {
  await redisClient.connect();
  console.log('Conectado a Redis exitosamente');
  
  app.listen(port, () => {
    console.log(`API escuchando en puerto ${port}`);
  });
}

iniciar();