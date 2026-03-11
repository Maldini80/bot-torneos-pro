// src/vpg_bot/commands/promocionar-whatsapp.js
const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, MessageFlags } = require('discord.js');

const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

module.exports = {
    data: new SlashCommandBuilder()
        .setName('promocionar-whatsapp')
        .setDescription('Envía un Dm masivo a TODOS los miembros del servidor con un anuncio y link de WhatsApp.')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addStringOption(option =>
            option.setName('titulo')
                .setDescription('Título principal del mensaje')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('texto')
                .setDescription('El texto explicativo o llamada a la acción')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('enlace_whatsapp')
                .setDescription('El link de invitación al grupo (ej: https://chat.whatsapp.com/...)')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('url_imagen_imgur')
                .setDescription('Opcional: URL directa de la imagen en Imgur (ej: https://i.imgur.com/foto.png)')
                .setRequired(false)),

    async execute(interaction) {
        // 🚨 MUY IMPORTANTE: Responder INMEDIATAMENTE a Discord para tener 15 minutos de tiempo de vida.
        // Si no se hace esto antes del fetch, el comando caduca en 3 segundos y da "La aplicacion no responde"
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const titulo = interaction.options.getString('titulo');
        const texto = interaction.options.getString('texto');
        const enlaceWP = interaction.options.getString('enlace_whatsapp');
        const imagenUrl = interaction.options.getString('url_imagen_imgur');

        try {
            // 1. Ahora sí, con el token asegurado, obtenemos la lista completa sin prisa
            await interaction.editReply({ content: '⏳ Recopilando lista de miembros del servidor... Esto puede tardar unos segundos dependiendo del tamaño.' });
            const members = await interaction.guild.members.fetch();
            
            // 2. Filtrar para descartar bots
            const humanMembers = members.filter(member => !member.user.bot);

            if (humanMembers.size === 0) {
                return interaction.editReply({ content: '❌ No se encontraron usuarios humanos válidos en el servidor.' });
            }

            // Enviar mensaje al usuario avisando de la transición a DM
            await interaction.editReply({ content: `✅ ¡Proceso de envío masivo iniciado! Encontrados **${humanMembers.size}** miembros (excluidos bots).\n\n⚠️ Dado que el proceso tomará más de 15 minutos, **te enviaré las actualizaciones de progreso por Mensaje Directo (DM)** cada 50 envíos para evitar desconexiones.` });

            // 3. Crear el mensaje (Embed + Botón)
            const promoEmbed = new EmbedBuilder()
                .setTitle(titulo)
                .setDescription(texto)
                .setColor('#25D366') // Color verde tipo WhatsApp
                .setFooter({ text: `Mensaje oficial de ${interaction.guild.name}` });

            if (imagenUrl) {
                promoEmbed.setImage(imagenUrl);
            }

            const actionRow = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setLabel('Unirse al Grupo de WhatsApp')
                        .setStyle(ButtonStyle.Link)
                        .setURL(enlaceWP)
                        .setEmoji('📱') // Emoji de móvil/WhatsApp
                );

            // 4. Bucle responsable de envíos (1 por segundo)
            let notifiedCount = 0;
            let failedCount = 0;
            let processedCount = 0;
            const totalMembers = humanMembers.size;

            for (const [memberId, member] of humanMembers) {
                processedCount++;
                try {
                    await member.send({ embeds: [promoEmbed], components: [actionRow] });
                    notifiedCount++;
                } catch (error) {
                    // Ignoramos silenciosamente si tienen los DMs cerrados
                    failedCount++;
                }

                // Avisar del progreso cada 50 usuarios procesados POR DM AL ADMIN
                if (processedCount % 50 === 0 && processedCount < totalMembers) {
                    try {
                        await interaction.user.send(`⏳ **[Progreso Comando Promocional]** ${processedCount} / ${totalMembers} revisados... (Entregados: ${notifiedCount} | DMs Cerrados: ${failedCount})`);
                    } catch (dmError) {
                         // Ignorar si el admin tiene DMs cerrados... irónico.
                    }
                }

                // PAUSA CRÍTICA: 1 segundo de seguridad para evitar Rate Limits de Discord
                await wait(1000);
            }

            // 5. Reporte Final
            let finalMessage = `✅ **¡Promoción Masiva Finalizada!**\n\n` +
                               `📊 **Reporte de entrega:**\n` +
                               `👥 Miembros en el servidor: ${totalMembers}\n` +
                               `📬 Mensajes entregados con éxito: **${notifiedCount}**\n` +
                               `❌ DMs cerrados (no se pudo enviar): **${failedCount}**\n\n` +
                               `*El anuncio ha terminado de circular por todo el servidor.*`;

            try {
                await interaction.user.send(finalMessage);
            } catch (dmFinalError) {
                console.log('[VPG] Promoción finalizada pero no se pudo DM al admin el reporte final.');
            }

        } catch (error) {
            console.error('Error en /promocionar-whatsapp:', error);
            try {
                // Al capturar un error general (NO de caducidad webhooks), avisar al admin por DM si es posible.
                await interaction.user.send(`❌ Ocurrió un error grave al procesar el envío masivo: ${error.message}`);
            } catch(e) {}
        }
    },
};
