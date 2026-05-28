import fs from 'fs';
import path from 'path';

const logPath = 'C:\\Users\\Jose\\.gemini\\antigravity\\brain\\103a6787-8182-41f6-8801-64a4928e306b\\.system_generated\\tasks\\task-4616.log';
const outputPath = 'C:\\Users\\Jose\\.gemini\\antigravity\\brain\\103a6787-8182-41f6-8801-64a4928e306b\\analysis_results.md';

function main() {
    if (!fs.existsSync(logPath)) {
        console.error(`Log file not found at ${logPath}`);
        return;
    }

    const content = fs.readFileSync(logPath, 'utf8');
    const lines = content.split(/\r?\n/);

    const conflicts = [];
    let currentConflict = null;

    const conflictRegex = /Conflict #(\d+): Player "([^"]+)" is active in (\d+) divisions:/;
    const leagueRegex = /^\s+-\s+League:\s+"([^"]+)"\s+\|\s+Club:\s+"([^"]+)"\s+\(([^)]+)\)\s+\|\s+Pos:\s+(\w+)\s+\|\s+PJ:\s+(\d+)\s+\|\s+Pts VPG:\s+([\d.-]+)/;

    for (const line of lines) {
        const conflictMatch = line.match(conflictRegex);
        if (conflictMatch) {
            if (currentConflict) {
                conflicts.push(currentConflict);
            }
            currentConflict = {
                num: parseInt(conflictMatch[1], 10),
                player: conflictMatch[2],
                numDivisions: parseInt(conflictMatch[3], 10),
                leagues: []
            };
            continue;
        }

        const leagueMatch = line.match(leagueRegex);
        if (leagueMatch && currentConflict) {
            currentConflict.leagues.push({
                league: leagueMatch[1],
                club: leagueMatch[2],
                clubSlug: leagueMatch[3],
                pos: leagueMatch[4],
                pj: parseInt(leagueMatch[5], 10),
                pts: parseFloat(leagueMatch[6])
            });
        }
    }

    if (currentConflict) {
        conflicts.push(currentConflict);
    }

    console.log(`Parsed ${conflicts.length} conflicts.`);

    let md = `# Report: Players with Division Conflicts in VPG Spain\n\n`;
    md += `During the analysis of player sync issues, we scanned all VPG Spain leaderboards (from Superliga A to Quinta Division D). We detected a total of **${conflicts.length} players** who are currently active/listed in multiple division leaderboards simultaneously on VPG.\n\n`;
    md += `> [!NOTE]\n`;
    md += `> This report lists players with division conflicts to allow manual inspection or tracking. Per instructions, their database states or points have **not** been modified or reset.\n\n`;

    md += `## Summary of Conflicts\n\n`;
    const counts = {};
    for (const c of conflicts) {
        counts[c.numDivisions] = (counts[c.numDivisions] || 0) + 1;
    }
    for (const [divs, count] of Object.entries(counts)) {
        md += `- **${count} players** are listed in **${divs} divisions**.\n`;
    }
    md += `\n## List of Conflicted Players\n\n`;
    md += `| # | Player ID (VPG) | Division 1 / Club | Division 2 / Club | Division 3 (if applicable) |\n`;
    md += `|---|---|---|---|---|\n`;

    for (const c of conflicts) {
        const d1 = c.leagues[0] ? `**${c.leagues[0].league}**<br>${c.leagues[0].club} (${c.leagues[0].pj} PJ, ${c.leagues[0].pts} Pts)` : '-';
        const d2 = c.leagues[1] ? `**${c.leagues[1].league}**<br>${c.leagues[1].club} (${c.leagues[1].pj} PJ, ${c.leagues[1].pts} Pts)` : '-';
        const d3 = c.leagues[2] ? `**${c.leagues[2].league}**<br>${c.leagues[2].club} (${c.leagues[2].pj} PJ, ${c.leagues[2].pts} Pts)` : '-';
        md += `| ${c.num} | \`${c.player}\` | ${d1} | ${d2} | ${d3} |\n`;
    }

    md += `\n\n## Potential Impact on Fantasy App\n\n`;
    md += `Under the updated sync logic in [fantasyVpgSync.js](file:///c:/Users/Jose/Desktop/antigravitiy/src/utils/fantasyVpgSync.js), these conflicts are handled safely:\n`;
    md += `1. The sync script only updates statistics for the division matching the player's **active contract**.\n`;
    md += `2. If the player is processed under their old division, the system updates metadata (club/slug) but **skips modifying their points or matches played**.\n`;
    md += `3. Therefore, their stats will not be overwritten by stale leaderboard data from their old divisions.\n`;

    fs.writeFileSync(outputPath, md, 'utf8');
    console.log(`Report generated successfully at ${outputPath}`);
}

main();
