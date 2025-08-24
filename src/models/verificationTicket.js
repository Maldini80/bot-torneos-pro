// src/models/verificationTicket.js
import mongoose from 'mongoose';

const verificationTicketSchema = new mongoose.Schema({
    userId: { type: String, required: true, unique: true },
    guildId: { type: String, required: true },
    channelId: { type: String, required: true, unique: true },
    platform: { type: String, required: true },
    gameId: { type: String, required: true },
    twitter: { type: String, required: true },
    uniqueCode: { type: String, required: true },
    status: { type: String, default: 'pending', enum: ['pending', 'claimed', 'closed'] },
    claimedBy: { type: String, default: null },
}, { timestamps: true });

// Índice para asegurar que un usuario solo tenga un ticket abierto a la vez.
verificationTicketSchema.index({ userId: 1, status: 1 }, { unique: true, partialFilterExpression: { status: { $in: ['pending', 'claimed'] } } });


export default mongoose.model('VerificationTicket', verificationTicketSchema);
