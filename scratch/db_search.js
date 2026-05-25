import { MongoClient } from 'mongodb';
import 'dotenv/config';

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
    throw new Error('DATABASE_URL no está definida.');
}

const client = new MongoClient(dbUrl);

async function run() {
    try {
        await client.connect();
        console.log('Connected to MongoDB.');

        const dbNames = ['tournamentBotDb', 'test'];
        
        for (const dbName of dbNames) {
            console.log(`\n--- Searching in DB: ${dbName} ---`);
            const db = client.db(dbName);
            const collections = await db.listCollections().toArray();
            
            for (const colInfo of collections) {
                const colName = colInfo.name;
                const col = db.collection(colName);
                
                // Find anything containing 'monkey' or 'toca' or 'cacahuete'
                const regexMonkey = /monkey/i;
                const regexToca = /toca/i;
                const regexCacahuete = /cacahuete/i;
                
                const query = {
                    $or: [
                        { name: regexMonkey },
                        { userName: regexMonkey },
                        { psnId: regexMonkey },
                        { discordId: regexMonkey },
                        { userId: regexMonkey },
                        { eaPlayerName: regexMonkey },
                        { teamName: regexToca },
                        { nombre: regexToca },
                        { name: regexToca },
                        { teamName: regexCacahuete },
                        { nombre: regexCacahuete }
                    ]
                };
                
                // Or let's search more broadly by converting documents to string or searching nested fields if needed.
                // Let's first run the simple query and also fetch a few documents if needed.
                const matches = await col.find(query).toArray();
                if (matches.length > 0) {
                    console.log(`Found ${matches.length} matches in collection: ${colName}`);
                    matches.forEach(m => {
                        console.log(JSON.stringify(m, null, 2));
                    });
                }
                
                // Let's also check if there is an array of players or similar inside tournaments/drafts.
                if (colName === 'tournaments' || colName === 'drafts') {
                    // Search in teams or players arrays/objects
                    const allDocs = await col.find({}).toArray();
                    for (const doc of allDocs) {
                        const str = JSON.stringify(doc).toLowerCase();
                        if (str.includes('monkey') || str.includes('toca') || str.includes('cacahuete')) {
                            console.log(`Found match in ${colName} document ID: ${doc._id || doc.shortId}`);
                            // Print summary of document
                            console.log(JSON.stringify({
                                _id: doc._id,
                                shortId: doc.shortId,
                                name: doc.name || doc.nombre,
                                status: doc.status
                            }, null, 2));
                            
                            // Let's look for specific nested matches
                            if (str.includes('monkey')) {
                                console.log('Contains monkey!');
                            }
                            if (str.includes('toca') || str.includes('cacahuete')) {
                                console.log('Contains toca/cacahuete!');
                            }
                        }
                    }
                }
            }
        }

    } catch (err) {
        console.error(err);
    } finally {
        await client.close();
    }
}

run();
