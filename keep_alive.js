const express = require('express');
const server = express();

console.log('[SERVIDOR WEB] Módulo keep_alive.js cargado.');

server.all('/', (req, res) => {
  res.send('El servidor del bot está activo y funcionando.');
});

function keepAlive() {
  const port = process.env.PORT || 3000;
  server.listen(port, () => {
    console.log(`✅ [SERVIDOR WEB] Escuchando en el puerto ${port}. Render ya puede verme.`);
  });
}

module.exports = keepAlive;
