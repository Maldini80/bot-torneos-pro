// src/models/league.js
import mongoose from 'mongoose';

const leagueSchema = new mongoose.Schema({
    name: { type: String, required: true, unique: true },
    guildId: { type: String, required: true },
});

module.exports = mongoose.model('League', leagueSchema);
