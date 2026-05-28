import dns from 'dns';
dns.setServers(['8.8.8.8']); // Google DNS for Mongo srv

import { MongoClient } from 'mongodb';
import fetch from 'node-fetch';
import dotenv from 'dotenv';
dotenv.config();

const HEADERS = {
    'User-Agent': 'VPG/1.0.0 (iPhone; iOS 15.0; Scale/3.00)',
    'Accept': 'application/json',
};

async function run() {
    const client = await MongoClient.connect(process.env.DATABASE_URL);
    const db = client.db('tournamentBotDb');

    console.log('=== BUSCANDO EN BASE DE DATOS ===');
    const players = await db.collection('player_profiles').find({
        $or: [
            { eaPlayerName: /sati/i },
            { "vpgProfile.username": /sati/i }
        ]
    }).toArray();
    console.log('Matches in player_profiles:', players.map(p => ({
        eaPlayerName: p.eaPlayerName,
        vpgLeagueSlug: p.vpgLeagueSlug,
        vpgTeamSlug: p.vpgTeamSlug
    })));
    const player = players[0];

    if (!player) {
        console.log('No se encontró a Satiiita03 en la base de datos.');
        await client.close();
        return;
    }

    console.log('Jugador en DB:', {
        eaPlayerName: player.eaPlayerName,
        vpgLeagueSlug: player.vpgLeagueSlug,
        vpgTeamSlug: player.vpgTeamSlug,
        lastPosition: player.lastPosition,
        dbPoints: player.stats?.vpgPoints || 0,
        dbMatchesPlayed: player.stats?.matchesPlayed || 0,
        dbGoals: player.stats?.goals || 0,
        dbAssists: player.stats?.assists || 0
    });

    console.log('\n=== CONSULTANDO API DE VPG ===');
    const userUrl = `https://api.virtualprogaming.com/public/users/${encodeURIComponent(player.eaPlayerName)}/`;
    console.log('Consultando perfil de VPG:', userUrl);
    try {
        const res = await fetch(userUrl, { headers: HEADERS });
        if (res.ok) {
            const vpgData = await res.json();
            console.log('VPG Profile Data:', JSON.stringify(vpgData, null, 2));
        } else {
            console.log('Error VPG Profile API:', res.status, res.statusText);
        }
    } catch (e) {
        console.error('VPG Profile Fetch Error:', e.message);
    }

    console.log('\n=== CONSULTANDO CONTRATOS EN VPG ===');
    const contractsUrl = `https://api.virtualprogaming.com/public/users/${encodeURIComponent(player.eaPlayerName)}/contracts/`;
    console.log('Consultando contratos:', contractsUrl);
    try {
        const res = await fetch(contractsUrl, { headers: HEADERS });
        if (res.ok) {
            const contracts = await res.json();
            console.log('VPG Contracts:', JSON.stringify(contracts, null, 2));
        } else {
            console.log('Error VPG Contracts API:', res.status, res.statusText);
        }
    } catch (e) {
        console.error('VPG Contracts Fetch Error:', e.message);
    }

    // Let's also check if she is in the leaderboard of her league
    const leagueSlug = player.vpgLeagueSlug;
    if (leagueSlug) {
        console.log(`\n=== BUSCANDO EN LEADERBOARD DE VPG PARA LIGA ${leagueSlug} ===`);
        // We will try to fetch the leaderboard for MCD/CAM/CDM/etc to see where she is
        // Let's check top_strikers:
        const leaderboardUrl = `https://api.virtualprogaming.com/public/leagues/${leagueSlug}/leaderboard?leaderboard=top_strikers&type=all&limit=100`;
        try {
            const res = await fetch(leaderboardUrl, { headers: HEADERS });
            if (res.ok) {
                const data = await res.json();
                const playersList = data.data || [];
                const found = playersList.find(p => p.username?.toLowerCase() === player.eaPlayerName.toLowerCase());
                if (found) {
                    console.log('Encontrada en top_cdm:', found);
                } else {
                    console.log('No encontrada en top_cdm.');
                }
            }
        } catch (e) {
            console.error(e.message);
        }
    }

    await client.close();
}

run().catch(console.error);
