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

        // 1. Ignorar líneas que no parecen jugadores ni cabeceras útiles
        if (line.includes('CIERRE DE LISTA') || line.includes('ENCUESTA') || line.includes('DIRECTO EN TWITCH')) continue;

        // 2. Intento 1: Todo en una línea (ID + WhatsApp)
        // Relaxed regex: \s* before phone number, y permitir emojis o caracteres raros (^[\D]*) antes del plus/número
        const singleLineMatch = line.match(/^(?:\d+[\.\)\-\s]*)?\s*(.+?)\s*.*?(\+?\d[\d\s\-\.]{8,})$/);

        if (singleLineMatch) {
            let gameId = singleLineMatch[1].trim();
            // Quitamos emojis o basura final que haya quedado pegada al nombre
            gameId = gameId.replace(/[\u{1F300}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F900}-\u{1F9FF}\u{1F1E0}-\u{1F1FF}]/gu, '').trim();

            let whatsapp = singleLineMatch[2].replace(/[^\d\+]/g, ''); // Solo dejamos números y el plus
            gameId = gameId.replace(/\s*\(.*\)$/, '').trim(); // Quitar paréntesis extra

            // Intentar extraer posición del nombre (ej: "Pepe DC")
            let position = currentPosition;
            const positionRegex = /\b(GK|PORTERO|DFC|DF|CENTRAL|LTD|LTI|LATERAL|CARR|CARRILERO|MCD|MC|MCO|MEDIO|MP|EI|ED|EXTREMO|DC|DELANTERO|ARIETE)\b/i;
            const posMatch = gameId.match(positionRegex);

            if (posMatch) {
                const rawPos = posMatch[1].toUpperCase();
                // Mapear a estándar
                if (['GK', 'PORTERO'].includes(rawPos)) position = 'GK';
                else if (['DFC', 'DF', 'CENTRAL'].includes(rawPos)) position = 'DFC';
                else if (['LTD', 'LTI', 'LATERAL', 'CARR', 'CARRILERO'].includes(rawPos)) position = 'CARR';
                else if (['MCD', 'MC', 'MCO', 'MEDIO', 'MP', 'EI', 'ED', 'EXTREMO'].includes(rawPos)) position = 'MC';
                else if (['DC', 'DELANTERO', 'ARIETE'].includes(rawPos)) position = 'DC';

                // Quitar la posición del nombre
                gameId = gameId.replace(positionRegex, '').trim();
                gameId = gameId.replace(/[\-\|]+$/, '').trim();
            }

            players.push({ gameId, whatsapp, position });
            continue;
        }

        // 3. Intento 2: Multilínea (Nombre en línea actual, WhatsApp en la siguiente)
        if (i + 1 < lines.length) {
            const nextLine = lines[i + 1];
            // Regex estricta para la siguiente línea: Puede empezar con cualquier cosa (emojis, palabras raras, '📲'), 
            // pero DEBE contener un número largo
            const phoneMatch = nextLine.match(/.*?(\+?\d[\d\s\-\.]{8,})/);

            // Verificamos si la siguiente línea *parece* un teléfono principalmente, y no el nombre de otro jugador
            // Por ejemplo, que la mayor parte de la línea sean números o símbolos
            const numericContent = nextLine.replace(/[^\d]/g, '');

            if (phoneMatch && numericContent.length >= 8) {
                let gameId = line.replace(/^(?:\d+[\.\)\-\s]*)?/, '').trim(); // Quitar "1. " del nombre
                let whatsapp = phoneMatch[1].replace(/[^\d\+]/g, ''); // Solo números y plus
                gameId = gameId.replace(/\s*\(.*\)$/, '').trim();
                // Limpiar emojis del nombre por si acaso
                gameId = gameId.replace(/[\u{1F300}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F900}-\u{1F9FF}\u{1F1E0}-\u{1F1FF}]/gu, '').trim();

                // Intentar extraer posición del nombre (ej: "Pepe DC")
                let position = currentPosition;
                const positionRegex = /\b(GK|PORTERO|DFC|DF|CENTRAL|LTD|LTI|LATERAL|CARR|CARRILERO|MCD|MC|MCO|MEDIO|MP|EI|ED|EXTREMO|DC|DELANTERO|ARIETE)\b/i;
                const posMatch = gameId.match(positionRegex);

                if (posMatch) {
                    const rawPos = posMatch[1].toUpperCase();
                    // Mapear a estándar
                    if (['GK', 'PORTERO'].includes(rawPos)) position = 'GK';
                    else if (['DFC', 'DF', 'CENTRAL'].includes(rawPos)) position = 'DFC';
                    else if (['LTD', 'LTI', 'LATERAL', 'CARR', 'CARRILERO'].includes(rawPos)) position = 'CARR';
                    else if (['MCD', 'MC', 'MCO', 'MEDIO', 'MP', 'EI', 'ED', 'EXTREMO'].includes(rawPos)) position = 'MC';
                    else if (['DC', 'DELANTERO', 'ARIETE'].includes(rawPos)) position = 'DC';

                    // Quitar la posición del nombre
                    gameId = gameId.replace(positionRegex, '').trim();
                    gameId = gameId.replace(/[\-\|]+$/, '').trim();
                }

                // Evitar falsos positivos si el "nombre" parece basura o muy corto y numérico
                if (gameId.length > 1) {
                    players.push({ gameId, whatsapp, position });
                    i++; // Saltar la siguiente línea ya que la hemos consumido
                    continue;
                }
            }
        }

        // 4. Detectar cambio de posición (Cabeceras) - AHORA AL FINAL Y MÁS ESTRICTO
        const upperLine = line.toUpperCase().replace(/[^A-Z0-9\s]/g, ''); // Mantener espacios y números
        let isHeader = false;

        // Revisamos si la línea contiene alguna de las claves de posición como PALABRA COMPLETA
        for (const [key, value] of Object.entries(positionMap)) {
            // Usamos regex con word boundaries (\b) para evitar falsos positivos (ej: "PEDRO" contiene "ED")
            const regex = new RegExp(`\\b${key}\\b`, 'i');
            if (regex.test(upperLine) && line.length < 40) {
                currentPosition = value;
                isHeader = true;
                break;
            }
        }
        if (isHeader) continue;
    }

    return players;
}
