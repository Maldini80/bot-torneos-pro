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

    // Regex para detectar un número de teléfono (9+ dígitos, opcionalmente con +, espacios, guiones)
    const phoneRegex = /(\+?\d[\d\s\-\.]{8,})/;

    // Regex para limpiar emojis
    const emojiRegex = /[\u{1F300}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F900}-\u{1F9FF}\u{1F1E0}-\u{1F1FF}]/gu;

    // Regex para quitar el prefijo numérico de lista (ej: "1. ", "23)", "4-")
    const listPrefixRegex = /^(?:\d+[\.)\-\s]*)?/;

    // Regex para extraer posición del nombre de jugador
    const positionRegex = /\b(GK|PORTERO|DFC|DF|CENTRAL|LTD|LTI|LATERAL|CARR|CARRILERO|MCD|MC|MCO|MEDIO|MP|EI|ED|EXTREMO|DC|DELANTERO|ARIETE)\b/i;

    // Función auxiliar para limpiar un nombre de jugador
    function cleanGameId(raw) {
        let gameId = raw.replace(listPrefixRegex, '').trim();

        // Novedad: Si el nombre contiene un número de teléfono pegado al principio (ej "650798522 JOSSEBI"), lo quitamos
        gameId = gameId.replace(/^(?:\+?\d[\d\s\-\.]{7,})\s+/, '').trim();

        gameId = gameId.replace(emojiRegex, '').trim();
        gameId = gameId.replace(/\s*\(.*\)$/, '').trim(); // Quitar paréntesis extras con info
        return gameId;
    }

    // Función auxiliar para extraer posición del nombre y limpiar
    function extractPosition(gameId) {
        let position = currentPosition;
        const posMatch = gameId.match(positionRegex);
        if (posMatch) {
            const rawPos = posMatch[1].toUpperCase();
            if (['GK', 'PORTERO'].includes(rawPos)) position = 'GK';
            else if (['DFC', 'DF', 'CENTRAL'].includes(rawPos)) position = 'DFC';
            else if (['LTD', 'LTI', 'LATERAL', 'CARR', 'CARRILERO'].includes(rawPos)) position = 'CARR';
            else if (['MCD', 'MC', 'MCO', 'MEDIO', 'MP', 'EI', 'ED', 'EXTREMO'].includes(rawPos)) position = 'MC';
            else if (['DC', 'DELANTERO', 'ARIETE'].includes(rawPos)) position = 'DC';
            gameId = gameId.replace(positionRegex, '').trim();
            gameId = gameId.replace(/[\-\|,]+$/, '').trim();
        }
        return { gameId, position };
    }

    // Función para verificar si una línea es puramente un teléfono (con o sin prefijo 📲)
    function isPhoneLine(line) {
        const cleaned = line.replace(/📲/g, '').replace(/[^\d\+\s\-\.]/g, '').trim();
        return cleaned.length > 0 && cleaned.replace(/[^\d]/g, '').length >= 8;
    }

    // Función para verificar si una línea es un slot vacío (ej: "16." o "📲")
    function isEmptySlot(line) {
        const cleaned = line.replace(/📲/g, '').replace(/[\d\.)\-\s]/g, '').trim();
        return cleaned.length === 0;
    }

    for (let i = 0; i < lines.length; i++) {
        let line = lines[i];

        // 1. Ignorar líneas inútiles
        if (line.includes('CIERRE DE LISTA') || line.includes('ENCUESTA') || line.includes('DIRECTO EN TWITCH')) continue;
        if (line.includes('CIERRE CAPITANES') || line.includes('INICIO DEL DIRECTO') || line.includes('INICIO DEL TORNEO')) continue;

        // 2. Detectar cabeceras de posición PRIMERO
        const upperLine = line.toUpperCase().replace(/[^A-Z0-9\s]/g, '');
        let isHeader = false;
        for (const [key, value] of Object.entries(positionMap)) {
            const regex = new RegExp(`\\b${key}\\b`, 'i');
            if (regex.test(upperLine) && line.length < 40) {
                currentPosition = value;
                isHeader = true;
                break;
            }
        }
        if (isHeader) continue;

        // 3. Ignorar líneas vacías, solo número de lista, o solo 📲
        if (isEmptySlot(line)) {
            // Mirar si la siguiente línea también es un slot vacío (📲 sin número)
            if (i + 1 < lines.length && isEmptySlot(lines[i + 1])) {
                i++; // Saltar la siguiente línea vacía también
            }
            continue;
        }

        // 4. Si la línea es solo un teléfono (📲XXXXXX), saltarla (fue consumida o es huérfana)
        if (isPhoneLine(line) && !line.match(/[a-zA-Z_]{2,}/)) {
            continue;
        }

        // 5. Intento: Nombre y teléfono en la MISMA línea
        // El truco es que el nombre viene ANTES del teléfono. Usamos una estrategia más robusta:
        // Buscar el teléfono al FINAL de la línea, y todo lo de antes es el nombre.
        const phoneInLineMatch = line.match(/^(.+?)\s+(\+?\d[\d\s\-\.]{8,})\s*$/);
        if (phoneInLineMatch) {
            let rawName = phoneInLineMatch[1];
            let whatsapp = phoneInLineMatch[2].replace(/[^\d\+]/g, '');
            let gameId = cleanGameId(rawName);

            // Caso especial: "650798522 JOSSEBI" → el número está antes del nombre
            // Si el gameId parece ser un número de teléfono, buscar el nombre al final
            if (/^\d{8,}$/.test(gameId)) {
                // El nombre real está en la parte del "teléfono"
                // Intentar: el gameId real es lo que hay después del número
                const reversedMatch = line.match(/^(?:\d+[\.)\-\s]*)?\s*\d{8,}\s+(.+?)$/);
                if (reversedMatch) {
                    gameId = reversedMatch[1].trim();
                    whatsapp = ''; // El número que encontramos era el que teníamos como "nombre"
                    // Intentar ver si la siguiente línea tiene el teléfono real
                    if (i + 1 < lines.length) {
                        const nextPhoneMatch = lines[i + 1].match(/.*?(\+?\d[\d\s\-\.]{8,})/);
                        if (nextPhoneMatch && isPhoneLine(lines[i + 1])) {
                            whatsapp = nextPhoneMatch[1].replace(/[^\d\+]/g, '');
                            i++;
                        }
                    }
                }
            }

            const extracted = extractPosition(gameId);
            gameId = extracted.gameId;

            if (gameId.length >= 2 && !/^\d+$/.test(gameId)) {
                players.push({ gameId, whatsapp, position: extracted.position });

                // Si la siguiente línea es un teléfono huérfano (📲 sin nada), saltarla
                if (i + 1 < lines.length && isPhoneLine(lines[i + 1]) && !lines[i + 1].match(/[a-zA-Z_]{2,}/)) {
                    i++;
                }
                continue;
            }
        }

        // 6. Intento: Multilínea (Nombre en esta línea, Teléfono en la siguiente)
        if (i + 1 < lines.length) {
            const nextLine = lines[i + 1];
            const nextPhoneMatch = nextLine.match(/.*?(\+?\d[\d\s\-\.]{8,})/);
            const nextNumericContent = nextLine.replace(/[^\d]/g, '');

            if (nextPhoneMatch && nextNumericContent.length >= 8) {
                let gameId = cleanGameId(line);
                let whatsapp = nextPhoneMatch[1].replace(/[^\d\+]/g, '');

                const extracted = extractPosition(gameId);
                gameId = extracted.gameId;

                // Evitar falsos positivos: nombre demasiado corto o puramente numérico
                if (gameId.length >= 2 && !/^\d+$/.test(gameId)) {
                    players.push({ gameId, whatsapp, position: extracted.position });
                    i++; // Saltar la siguiente línea (teléfono consumido)
                    continue;
                }
            }

            // 7. Caso especial: Nombre en esta línea, siguiente es 📲 VACÍO (sin número)
            // El jugador se apuntó pero no puso teléfono → aceptarlo sin whatsapp
            if (nextLine.includes('📲') && !nextLine.match(/\d{8,}/)) {
                let gameId = cleanGameId(line);
                const extracted = extractPosition(gameId);
                gameId = extracted.gameId;

                if (gameId.length >= 2 && !/^\d+$/.test(gameId)) {
                    players.push({ gameId, whatsapp: '', position: extracted.position });
                    i++; // Saltar el 📲 vacío
                    continue;
                }
            }
        }
    }

    return players;
}

