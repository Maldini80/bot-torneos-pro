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

    const phoneRegex = /(\+?\d[\d\s\-\.]{8,})/;
    const emojiRegex = /[\u{1F300}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F900}-\u{1F9FF}\u{1F1E0}-\u{1F1FF}]/gu;
    const listPrefixRegex = /^(?:\d+[\.)\-\s]*)?/;
    const positionRegex = /\b(GK|PORTERO|DFC|DF|CENTRAL|LTD|LTI|LATERAL|CARR|CARRILERO|MCD|MC|MCO|MEDIO|MP|EI|ED|EXTREMO|DC|DELANTERO|ARIETE)\b/i;

    function cleanGameId(raw) {
        let gameId = raw.replace(listPrefixRegex, '').trim();
        gameId = gameId.replace(/^(?:\+?\d[\d\s\-\.]{7,})\s+/, '').trim();
        gameId = gameId.replace(emojiRegex, '').trim();
        gameId = gameId.replace(/\s*\(.*\)$/, '').trim();
        return gameId;
    }

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

    function isPhoneLine(line) {
        const cleaned = line.replace(/📲/g, '').replace(/[^\d\+\s\-\.]/g, '').trim();
        return cleaned.length > 0 && cleaned.replace(/[^\d]/g, '').length >= 8;
    }

    function isEmptySlot(line) {
        const cleaned = line.replace(/📲/g, '').replace(/[\d\.)\-\s]/g, '').trim();
        return cleaned.length === 0;
    }

    for (let i = 0; i < lines.length; i++) {
        let line = lines[i];

        if (line.includes('CIERRE DE LISTA') || line.includes('ENCUESTA') || line.includes('DIRECTO EN TWITCH')) continue;
        if (line.includes('CIERRE CAPITANES') || line.includes('INICIO DEL DIRECTO') || line.includes('INICIO DEL TORNEO')) continue;

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

        if (isEmptySlot(line)) {
            if (i + 1 < lines.length && isEmptySlot(lines[i + 1])) i++;
            continue;
        }

        if (isPhoneLine(line) && !line.match(/[a-zA-Z_]{2,}/)) continue;

        const phoneInLineMatch = line.match(/^(.+?)\s+(\+?\d[\d\s\-\.]{8,})\s*$/);
        if (phoneInLineMatch) {
            let rawName = phoneInLineMatch[1];
            let whatsapp = phoneInLineMatch[2].replace(/[^\d\+]/g, '');
            let gameId = cleanGameId(rawName);

            if (/^\d{8,}$/.test(gameId)) {
                const reversedMatch = line.match(/^(?:\d+[\.)\-\s]*)?\s*\d{8,}\s+(.+?)$/);
                if (reversedMatch) {
                    gameId = reversedMatch[1].trim();
                    whatsapp = '';
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
                if (i + 1 < lines.length && isPhoneLine(lines[i + 1]) && !lines[i + 1].match(/[a-zA-Z_]{2,}/)) i++;
                continue;
            }
        }

        if (i + 1 < lines.length) {
            const nextLine = lines[i + 1];
            const nextPhoneMatch = nextLine.match(/.*?(\+?\d[\d\s\-\.]{8,})/);
            const nextNumericContent = nextLine.replace(/[^\d]/g, '');

            if (nextPhoneMatch && nextNumericContent.length >= 8) {
                let gameId = cleanGameId(line);
                let whatsapp = nextPhoneMatch[1].replace(/[^\d\+]/g, '');

                const extracted = extractPosition(gameId);
                gameId = extracted.gameId;

                if (gameId.length >= 2 && !/^\d+$/.test(gameId)) {
                    players.push({ gameId, whatsapp, position: extracted.position });
                    i++;
                    continue;
                }
            }

            if (nextLine.includes('📲') && !nextLine.match(/\d{8,}/)) {
                let gameId = cleanGameId(line);
                const extracted = extractPosition(gameId);
                gameId = extracted.gameId;

                if (gameId.length >= 2 && !/^\d+$/.test(gameId)) {
                    players.push({ gameId, whatsapp: '', position: extracted.position });
                    i++;
                    continue;
                }
            }
        }
    }

    return players;
}

