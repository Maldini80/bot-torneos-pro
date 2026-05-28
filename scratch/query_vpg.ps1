[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$league = "superliga-spain-a"
$teamSlug = "JAM-ES"
$leaderboards = @("top_gk", "top_cb", "top_fb", "top_cdm", "top_cam", "top_wingers", "top_strikers")
$userAgent = "VPG/1.0.0 (iPhone; iOS 15.0; Scale/3.00)"

Write-Output "Buscando jugadores del club $teamSlug en $league..."

$foundPlayers = @()

foreach ($lb in $leaderboards) {
    $offset = 0
    $hasMore = $true
    
    while ($hasMore) {
        $url = "https://api.virtualprogaming.com/public/leagues/$league/leaderboard/?leaderboard=$lb&type=all&limit=50&offset=$offset"
        try {
            $res = Invoke-RestMethod -Uri $url -Headers @{"User-Agent"=$userAgent}
            $players = @()
            if ($res.data) { $players = $res.data }
            elseif ($res -is [System.Array]) { $players = $res }
            
            if ($players.Count -lt 50) {
                $hasMore = $false
            }
            
            $teamPlayers = $players | Where-Object { $_.team_slug -eq $teamSlug }
            if ($teamPlayers) {
                foreach ($tp in $teamPlayers) {
                    $foundPlayers += [PSCustomObject]@{
                        Username = $tp.username
                        Posicion = $tp.position_name
                        Leaderboard = $lb
                        PJ = $tp.matches_played
                        Goles = $tp.goals
                        Asistencias = $tp.assists
                        Puntos = $tp.points
                    }
                }
            }
        } catch {
            $hasMore = $false
        }
        
        $offset += 50
        if ($offset -ge 1200) { $hasMore = $false }
    }
}

if ($foundPlayers.Count -gt 0) {
    Write-Output "🎉 Se encontraron $($foundPlayers.Count) jugadores de JAM ESPORTS en los leaderboards:"
    $foundPlayers | Format-Table -AutoSize
} else {
    Write-Output "No se encontro ningun jugador de JAM ESPORTS en los leaderboards de $league."
}
