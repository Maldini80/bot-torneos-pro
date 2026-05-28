import { MongoClient } from 'mongodb';
import 'dotenv/config';
import { getMadridTime } from '../src/utils/timeHelper.js';

async function run() {
    const client = new MongoClient(process.env.DATABASE_URL);
    try {
        await client.connect();
        const db = client.db('tournamentBotDb');
        
        console.log('=== VERIFICANDO HORARIO DE MERCADO ===\n');
        
        const config = await db.collection('fantasy_config').findOne({ key: 'schedules' });
        console.log('Configuración de Schedules en BD:');
        console.log(JSON.stringify(config, null, 2));
        
        console.log('\n--- Hora y Día de Madrid Actual ---');
        const mTime = getMadridTime();
        console.log(`Día de la semana: ${mTime.day} (0=Domingo, 1=Lunes, ..., 3=Miércoles, ..., 6=Sábado)`);
        console.log(`Hora y minutos: ${String(mTime.hours).padStart(2, '0')}:${String(mTime.minutes).padStart(2, '0')}`);
        
        if (config && config.market) {
            const mSched = config.market;
            const activeDays = mSched.days || [];
            const windows = mSched.windows || [];
            
            console.log('\n--- Evaluación de Condiciones ---');
            console.log(`- ¿Mercado activo? (active): ${mSched.active}`);
            console.log(`- ¿Día actual (${mTime.day}) incluido en days [${activeDays.join(', ')}]? : ${activeDays.includes(mTime.day)}`);
            
            const hourMinStr = `${String(mTime.hours).padStart(2, '0')}:${String(mTime.minutes).padStart(2, '0')}`;
            const targetWindow = "19:00";
            console.log(`- ¿La ventana "${targetWindow}" está en windows [${windows.join(', ')}]? : ${windows.includes(targetWindow)}`);
            console.log(`- Última ejecución registrada (lastRun): ${mSched.lastRun}`);
        }
        
    } catch (e) {
        console.error(e);
    } finally {
        await client.close();
    }
}
run();
