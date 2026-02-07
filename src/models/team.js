// src/models/team.js
import mongoose from 'mongoose';

const teamSchema = new mongoose.Schema({
    name: { type: String, required: true, unique: true },
    abbreviation: { type: String, required: true },
    guildId: { type: String, required: true },
    league: { type: String, required: true },
    logoUrl: { type: String, required: true },
    twitterHandle: { type: String, default: null },
    managerId: { type: String, unique: true, sparse: true },
    captains: [{ type: String }],
    players: [{ type: String }],
    // AÑADE LA SIGUIENTE LÍNEA AQUÍ
    recruitmentOpen: { type: Boolean, default: true }
});

export default mongoose.models.Team || mongoose.model('Team', teamSchema, 'teams');
