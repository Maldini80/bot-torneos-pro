import { connectDb, getDb } from '../database.js';
import 'dotenv/config';
import dns from 'dns';
dns.setServers(['8.8.8.8', '8.8.4.4']);

async function run() {
    await connectDb();
    const db = getDb();
    
    const playerNameExact = "xpetruu";
    const vpgPoints = 155.8;
    const errorCashAmount = vpgPoints * 80000; // 12,464,000 €
    
    const leagues = await db.collection('fantasy_leagues').find({
        pointsMode: 'zero',
        status: { $ne: 'closed' }
    }).toArray();
    
    console.log("=== INICIANDO MIGRACIÓN DE XPETRUU ===");
    
    // 1. Corregir basePoints en todas las ligas zero donde está en 0
    let leaguesUpdated = 0;
    for (const l of leagues) {
        const basePointsMap = l.basePoints || {};
        const foundKey = Object.keys(basePointsMap).find(k => k.toLowerCase() === playerNameExact.toLowerCase());
        const baseVal = foundKey ? basePointsMap[foundKey] : undefined;
        
        if (baseVal === 0 || baseVal === undefined) {
            const keyToSet = foundKey || playerNameExact;
            await db.collection('fantasy_leagues').updateOne(
                { _id: l._id },
                { $set: { [`basePoints.${keyToSet}`]: vpgPoints } }
            );
            console.log(`- Liga "${l.name}": basePoints de ${keyToSet} establecido de ${baseVal} a ${vpgPoints}`);
            leaguesUpdated++;
        }
    }
    console.log(`Total de ligas corregidas: ${leaguesUpdated}`);
    
    // 2. Corregir puntos y balance de los equipos afectados
    const affectedTeams = [
        { name: "TEST", league: "STAFF BLITZ" },
        { name: "Comunistas FC", league: "Ceuta Guardians" },
        { name: "Soy el numero 1", league: "Cadiz CFeSports" },
        { name: "Real Fachadolid", league: "Cryzen gaming" },
        { name: "Pist(N)acho", league: "Js Elcano" }
    ];
    
    console.log("\n=== CORRIGIENDO EQUIPOS AFECTADOS ===");
    for (const target of affectedTeams) {
        const leagueDoc = await db.collection('fantasy_leagues').findOne({ name: target.league });
        if (!leagueDoc) {
            console.log(`No se encontró la liga: ${target.league}`);
            continue;
        }
        
        const teamDoc = await db.collection('fantasy_teams').findOne({
            leagueId: leagueDoc._id.toString(),
            teamName: target.name
        });
        
        if (teamDoc) {
            const oldPoints = teamDoc.points;
            const oldBalance = teamDoc.balance;
            const newPoints = Math.max(0, Math.round((oldPoints - vpgPoints) * 10) / 10);
            const newBalance = oldBalance - errorCashAmount;
            
            await db.collection('fantasy_teams').updateOne(
                { _id: teamDoc._id },
                { 
                    $set: { 
                        points: newPoints,
                        balance: newBalance
                    } 
                }
            );
            console.log(`- Equipo "${teamDoc.teamName}" (Liga: ${target.league}):`);
            console.log(`  * Puntos: ${oldPoints} -> ${newPoints} (-${vpgPoints})`);
            console.log(`  * Saldo: ${oldBalance.toLocaleString('es-ES')} € -> ${newBalance.toLocaleString('es-ES')} € (-${errorCashAmount.toLocaleString('es-ES')} €)`);
        } else {
            console.log(`No se encontró el equipo: ${target.name} en la liga ${target.league}`);
        }
    }
    
    console.log("\n=== MIGRACIÓN FINALIZADA CON ÉXITO ===");
    process.exit(0);
}

run();
