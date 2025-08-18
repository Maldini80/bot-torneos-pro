// src/models/teamChatChannel.js
import mongoose from 'mongoose';

const teamChatChannelSchema = new mongoose.Schema({
    channelId: { type: String, required: true, unique: true },
    guildId: { type: String, required: true },
});

export default mongoose.model('TeamChatChannel', teamChatChannelSchema);
