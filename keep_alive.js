// keep_alive.js
import express from 'express';

const server = express();
server.all('/', (req, res) => {
  res.send('El servidor del bot está activo y funcionando.');
});
export function keepAlive() {
  const port = process.env.PORT || 3000;
  server.listen(port, () => {
    console.log(`✅ [SERVIDOR WEB] Escuchando en el puerto ${port}.`);
  });
}
