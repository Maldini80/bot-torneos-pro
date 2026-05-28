import { ObjectId } from 'mongodb';

const id = "6a10abe66bb40cd90498cca8";
const timestamp = new ObjectId(id).getTimestamp();
console.log(`jam esports created at: ${timestamp.toISOString()} (Local: ${timestamp.toLocaleString()})`);
