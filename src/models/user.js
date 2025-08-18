// src/models/user.js
import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
    discordId: { type: String, required: true, unique: true },
    vpgUsername: { type: String, default: null },
    primaryPosition: { type: String, default: null },
    secondaryPosition: { type: String, default: null },
    twitterHandle: { type: String, default: null },
    // --- NUEVOS CAMPOS AÑADIDOS ---
    psnId: { type: String, default: null },
    eaId: { type: String, default: null },
    // --- FIN DE NUEVOS CAMPOS ---
    teamName: { type: String, default: null },
    teamLogoUrl: { type: String, default: null },
    isManager: { type: Boolean, default: false },
    lastUpdated: { type: Date, default: Date.now },
});

export default mongoose.model('VPGUser', userSchema, 'vpg_users');
