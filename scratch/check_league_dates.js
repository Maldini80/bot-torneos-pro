import { ObjectId } from 'mongodb';

const leagues = [
    { name: "Juncazo League", id: "6a148ebb081e5b79d9a94733" },
    { name: "Evasion", id: "6a1558590ba0654c6c687628" },
    { name: "Fantasy UDLP #1", id: "6a15629c0ba0654c6c68764b" },
    { name: "FANTASY ICONS", id: "6a1567410ba0654c6c687660" },
    { name: "Icons team", id: "6a156d230ba0654c6c687678" },
    { name: "Superfantasy Icons", id: "6a156f070ba0654c6c687680" },
    { name: "SANTAMARIA LEAGUE", id: "6a1574c90ba0654c6c6876c3" },
    { name: "Cosas", id: "6a1576430ba0654c6c6876cb" },
    { name: "RUDOS CD", id: "6a15769d0ba0654c6c6876ce" },
    { name: "187 Picantes", id: "6a158eda0ba0654c6c68776a" },
    { name: "CULONES", id: "6a158f6e0ba0654c6c68776d" },
    { name: "ByCulones", id: "6a1591170ba0654c6c687771" },
    { name: "Vishi", id: "6a1592eb0ba0654c6c687786" },
    { name: "MONDONGO CUP", id: "6a159f150ba0654c6c6877dd" }
];

console.log("=== LEAGUE CREATION TIMESTAMPS ===");
leagues.forEach(l => {
    const timestamp = new ObjectId(l.id).getTimestamp();
    console.log(`- ${l.name}: ${timestamp.toISOString()} (Local time: ${timestamp.toLocaleString()})`);
});