export function parseExternalDraftWhatsappList(text) {
    const lines = text.split('\n').filter(line => line.trim() !== '');

    // Configuración robusta de Regex
    const posRegex = /\b(GK|POR|PT|DFC|LTI|LTD|CARR|MC|MCD|MCO|MD|MI|ED|EI|SD|DC)\b/i;
    const phoneRegex = /(\+?\d[\d\s\-\.]{7,})/;
    const orderRegex = /(?:^|\s)(\d+)(?:[\.\-\)]\s|\s)/;

    return lines.map(line => {
        let order = '';
        let phone = '';
        let pos = '';
        let name = line;

        const orderMatch = line.match(orderRegex);
        if (orderMatch) {
            order = orderMatch[1];
            name = name.replace(orderMatch[0], ' ');
        }

        const phoneMatch = name.match(phoneRegex);
        if (phoneMatch) {
            phone = phoneMatch[1].trim();
            name = name.replace(phoneMatch[0], ' ');
        }

        const posMatch = name.match(posRegex);
        if (posMatch) {
            let extractedPos = posMatch[1].toUpperCase();
            // Normalizar a los colores requeridos si es posible
            if (['POR', 'PT'].includes(extractedPos)) extractedPos = 'GK';
            if (['LTI', 'LTD'].includes(extractedPos)) extractedPos = 'CARR';
            if (['MCD', 'MD', 'MI', 'MCO'].includes(extractedPos)) extractedPos = 'MC';
            if (['EI', 'ED', 'SD'].includes(extractedPos)) extractedPos = 'DC';

            pos = extractedPos;
            name = name.replace(posMatch[0], ' ');
            name = name.replace(/[\(\)]/g, ' ');
        }

        // Limpieza final del nombre
        name = name.replace(/📱|📲|📞/g, '').replace(/\s+/g, ' ').trim();

        return { order, name, pos, phone, raw: line };
    });
}
