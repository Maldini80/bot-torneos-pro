import { MongoClient } from 'mongodb';
import 'dotenv/config';

async function run() {
    const client = new MongoClient(process.env.DATABASE_URL);
    try {
        await client.connect();
        const db = client.db('tournamentBotDb');
        
        console.log('=== APLICANDO COMPENSACIÓN A TEAM NITRO ===\n');
        
        // 1. Obtener el estado actual del equipo
        const team = await db.collection('fantasy_teams').findOne({
            teamName: { $regex: /nitro/i }
        });
        
        if (!team) {
            console.log('❌ Error: No se encontró el equipo Team NiTrO.');
            return;
        }
        
        console.log(`Estado ANTES de la compensación:`);
        console.log(`- Puntos: ${team.points}`);
        console.log(`- Balance: ${team.balance.toLocaleString('es-ES')} €`);
        
        // 2. Definir los valores de compensación
        const pointsToAdd = 83.3; // 35.9 (ravenn8) + 47.4 (Juanlukaku) + 0 (eurex)
        const moneyToAdd = pointsToAdd * 80000; // 6.664.000 €
        
        // 3. Actualizar el equipo en la base de datos
        const updateResult = await db.collection('fantasy_teams').updateOne(
            { _id: team._id },
            { 
                $inc: { 
                    points: pointsToAdd,
                    balance: moneyToAdd
                } 
            }
        );
        
        if (updateResult.modifiedCount > 0) {
            console.log(`\n✅ Equipo actualizado correctamente.`);
            const updatedTeam = await db.collection('fantasy_teams').findOne({ _id: team._id });
            console.log(`Estado DESPUÉS de la compensación:`);
            console.log(`- Puntos: ${updatedTeam.points} (añadidos +${pointsToAdd})`);
            console.log(`- Balance: ${updatedTeam.balance.toLocaleString('es-ES')} € (añadidos +${moneyToAdd.toLocaleString('es-ES')} €)`);
            
            // 4. Registrar la noticia explicativa en el feed de la liga JAM
            try {
                const newsMsg = `🔧 **CORRECCIÓN JORNADA**: Se añaden **+${pointsToAdd} pts** y **+${moneyToAdd.toLocaleString('es-ES')} €** al equipo **Team NiTrO** correspondientes a los puntos de titular de **ravenn8** (+35.9 pts) y **Juanlukaku** (+47.4 pts) que no sumaron por un error de sincronización de transferencias.`;
                await db.collection('fantasy_news').insertOne({
                    leagueId: team.leagueId.toString(),
                    type: 'correction',
                    message: newsMsg,
                    createdAt: new Date()
                });
                console.log(`\n✅ Noticia de la corrección registrada en el feed de la liga.`);
            } catch (errNews) {
                console.error('Error al registrar la noticia en el feed:', errNews.message);
            }
        } else {
            console.log('❌ Error: No se modificó el documento del equipo.');
        }
        
    } catch (e) {
        console.error(e);
    } finally {
        await client.close();
    }
}
run();
