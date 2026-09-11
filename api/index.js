const app = require('./app');
const redisClient = require('./db/redis');

const port = process.env.PORT || 3000;

async function iniciar() {
  await redisClient.connect();
  console.log('Conectado a Redis exitosamente');
  
  app.listen(port, () => {
    console.log(`API escuchando en puerto ${port}`);
  });
}

iniciar().catch((error) => {
  console.error('No se pudo iniciar la API:', error.message);
  if (redisClient.isOpen) redisClient.destroy();
  process.exitCode = 1;
});
