// src/models/teamChatChannel.js


const teamChatChannelSchema = new mongoose.Schema({
    channelId: { type: String, required: true, unique: true },
    guildId: { type: String, required: true },
});

module.exports = mongoose.model('TeamChatChannel', teamChatChannelSchema);
