
const tournament = {
    config: {
        formatId: 'flexible_league',
        leagueMode: 'standard'
    },
    structure: {
        calendario: {}
    }
};

const teamA = { id: '1', nombre: 'Team A', stats: { pts: 10, dg: 5, gf: 10, buchholz: 0 } };
const teamB = { id: '2', nombre: 'Team B', stats: { pts: 10, dg: 5, gf: 10, buchholz: 0 } };
const teamC = { id: '3', nombre: 'Team C', stats: { pts: 10, dg: 5, gf: 10, buchholz: 0 } };

function sortTeams(a, b, tournament, groupName) {
    if (a.stats.pts !== b.stats.pts) return b.stats.pts - a.stats.pts;

    // --- TIE-BREAKS PARA SISTEMA SUIZO ---
    if (tournament.config.formatId === 'flexible_league' && tournament.config.leagueMode === 'custom_rounds') {
        if (a.stats.buchholz !== b.stats.buchholz) return b.stats.buchholz - a.stats.buchholz;
    }
    // -------------------------------------

    if (a.stats.dg !== b.stats.dg) return b.stats.dg - a.stats.dg;
    if (a.stats.gf !== b.stats.gf) return b.stats.gf - a.stats.gf;

    const enfrentamiento = tournament.structure.calendario[groupName]?.find(p =>
        p.resultado &&
        ((p.equipoA.id === a.id && p.equipoB.id === b.id) || (p.equipoA.id === b.id && p.equipoB.id === a.id))
    );

    if (enfrentamiento) {
        const [golesA, golesB] = enfrentamiento.resultado.split('-').map(Number);
        if (enfrentamiento.equipoA.id === a.id) {
            if (golesA > golesB) return -1;
            if (golesB > golesA) return 1;
        } else {
            if (golesB > golesA) return -1;
            if (golesA > golesB) return 1;
        }
    }
    // OLD LOGIC (Simulated)
    return Math.random() - 0.5;
}

console.log("Running 5 sorts with RANDOM logic:");
for (let i = 0; i < 5; i++) {
    const teams = [teamA, teamB, teamC];
    teams.sort((a, b) => sortTeams(a, b, tournament, 'Group A'));
    console.log(`Run ${i + 1}: ${teams.map(t => t.nombre).join(', ')}`);
}

function sortTeamsFixed(a, b, tournament, groupName) {
    if (a.stats.pts !== b.stats.pts) return b.stats.pts - a.stats.pts;

    // --- TIE-BREAKS PARA SISTEMA SUIZO ---
    if (tournament.config.formatId === 'flexible_league' && tournament.config.leagueMode === 'custom_rounds') {
        if (a.stats.buchholz !== b.stats.buchholz) return b.stats.buchholz - a.stats.buchholz;
    }
    // -------------------------------------

    if (a.stats.dg !== b.stats.dg) return b.stats.dg - a.stats.dg;
    if (a.stats.gf !== b.stats.gf) return b.stats.gf - a.stats.gf;

    const enfrentamiento = tournament.structure.calendario[groupName]?.find(p =>
        p.resultado &&
        ((p.equipoA.id === a.id && p.equipoB.id === b.id) || (p.equipoA.id === b.id && p.equipoB.id === a.id))
    );

    if (enfrentamiento) {
        const [golesA, golesB] = enfrentamiento.resultado.split('-').map(Number);
        if (enfrentamiento.equipoA.id === a.id) {
            if (golesA > golesB) return -1;
            if (golesB > golesA) return 1;
        } else {
            if (golesB > golesA) return -1;
            if (golesA > golesB) return 1;
        }
    }
    // NEW LOGIC
    return a.nombre.localeCompare(b.nombre);
}

console.log("\nRunning 5 sorts with FIXED logic:");
for (let i = 0; i < 5; i++) {
    const teams = [teamA, teamB, teamC]; // Reset order is not strictly needed as sort is in-place but good for clarity
    // Shuffle first to prove stability
    teams.sort(() => Math.random() - 0.5);

    teams.sort((a, b) => sortTeamsFixed(a, b, tournament, 'Group A'));
    console.log(`Run ${i + 1}: ${teams.map(t => t.nombre).join(', ')}`);
}
