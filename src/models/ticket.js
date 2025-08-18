// src/models/ticket.js
import mongoose from 'mongoose';

const ticketSchema = new mongoose.Schema({
    userId: { type: String, required: true },
    channelId: { type: String, required: true, unique: true },
    guildId: { type: String, required: true },
    status: { type: String, default: 'open', enum: ['open', 'claimed', 'closed'] },
    claimedBy: { type: String, default: null },
    createdAt: { type: Date, default: Date.now },
    closedAt: { type: Date, default: null },
    
    // --- LÍNEA AÑADIDA ---
    logMessageId: { type: String, default: null },
});

export default mongoose.model('Ticket', ticketSchema);
