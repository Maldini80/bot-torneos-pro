import { getDb } from './database.js';

export async function recalculateStats() {
    const db = getDb();
    
    // Buscar todos los torneos con estructura (incluyendo finalizados, excepto cancelados/abiertos) 
    const tournaments = await db.collection('tournaments').find({
        status: { $nin: ['cancelado', 'inscripcion_abierta'] },
        'structure.calendario': { $exists: true }
    }).toArray();

    console.log(`Encontrados ${tournaments.length} torneos a revisar (activos y finalizados).`);

    for (const t of tournaments) {
        if (!t.structure || !t.structure.grupos) continue;

        console.log(`🔄 Reparando torneo: ${t.nombre} (${t.shortId})`);
        let hasChanges = false;
        
        // 1. Resetear todas las stats
        const newGrupos = JSON.parse(JSON.stringify(t.structure.grupos));
        for (const groupName in newGrupos) {
            newGrupos[groupName].equipos.forEach(eq => {
                eq.stats = { pj: 0, pg: 0, pe: 0, pp: 0, gf: 0, gc: 0, dg: 0, pts: 0 };
            });
        }

        // 2. Hacer un mapeo de equipoA de calendario a id correcto en grupos
        // En caso de que se cambió el manager y el 'id' en equipos ya no coincida, 
        // vamos a forzar la corrección basándonos en el capitanId u otros parámetros? No,
        // Wait, the id in equipos might STILL be old if replaceTournamentManager didn't fix it before!
        // We must sync 'id' and 'capitanId' in newGrupos from `t.teams.aprobados` !
        for (const groupName in newGrupos) {
            newGrupos[groupName].equipos.forEach(eq => {
                // Si el id de eq no está en aprobados, busquemos qué capitán se supone que tiene
                // Pero el old ID desapareció de aprobados.
                // Buscamos en aprobados qué equipo tiene el mismo nombre o eafcTeamName?
                // Mejor aún, buscamos en teams.aprobados. 
                // Cada equipo en aprobados tiene un `id` y un `capitanId`.
                let matchingTeam = Object.values(t.teams.aprobados || {}).find(a => 
                    a.nombre === eq.nombre || a.id === eq.id || a.capitanId === eq.capitanId 
                );
                
                if (matchingTeam) {
                    if (eq.id !== matchingTeam.id || eq.capitanId !== matchingTeam.capitanId) {
                        console.log(`  🔧 Corrigiendo ID desincronizado de ${eq.nombre}: ${eq.id} -> ${matchingTeam.id}`);
                        eq.id = matchingTeam.id;
                        eq.capitanId = matchingTeam.capitanId;
                        eq.capitanTag = matchingTeam.capitanTag;
                        hasChanges = true;
                    }
                }
            });
        }

        // 3. Recalcular stats repasando el calendario
        if (t.structure.calendario) {
            for (const groupName in t.structure.calendario) {
                const matches = t.structure.calendario[groupName];
                if (!matches) continue;
                
                matches.forEach(match => {
                    if (match.status === 'finalizado' && match.resultado && match.equipoB?.id !== 'ghost') {
                        const [golesA, golesB] = match.resultado.split('-').map(Number);
                        
                        const eqA = newGrupos[groupName].equipos.find(e => e.id === match.equipoA.id || e.nombre === match.equipoA.nombre);
                        const eqB = newGrupos[groupName].equipos.find(e => e.id === match.equipoB.id || e.nombre === match.equipoB.nombre);
                        
                        // Si eqA y eqB se encontraron por nombre pero match tenía un ID viejo, actualizamos match id!
                        if (eqA && match.equipoA.id !== eqA.id) {
                            console.log(`  🔧 Corrigiendo Match ${match.matchId} eqA.id: ${match.equipoA.id} -> ${eqA.id}`);
                            match.equipoA.id = eqA.id;
                            match.equipoA.capitanId = eqA.capitanId;
                            hasChanges = true;
                        }
                        if (eqB && match.equipoB.id !== eqB.id) {
                            console.log(`  🔧 Corrigiendo Match ${match.matchId} eqB.id: ${match.equipoB.id} -> ${eqB.id}`);
                            match.equipoB.id = eqB.id;
                            match.equipoB.capitanId = eqB.capitanId;
                            hasChanges = true;
                        }

                        if (!eqA || !eqB) {
                            console.log(`  ⚠️ Partido omitido en recálculo (${match.matchId}), equipo no encontrado.`);
                            return;
                        }

                        // Sumar stats
                        eqA.stats.pj += 1;
                        eqB.stats.pj += 1;
                        eqA.stats.gf += golesA;
                        eqB.stats.gf += golesB;
                        eqA.stats.gc += golesB;
                        eqB.stats.gc += golesA;
                        eqA.stats.dg = eqA.stats.gf - eqA.stats.gc;
                        eqB.stats.dg = eqB.stats.gf - eqB.stats.gc;

                        if (golesA > golesB) {
                            eqA.stats.pts += 3;
                            eqA.stats.pg = (eqA.stats.pg || 0) + 1;
                            eqB.stats.pp = (eqB.stats.pp || 0) + 1;
                        } else if (golesB > golesA) {
                            eqB.stats.pts += 3;
                            eqB.stats.pg = (eqB.stats.pg || 0) + 1;
                            eqA.stats.pp = (eqA.stats.pp || 0) + 1;
                        } else {
                            eqA.stats.pts += 1;
                            eqB.stats.pts += 1;
                            eqA.stats.pe = (eqA.stats.pe || 0) + 1;
                            eqB.stats.pe = (eqB.stats.pe || 0) + 1;
                        }
                    }
                });
            }
        }

        // Guardar cambios en DB
        const updateDoc = {
            $set: {
                'structure.grupos': newGrupos
            }
        };
        // Si corregimos IDs dentro de los partidos del calendario, también grabamos el calendario
        if (hasChanges) {
            updateDoc.$set['structure.calendario'] = t.structure.calendario;
        }

        await db.collection('tournaments').updateOne(
            { _id: t._id },
            updateDoc
        );

        console.log(`✅ Torneo ${t.nombre} recalculado y guardado.\n`);
    }

    console.log("Terminado recálculo de stats automático.");
}
