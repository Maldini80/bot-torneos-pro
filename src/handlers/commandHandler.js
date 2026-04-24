// src/handlers/commandHandler.js
import { EmbedBuilder, PermissionsBitField, MessageFlags, ButtonBuilder, ButtonStyle, ActionRowBuilder } from 'discord.js';
import { getDb, migrateEloFields } from '../../database.js';
import { createGlobalAdminPanel } from '../utils/embeds.js';
import { languageRoles, CHANNELS } from '../../config.js';
import { updateAdminPanel } from '../utils/panelManager.js';
import { generateHtmlImage } from '../utils/twitter.js';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const promocionarWhatsapp = require('../vpg_bot/commands/promocionar-whatsapp.js');

export async function handleCommand(interaction) {
    const { commandName } = interaction;

    if (commandName === 'panel-admin') {
        if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            return interaction.reply({ content: 'No tienes permisos para usar este comando.', flags: [MessageFlags.Ephemeral] });
        }

        if (interaction.channel.id !== CHANNELS.TOURNAMENTS_MANAGEMENT_PARENT) {
            return interaction.reply({ content: `Este comando solo puede usarse en el canal <#${CHANNELS.TOURNAMENTS_MANAGEMENT_PARENT}>.`, flags: [MessageFlags.Ephemeral] });
        }

        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

        const oldPanels = await interaction.channel.messages.fetch({ limit: 50 });
        const messagesToDelete = oldPanels.filter(m => m.author.id === interaction.client.user.id && m.embeds[0]?.title.startsWith('Panel de Creación'));
        if (messagesToDelete.size > 0) {
            try {
                await interaction.channel.bulkDelete(messagesToDelete);
            } catch (e) {
                console.warn("No se pudieron borrar los paneles antiguos, puede que sean demasiado viejos.");
            }
        }

        // Esta es la línea que modificamos para usar 'await'
        const panelContent = await createGlobalAdminPanel();

        await interaction.channel.send(panelContent);
        await interaction.editReply({ content: "✅ Panel de creación global generado con éxito." });
    }

    if (commandName === 'setup-idiomas') {
        if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            return interaction.reply({ content: 'No tienes permisos para usar este comando.', flags: [MessageFlags.Ephemeral] });
        }

        const embed = new EmbedBuilder()
            .setColor('#8b5cf6')
            .setTitle('🌍 Selección de Idioma / Language Selection')
            .setDescription('Reacciona a tu bandera para traducir tus mensajes.\n*React with your flag to have your messages translated.*')
            .setFooter({ text: 'Solo puedes tener un rol de idioma. Cambiar de rol eliminará el anterior.' });

        Object.entries(languageRoles).forEach(([flag, { name }]) => {
            embed.addFields({ name: `${flag} ${name}`, value: ` `, inline: true });
        });

        const sentMessage = await interaction.channel.send({ embeds: [embed] });
        for (const flag in languageRoles) {
            await sentMessage.react(flag);
        }
        await interaction.reply({ content: 'Panel de idiomas creado.', flags: [MessageFlags.Ephemeral] });
    }

    if (commandName === 'probar-subida-real') {
        if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            return interaction.reply({ content: 'Este comando es solo para administradores.', flags: [MessageFlags.Ephemeral] });
        }

        try {
            await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

            const uploadButton = new ButtonBuilder()
                .setLabel('Prueba de altura perks')
                .setURL('https://streamable.com')
                .setStyle(ButtonStyle.Link)
                .setEmoji('📹');

            const row = new ActionRowBuilder().addComponents(uploadButton);

            const thread = await interaction.channel.threads.create({
                name: '🧪-test-subida',
                autoArchiveDuration: 10080, // Cambiado a 1 semana para que no desaparezca
                reason: 'Hilo de prueba para la subida de vídeos.'
            });

            const footerText = '🇪🇸 Para subir una prueba, usa el botón o pega un enlace de YouTube/Twitch.\n' +
                '🇬🇧 To upload proof, use the button or paste a YouTube/Twitch link.';
            const embed = new EmbedBuilder()
                .setColor('#3498db')
                .setTitle('Laboratorio de Pruebas')
                .setDescription("Aquí puedes probar el sistema de subida de vídeos:\n\n1.  **Prueba el Botón:** Haz clic en el botón de abajo.\n2.  **Prueba el Pegado:** Pega un enlace de `Streamable`, `YouTube` o `Twitch` directamente en este chat.")
                .setFooter({ text: footerText });

            await thread.send({
                embeds: [embed],
                components: [row]
            });

            await interaction.editReply(`✅ Hilo de prueba creado: ${thread.toString()}. Ve allí para comenzar el test.`);

        } catch (error) {
            console.error("Error al crear el hilo de prueba:", error);
            await interaction.editReply({ content: '❌ No se pudo crear el hilo de prueba.' });
        }
    }
    if (commandName === 'probar-imagen-twitter') {
        if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            return interaction.reply({ content: 'Este comando es solo para administradores.', flags: [MessageFlags.Ephemeral] });
        }

        // Avisamos a Discord que responderemos más tarde, de forma privada
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

        // Obtenemos el texto que el admin escribió en el comando
        const titulo = interaction.options.getString('titulo');

        // Creamos un HTML de prueba usando las mismas clases CSS que ya existen en twitter.js
        const htmlDePrueba = `
       <div class="container">
         <h1>${titulo.toUpperCase()}</h1>
         <p><span class="label">Esto es una prueba</span> <span class="value">de generación de imagen</span></p>
         <p><span class="label">El fondo es de Imgur</span> <span class="value">Y el estilo es el mismo</span></p>
       </div>`;

        try {
            // Llamamos a la función que genera la imagen
            const resultadoImagen = await generateHtmlImage(htmlDePrueba);

            if (resultadoImagen.success) {
                // Si todo sale bien, mostramos la imagen en un Embed
                const embed = new EmbedBuilder()
                    .setTitle('✅ Imagen de Prueba Generada')
                    .setDescription('Así se vería la imagen con el fondo y los estilos aplicados.')
                    .setImage(resultadoImagen.url)
                    .setColor('#2ecc71')
                    .setFooter({ text: 'Esta respuesta es solo visible para ti.' });

                await interaction.editReply({ embeds: [embed] });
            } else {
                // Si HCTI devuelve un error, lo mostramos
                await interaction.editReply({ content: `❌ Error al generar la imagen: ${resultadoImagen.error}` });
            }
        } catch (error) {
            // Si algo falla de forma crítica, lo registramos y avisamos
            console.error("Error en el comando /probar-imagen-twitter:", error);
            await interaction.editReply({ content: '❌ Ocurrió un error crítico al ejecutar el comando.' });
        }
    }
    if (commandName === 'panel-web') {
        if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            return interaction.reply({ content: '❌ Solo administradores.', flags: [MessageFlags.Ephemeral] });
        }

        const url = `${process.env.BASE_URL}/admin.html`;
        await interaction.reply({
            content: `🔗 **Panel de Administración Web**\nAccede aquí para gestionar drafts en tiempo real:\n${url}`,
            flags: [MessageFlags.Ephemeral]
        });
    }

    if (commandName === 'promocionar-whatsapp') {
        // Ejecutar el módulo exportado (CommonJS) desde nuestro entorno ESM 
        await promocionarWhatsapp.execute(interaction);
        return;
    }

    // ==========================================
    // --- LÓGICA DE /ruleta-forzar ---
    // ==========================================
    if (commandName === 'ruleta-forzar') {
        const ownerId = process.env.OWNER_DISCORD_ID;

        // Doble seguridad: Solo el OWNER puede ver/ejecutar esto
        if (interaction.user.id !== ownerId) {
            if (interaction.isChatInputCommand()) {
                 return interaction.reply({ content: '❌ Comando desconocido o sin permisos.', flags: [MessageFlags.Ephemeral] });
            }
            return;
        }

        const db = getDb();

        // 1. GESTIÓN DE AUTOCOMPLETADO
        if (interaction.isAutocomplete()) {
            const focusedOption = interaction.options.getFocused(true);

            // A) Autocompletar DRAFT
            if (focusedOption.name === 'draft') {
                const drafts = await db.collection('tournaments').find({ 
                    'config.paidSubType': 'draft',
                    status: { $in: ['inscripcion_abierta', 'en_curso'] }
                }).toArray();

                const filtered = drafts.filter(d => d.nombre.toLowerCase().includes(focusedOption.value.toLowerCase()));
                
                await interaction.respond(
                    filtered.slice(0, 25).map(d => ({ name: d.nombre, value: d.shortId }))
                );
            }

            // B) Autocompletar CAPITÁN (dependiendo del draft seleccionado)
            if (focusedOption.name === 'capitan') {
                const draftId = interaction.options.getString('draft');
                if (!draftId) return interaction.respond([]); // Si no ha elegido draft, no podemos dar capitanes

                const tournament = await db.collection('tournaments').findOne({ shortId: draftId });
                if (!tournament || !tournament.teams) {
                    return interaction.respond([]); 
                }

                const candidates = [];
                const checkList = (list) => {
                    if (!list) return;
                    Object.values(list).forEach(team => {
                        candidates.push({
                            id: team.id || team.ownerId || team.userId || team.capitanId,
                            name: team.nombre || team.teamName || team.ownerName || 'Usuario Desconocido',
                            tag: team.capitanTag || team.ownerName || ''
                        });
                    });
                };

                // Extraemos a los candidatos reales que aparecen en la ruleta externa
                checkList(tournament.teams.pendingApproval);
                checkList(tournament.teams.pendingPayments);
                checkList(tournament.teams.pendientes);

                const filtered = candidates.filter(c => 
                    c.name.toLowerCase().includes(focusedOption.value.toLowerCase()) || 
                    c.tag.toLowerCase().includes(focusedOption.value.toLowerCase())
                );

                await interaction.respond(
                    filtered.slice(0, 25).map(c => ({ 
                        name: `${c.name} (${c.tag || 'Candidato'})`, 
                        value: String(c.id)
                    }))
                );
            }
            return;
        }

        // 2. EJECUCIÓN DEL COMANDO
        if (interaction.isChatInputCommand()) {
            const draftId = interaction.options.getString('draft');
            const capitanId = interaction.options.getString('capitan');

            try {
                const tournament = await db.collection('tournaments').findOne({ shortId: draftId });
                if (!tournament) {
                    return interaction.reply({ content: '❌ Draft no encontrado.', flags: [MessageFlags.Ephemeral] });
                }

                const capitanSelect = 
                    tournament.teams?.pendingApproval?.[capitanId] || 
                    tournament.teams?.pendingPayments?.[capitanId] || 
                    tournament.teams?.pendientes?.[capitanId];

                if (!capitanSelect) {
                    return interaction.reply({ content: '❌ Ese capitán no está entre los candidatos pendientes.', flags: [MessageFlags.Ephemeral] });
                }

                // Guardar el forzado temporalmente en la BD (bot_settings)
                await db.collection('bot_settings').updateOne(
                    { _id: 'globalConfig' },
                    { $set: { riggedRoulette: { tournamentShortId: draftId, captainId: capitanId } } },
                    { upsert: true }
                );

                await interaction.reply({ 
                    content: `🤫 **Ruleta Trucada Activada.**\n\nEl equipo **${capitanSelect.nombre}** de <@${capitanId}> ganará el próximo giro de la ruleta web en **${tournament.nombre}**.\n*Nota: Este truco se borrará automáticamente tras el giro.*`, 
                    flags: [MessageFlags.Ephemeral] 
                });

            } catch (error) {
                console.error('[RULETA] Error forzando resultado:', error);
                await interaction.reply({ content: '❌ Hubo un error al forzar la ruleta.', flags: [MessageFlags.Ephemeral] });
            }
        }
    }

    if (commandName === 'migrar-elo') {
        const ownerId = process.env.OWNER_DISCORD_ID;
        if (interaction.user.id !== ownerId) {
            return interaction.reply({ content: '❌ Solo el propietario del bot puede ejecutar este comando.', flags: [MessageFlags.Ephemeral] });
        }

        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
        try {
            const count = await migrateEloFields();
            await interaction.editReply(`✅ Migración completada. Se añadieron campos ELO a **${count}** equipos.`);
        } catch (error) {
            console.error('[COMMAND] Error en migrar-elo:', error);
            await interaction.editReply('❌ Ocurrió un error en la migración. Revisa los logs.');
        }
    }
    if (commandName === 'probar-mejor11') {
        if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            return interaction.reply({ content: 'Este comando es solo para administradores.', flags: [MessageFlags.Ephemeral] });
        }

        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

        try {
            const { generateBest11Image, generateAwardsImage } = await import('../utils/best11ImageGenerator.js');

            // Datos ficticios para la prueba
            const fakeBest11 = {
                gk:   [{ name: 'CASILLAS_PRO', avgRating: 8.2 }],
                defs: [
                    { name: 'SERGIO_RAMOS99', avgRating: 8.5 },
                    { name: 'PUYOL_LEGEND', avgRating: 8.3 },
                    { name: 'MARCELO_FCB', avgRating: 7.9 }
                ],
                meds: [
                    { name: 'XAVI_MASTER', avgRating: 9.1 },
                    { name: 'INIESTA_MAGIC', avgRating: 8.8 },
                    { name: 'BUSQUETS_CDM', avgRating: 8.4 }
                ],
                carrs: [
                    { name: 'JORDI_ALBA10', avgRating: 8.0 },
                    { name: 'DANI_ALVES22', avgRating: 7.7 }
                ],
                dcs: [
                    { name: 'MESSI_GOAT', avgRating: 9.6 },
                    { name: 'VILLA_GUAJE', avgRating: 8.9 }
                ]
            };

            const fakeAwards = {
                mvp: { name: 'XAVI_MASTER', avgRating: 9.1 },
                topScorer: { name: 'MESSI_GOAT', avgRating: 9.6, goals: 12 },
                topAssister: { name: 'INIESTA_MAGIC', avgRating: 8.8, assists: 8 },
                zamora: { name: 'CASILLAS_PRO', avgRating: 8.2, cleanSheets: 4 }
            };

            const best11Img = await generateBest11Image('TORNEO DE PRUEBA - THE BLITZ', fakeBest11);
            const awardsImg = await generateAwardsImage('TORNEO DE PRUEBA - THE BLITZ', fakeAwards);

            await interaction.editReply({
                content: '✅ Imagenes de prueba generadas con datos ficticios:',
                files: [best11Img, awardsImg]
            });
        } catch (error) {
            console.error('[TEST MEJOR11] Error:', error);
            await interaction.editReply({ content: `❌ Error al generar la imagen: ${error.message}` });
        }
    }
}

