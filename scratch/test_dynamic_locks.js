import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';
import dns from 'dns';

dns.setServers(['8.8.8.8', '8.8.4.4']);
dotenv.config();

// Helper para calcular la hora de Madrid y ver si coincide con las funciones
function getMadridTime() {
    const d = new Date();
    // Convert to Madrid Time
    const madridStr = d.toLocaleString('en-US', { timeZone: 'Europe/Madrid' });
    const madridDate = new Date(madridStr);
    return {
        day: madridDate.getDay(),
        hours: madridDate.getHours(),
        minutes: madridDate.getMinutes()
    };
}

function calculateLock(lockConfig, day, hours, minutes) {
    if (!lockConfig || !lockConfig.active) return null;
    const totalMinutes = hours * 60 + minutes;

    const [startH, startM] = lockConfig.startTime.split(':').map(Number);
    const startMin = startH * 60 + startM;
    const durationMin = Number(lockConfig.durationHours) * 60;
    const days = lockConfig.days;

    let locked = false;
    const diffToday = totalMinutes - startMin;
    if (days.includes(day) && diffToday >= 0 && diffToday < durationMin) {
        locked = true;
    }

    const yesterday = (day === 0) ? 6 : day - 1;
    const diffYesterday = (totalMinutes + 1440) - startMin;
    if (days.includes(yesterday) && diffYesterday >= 0 && diffYesterday < durationMin) {
        locked = true;
    }

    if (locked) {
        const endTotalMin = Math.round(startMin + durationMin) % 1440;
        const endH = String(Math.floor(endTotalMin / 60)).padStart(2, '0');
        const endM = String(endTotalMin % 60).padStart(2, '0');
        const daysNames = ["domingos", "lunes", "martes", "miércoles", "jueves", "viernes", "sábados"];
        
        let daysText = "";
        if (days.length === 4 && days.includes(1) && days.includes(2) && days.includes(3) && days.includes(4)) {
            daysText = "de lunes a jueves";
        } else if (days.length === 7) {
            daysText = "todos los días";
        } else {
            daysText = "los " + days.map(d => daysNames[d]).join(', ');
        }
        
        const crossesMidnight = (startMin + durationMin) >= 1440;
        const suffix = crossesMidnight ? ' del día siguiente' : '';
        return `Bloqueo activo ${daysText} desde las ${lockConfig.startTime} hasta las ${endH}:${endM}${suffix} (hora de Madrid).`;
    }

    return null;
}

async function run() {
    const client = new MongoClient(process.env.DATABASE_URL);
    try {
        await client.connect();
        const db = client.db('tournamentBotDb');
        
        console.log('--- 1. PROBANDO CONFIGURACIÓN DE BASE DE DATOS ---');
        const schedules = await db.collection('fantasy_config').findOne({ key: 'schedules' });
        console.log('Schedules en base de datos:', JSON.stringify(schedules, null, 2));

        console.log('\n--- 2. PROBANDO CÁLCULO DE BLOQUEO DE CLAUSULAS (clauseLock) ---');
        // Usar los valores actuales
        const clauseLock = schedules.clauseLock || { active: true, days: [1, 2, 3, 4], startTime: "18:30", durationHours: 5.5 };
        const timeNow = getMadridTime();
        console.log(`Hora de Madrid actual -> Día: ${timeNow.day}, Hora: ${timeNow.hours}:${timeNow.minutes}`);
        
        const lockRes = calculateLock(clauseLock, timeNow.day, timeNow.hours, timeNow.minutes);
        console.log('Resultado bloqueo de cláusulas actual:', lockRes ? `BLOQUEADO: ${lockRes}` : 'DISPONIBLE');

        // Probar caso de test forzado: lunes a las 19:30 (dentro del rango de lunes a jueves de 18:30 con 5.5 hrs)
        console.log('\nSimulando Lunes a las 19:30 (debería estar BLOQUEADO):');
        const simLocked = calculateLock(clauseLock, 1, 19, 30);
        console.log('Resultado:', simLocked ? `BLOQUEADO (Correcto): ${simLocked}` : 'DISPONIBLE (Incorrecto)');

        // Probar caso de test forzado: lunes a las 12:00 (debería estar DISPONIBLE)
        console.log('\nSimulando Lunes a las 12:00 (debería estar DISPONIBLE):');
        const simFree = calculateLock(clauseLock, 1, 12, 0);
        console.log('Resultado:', simFree ? `BLOQUEADO (Incorrecto): ${simFree}` : 'DISPONIBLE (Correcto)');

        console.log('\n--- 3. PROBANDO CÁLCULO DE BLOQUEO DE MERCADO (marketLock) ---');
        const marketLock = schedules.marketLock || { active: false, days: [1, 2, 3, 4], startTime: "18:00", durationHours: 8 };
        const marketLockRes = calculateLock(marketLock, timeNow.day, timeNow.hours, timeNow.minutes);
        console.log('Resultado bloqueo de mercado actual:', marketLockRes ? `BLOQUEADO: ${marketLockRes}` : 'DISPONIBLE');

        // Simular con active: true, lunes a las 19:00 (debería estar bloqueado)
        console.log('\nSimulando Lunes a las 19:00 con marketLock ACTIVO (debería estar BLOQUEADO):');
        const simMarketLockConfig = { active: true, days: [1, 2, 3, 4], startTime: "18:00", durationHours: 8 };
        const simMarketLocked = calculateLock(simMarketLockConfig, 1, 19, 0);
        console.log('Resultado:', simMarketLocked ? `BLOQUEADO (Correcto): ${simMarketLocked}` : 'DISPONIBLE (Incorrecto)');

        console.log('\nPRUEBAS FINALIZADAS CON ÉXITO');
        
    } catch (e) {
        console.error(e);
    } finally {
        await client.close();
    }
}

run();
