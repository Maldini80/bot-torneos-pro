# Informe Técnico: Problemas Pendientes en Sistema de Stats (EA Sports)

Este informe resume los fallos detectados tras la implementación de la Fase 1 de estadísticas avanzadas. El código se ha revertido al commit `987f2fb` para su revisión.

## 1. Registro de Comandos Slash
* **Archivo:** `deploy-commands.js`
* **Problema:** El comando `/panel-estadisticas` no está incluido en el array de comandos manuales.
* **Solución:** Añadir el `SlashCommandBuilder` para `panel-estadisticas` y ejecutar el deploy.

## 2. Error de Interacción (Timeout)
* **Archivo:** `src/vpg_bot/commands/panel-estadisticas.js`
* **Problema:** El comando usa `interaction.deferReply()` pero luego envía el panel mediante `interaction.channel.send()`. Esto deja la interacción "colgada" y Discord muestra "La aplicación no ha respondido".
* **Solución:** Usar `interaction.reply()` directamente para enviar el panel como respuesta a la interacción.

## 3. Mapeo de Posiciones (Eficacia del Scout)
* **Archivos:** `src/utils/eaStatsCrawler.js` y `src/vpg_bot/handlers/modalHandler.js`
* **Problema:** El mapa `POS_MAP` solo contiene claves numéricas (0-14). La API de EA está devolviendo strings (ej: `"defender"`, `"midfielder"`, `"goalkeeper"`). 
* **Impacto:** 
    * El Crawler guarda "???" o el string directamente sin normalizar.
    * El Scout de jugador no detecta la sección de portero porque espera el código `POR`.
* **Solución:** Actualizar los mapas para incluir las claves de texto enviadas por EA.

## 4. Botón de Scouting en Panel de Gestión
* **Archivo:** `src/vpg_bot/handlers/buttonHandler.js` (ID: `admin_ea_heights_`)
* **Problema:** El botón antiguo de scouting/alturas no es compatible con el nuevo formato de datos capturados por el crawler y falla al intentar mapear posiciones.

---
*Generado por Antigravity para revisión técnica.*