export function parseExternalDraftWhatsappList(text) {
    const lines = text.split('\n');
    const sectionMap = {
        'PORTERO': 'GK', 'PORTEROS': 'GK', 'POR': 'GK', 'GK': 'GK',
        'DEFENSA': 'DFC', 'DEFENSAS': 'DFC', 'DFC': 'DFC', 'DEF': 'DFC', 'CENTRAL': 'DFC', 'CENTRALES': 'DFC',
        'LATERAL': 'CARR', 'LATERALES': 'CARR', 'CARRILERO': 'CARR', 'CARRILEROS': 'CARR', 'CARR': 'CARR',
        'MEDIO': 'MC', 'MEDIOS': 'MC', 'MEDIOCENTRO': 'MC', 'MEDIOCENTROS': 'MC', 'MC': 'MC', 'MCD': 'MC', 'MCO': 'MC', 'CENTROCAMPISTA': 'MC', 'CENTROCAMPISTAS': 'MC',
        'EXTREMO': 'MC', 'EXTREMOS': 'MC',
        'DELANTERO': 'DC', 'DELANTEROS': 'DC', 'DC': 'DC', 'ATACANTE': 'DC', 'ATACANTES': 'DC',
        'MEDIA PUNTA': 'MC', 'MEDIAPUNTA': 'MC', 'MP': 'MC'
    };
    const inlinePosMap = {
        'GK': 'GK', 'POR': 'GK', 'PT': 'GK', 'PORTERO': 'GK',
        'DFC': 'DFC', 'DEF': 'DFC', 'CB': 'DFC', 'CENTRAL': 'DFC',
        'LTI': 'CARR', 'LTD': 'CARR', 'CARR': 'CARR', 'CAR': 'CARR', 'LAT': 'CARR', 'LATERAL': 'CARR', 'LI': 'CARR', 'LD': 'CARR',
        'MC': 'MC', 'MCD': 'MC', 'MCO': 'MC', 'MD': 'MC', 'MI': 'MC', 'CDM': 'MC', 'CM': 'MC', 'CAM': 'MC', 'MP': 'MC',
        'EI': 'MC', 'ED': 'MC', 'EXTREMO': 'MC',
        'DC': 'DC', 'SD': 'DC', 'ST': 'DC', 'DEL': 'DC', 'CF': 'DC', 'SS': 'DC'
    };
    const playerLineRegex = /^\s*(\d+)[.\-)\s]+(.+)/;
    const phoneOnlyRegex = /^\s*(\+?\d[\d\s\-\.]{6,})\s*$/;

    function clean(l) { return l.replace(/[\u200B-\u200F\u2028-\u202F\u2060\uFEFF]/g, '').trim(); }
    function isIgnored(l) {
        const t = clean(l);
        if (!t || /^[—\-_=]{1,}$/.test(t)) return true;
        if (/^\*?\d{1,2}:\d{2}/.test(t)) return true;
        const na = t.replace(/\*/g, '').trim();
        if (/^(apuntarse|inscri|cierre|inicio|draft|goldencup|torneo|cup|liga)/i.test(na)) return true;
        return false;
    }
    function extractInlinePos(name) {
        let found = null, cn = name;
        // (DFC), (MC/MCO)
        const p1 = name.match(/\(([A-Za-z\/\s]{2,15})\)/);
        if (p1) {
            for (const c of p1[1].split(/[\/\s,]+/)) {
                const u = c.trim().toUpperCase();
                if (inlinePosMap[u]) { found = inlinePosMap[u]; break; }
            }
            if (found) cn = name.replace(p1[0], '').trim();
        }
        // mc/mcd at end
        if (!found) {
            const p2 = name.match(/\s([A-Za-z]{2,5}(?:\/[A-Za-z]{2,5})+)\s*$/);
            if (p2) {
                for (const c of p2[1].split('/')) {
                    const u = c.trim().toUpperCase();
                    if (inlinePosMap[u]) { found = inlinePosMap[u]; break; }
                }
                if (found) cn = name.replace(p2[0], '').trim();
            }
        }
        // Position word at end: "nombre DFC"
        if (!found) {
            const p3 = name.match(/[\s,]+([A-Za-z]{2,8})\s*$/);
            if (p3) {
                const u = p3[1].toUpperCase();
                if (inlinePosMap[u]) { found = inlinePosMap[u]; cn = name.replace(p3[0], '').trim(); }
            }
        }
        return { position: found, cleanedName: cn };
    }

    let currentPosition = '';
    const players = [];
    for (let i = 0; i < lines.length; i++) {
        const trimmed = clean(lines[i]);
        if (isIgnored(trimmed)) continue;

        // Section header?
        const sec = trimmed.replace(/\*/g, '').replace(/[^\w\sÁÉÍÓÚÑáéíóúñ]/g, '').trim().toUpperCase();
        if (sec.length < 25 && sectionMap[sec]) { currentPosition = sectionMap[sec]; continue; }

        // Player line?
        const pm = trimmed.match(playerLineRegex);
        if (pm) {
            const order = pm[1];
            let name = pm[2].trim();
            let phone = '';

            // Inline phone at end of name
            const ip = name.match(/([\s,;|]+)(\+?\d[\d\s\-\.]{6,})$/);
            if (ip) { phone = ip[2].replace(/[\s\-\.]/g, ''); name = name.replace(ip[0], '').trim(); }

            // Inline position from name
            const { position: inlinePos, cleanedName } = extractInlinePos(name);
            name = cleanedName.replace(/[\u{1F300}-\u{1F9FF}]/gu, '').replace(/[()]/g, '').replace(/\s+/g, ' ').trim();

            // Next line phone?
            if (!phone && i + 1 < lines.length) {
                const nl = clean(lines[i + 1]);
                const np = nl.match(phoneOnlyRegex);
                if (np) { phone = np[1].replace(/[\s\-\.]/g, ''); i++; }
            }

            players.push({ order, name, position: inlinePos || currentPosition || '', phone });
            continue;
        }

        // Phone-only line?
        const po = trimmed.match(phoneOnlyRegex);
        if (po && players.length > 0 && !players[players.length - 1].phone) {
            players[players.length - 1].phone = po[1].replace(/[\s\-\.]/g, '');
            continue;
        }
    }
    return players;
}
