const { createClient } = require('redis');

const redisClient = createClient({
  url: `redis://${process.env.REDIS_HOST || 'localhost'}:${process.env.REDIS_PORT || 6379}`
});

redisClient.on('error', (err) => console.error('Error en Redis:', err));

redisClient.on('connect', () => console.log('Conectado a Redis'));

// Exportamos la instancia para usarla en otros archivos
module.exports = redisClient;