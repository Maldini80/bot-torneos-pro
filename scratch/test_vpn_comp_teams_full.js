import fetch from 'node-fetch';

async function main() {
    try {
        const res = await fetch("https://www.virtualpronetwork.com/api/competitions/52");
        const data = await res.json();
        
        console.log("leagues_groups_teams length:", data.leagues_groups_teams ? data.leagues_groups_teams.length : 'none');
        if (data.leagues_groups_teams && data.leagues_groups_teams.length > 0) {
            console.log("leagues_groups_teams sample (first 3):", JSON.stringify(data.leagues_groups_teams.slice(0, 3), null, 2));
        }

        console.log("leagues_groups_managers length:", data.leagues_groups_managers ? data.leagues_groups_managers.length : 'none');
        if (data.leagues_groups_managers && data.leagues_groups_managers.length > 0) {
            console.log("leagues_groups_managers sample (first 3):", JSON.stringify(data.leagues_groups_managers.slice(0, 3), null, 2));
        }
    } catch (e) {
        console.error("Error:", e);
    }
}

main();
