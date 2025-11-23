export function parsePlayerList(text) {
    const lines = text.split('\n').map(l => l.trim()).filter(l => l);
    const players = [];
    let currentPosition = 'NONE';

    // Mapa de cabeceras a posiciones del draft
    const positionMap = {
        // Porteros
        'PORTEROS': 'GK', 'PORTERO': 'GK', 'GK': 'GK',

        // Defensas Centrales
        'DEFENSAS': 'DFC', 'DEFENSA': 'DFC', 'DFC': 'DFC', 'CENTRALES': 'DFC',

        // Carrileros / Laterales -> CARR
        'CARRILEROS': 'CARR', 'LATERALES': 'CARR', 'LTD': 'CARR', 'LTI': 'CARR', 'CARR': 'CARR',

        // Medios (Unificado) -> MC
        'MCD': 'MC', 'PIVOTES': 'MC', 'DEFENSIVOS': 'MC',
        'MEDIOS': 'MC', 'MEDIO': 'MC', 'MEDIOCAMPISTAS': 'MC', 'MC': 'MC',
        'MCO': 'MC', 'OFENSIVOS': 'MC', 'MP': 'MC',
        'EXTREMOS': 'MC', 'EI': 'MC', 'ED': 'MC', 'EXTREMO': 'MC',

        // Delanteros -> DC
        'DELANTEROS': 'DC', 'DELANTERO': 'DC', 'DC': 'DC', 'ARIETES': 'DC'
    };

    for (let i = 0; i < lines.length; i++) {
        let line = lines[i];

        // 1. Detectar cambio de posición (Cabeceras)
        const upperLine = line.toUpperCase();
        let isHeader = false;
        for (const [key, value] of Object.entries(positionMap)) {
            if (upperLine.includes(key) && (upperLine.includes('🥅') || upperLine.includes('🧱') || upperLine.includes('⚡') || upperLine.includes('⚽') || upperLine.includes('🏟️') || line.length < 30)) {
                currentPosition = value;
                isHeader = true;
                break;
            }
        }
        if (isHeader) continue;

        // 2. Ignorar líneas que no parecen jugadores
        if (line.includes('CIERRE DE LISTA') || line.includes('ENCUESTA') || line.includes('DIRECTO EN TWITCH')) continue;

        // 3. Intento 1: Todo en una línea (ID + WhatsApp)
        const singleLineMatch = line.match(/^(?:\d+[\.\)\-\s]*)?\s*(.+?)\s+(\+?\d[\d\s\-\.]{8,})$/);

        if (singleLineMatch) {
            let gameId = singleLineMatch[1].trim();
            let whatsapp = singleLineMatch[2].replace(/[\s\-\.]/g, '');
            gameId = gameId.replace(/\s*\(.*\)$/, '').trim(); // Quitar paréntesis extra

            players.push({ gameId, whatsapp, position: currentPosition });
            continue;
        }

        // 4. Intento 2: Multilínea (Nombre en línea actual, WhatsApp en la siguiente)
        if (i + 1 < lines.length) {
            const nextLine = lines[i + 1];
            // Regex estricta para la siguiente línea: SOLO debe ser un número de teléfono (con posibles espacios/puntos)
            const phoneMatch = nextLine.match(/^(\+?\d[\d\s\-\.]{8,})$/);

            if (phoneMatch) {
                let gameId = line.replace(/^(?:\d+[\.\)\-\s]*)?/, '').trim(); // Quitar "1. " del nombre
                let whatsapp = phoneMatch[1].replace(/[\s\-\.]/g, '');
                gameId = gameId.replace(/\s*\(.*\)$/, '').trim();

                // Evitar falsos positivos si el "nombre" parece basura o muy corto y numérico
                if (gameId.length > 1) {
                    players.push({ gameId, whatsapp, position: currentPosition });
                    i++; // Saltar la siguiente línea ya que la hemos consumido
                    continue;
                }
            }
        }
    }

    return players;
}
