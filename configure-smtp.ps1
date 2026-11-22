$ErrorActionPreference = "Stop"

function Read-RequiredValue {
    param([string]$Prompt)
    while ($true) {
        $value = (Read-Host $Prompt).Trim()
        if ($value) { return $value }
        Write-Host "Cette valeur est obligatoire." -ForegroundColor Yellow
    }
}

function ConvertTo-EnvValue {
    param([string]$Value)
    if ($Value.Contains("`r") -or $Value.Contains("`n")) {
        throw "Les valeurs SMTP ne doivent pas contenir de retour à la ligne."
    }
    return '"' + $Value.Replace('\', '\\').Replace('"', '\"') + '"'
}

$projectDirectory = $PSScriptRoot
$envPath = Join-Path $projectDirectory ".env"

Write-Host "Configuration du serveur d'e-mail CTC" -ForegroundColor Cyan
Write-Host "Le mot de passe SMTP sera demandé sans être affiché."
Write-Host "Utilisez un mot de passe d'application SMTP, pas le mot de passe de votre boîte mail."
Write-Host ""

$hostName = (Read-Host "Hôte SMTP [smtp.gmail.com]").Trim()
if (-not $hostName) { $hostName = "smtp.gmail.com" }
$portText = Read-Host "Port SMTP [587]"
if (-not $portText) { $portText = "587" }
$port = 0
if (-not [int]::TryParse($portText, [ref]$port) -or $port -lt 1 -or $port -gt 65535) {
    throw "Le port SMTP doit être compris entre 1 et 65535."
}

$smtpUser = Read-RequiredValue "Adresse Gmail utilisée pour SMTP"
$smtpPassword = ""
if ($smtpUser -notmatch '^[^@\s]+@[^@\s]+\.[^@\s]+$') { throw "Saisissez une adresse Gmail valide." }
$securePassword = Read-Host "Mot de passe d'application Google (saisie masquée)" -AsSecureString
$credential = New-Object System.Management.Automation.PSCredential("smtp", $securePassword)
$smtpPassword = $credential.GetNetworkCredential().Password
if ($hostName -ieq "smtp.gmail.com") { $smtpPassword = $smtpPassword -replace '\s', '' }
if (-not $smtpPassword) { throw "Le mot de passe d'application ne peut pas être vide." }

$defaultFromAddress = "CTC <$smtpUser>"
$fromAddress = (Read-Host "Adresse d'expédition [$defaultFromAddress]").Trim()
if (-not $fromAddress) { $fromAddress = $defaultFromAddress }
$defaultAppUrl = "http://localhost:3000"
$appUrl = (Read-Host "URL de l'application [$defaultAppUrl]").Trim()
if (-not $appUrl) { $appUrl = $defaultAppUrl }
$parsedUrl = $null
if (-not [Uri]::TryCreate($appUrl, [UriKind]::Absolute, [ref]$parsedUrl) -or $parsedUrl.Scheme -notin @("http", "https")) {
    throw "APP_URL doit être une URL absolue HTTP ou HTTPS."
}
$isLocal = $parsedUrl.Host -in @("localhost", "127.0.0.1", "::1")
if ($parsedUrl.Scheme -ne "https" -and -not $isLocal) {
    throw "L'URL publique doit utiliser HTTPS. HTTP est accepté uniquement pour localhost."
}

$secureDirect = $port -eq 465
$values = [ordered]@{
    SMTP_HOST   = $hostName
    SMTP_PORT   = [string]$port
    SMTP_SECURE = if ($secureDirect) { "true" } else { "false" }
    SMTP_USER   = $smtpUser
    SMTP_PASS   = $smtpPassword
    SMTP_FROM   = $fromAddress
    APP_URL     = $appUrl.TrimEnd("/")
}

$existingLines = @()
if (Test-Path -LiteralPath $envPath) {
    $keys = ($values.Keys | ForEach-Object { [Regex]::Escape($_) }) -join "|"
    $existingLines = @(Get-Content -LiteralPath $envPath | Where-Object { $_ -notmatch "^\s*(?:$keys)\s*=" })
    while ($existingLines.Count -gt 0 -and -not $existingLines[-1]) {
        $existingLines = @($existingLines | Select-Object -First ($existingLines.Count - 1))
    }
}

$lines = @($existingLines)
foreach ($key in $values.Keys) {
    $lines += "$key=$(ConvertTo-EnvValue ([string]$values[$key]))"
}
[System.IO.File]::WriteAllText($envPath, ($lines -join [Environment]::NewLine) + [Environment]::NewLine, (New-Object System.Text.UTF8Encoding($false)))

try {
    $identity = "$env:USERDOMAIN\$env:USERNAME"
    & icacls.exe $envPath /inheritance:r /grant:r "${identity}:(R,W)" | Out-Null
    if ($LASTEXITCODE -ne 0) { Write-Warning "Les permissions du fichier .env n'ont pas pu être restreintes automatiquement." }
} catch {
    Write-Warning "Impossible de restreindre automatiquement les permissions du fichier .env."
}

Write-Host ""
Write-Host "Configuration enregistrée dans .env (le mot de passe n'a pas été affiché)." -ForegroundColor Green
Write-Host "Redémarrez le serveur avec npm start pour activer la récupération."
if ($isLocal) {
    Write-Warning "APP_URL pointe sur localhost : les liens de récupération ne fonctionneront que sur cet ordinateur. Pour vos utilisateurs, saisissez l'URL HTTPS publique."
} else {
    Write-Warning "Ce fichier .env configure uniquement une exécution locale. Configurez aussi les mêmes variables dans le tableau de bord de votre hébergeur pour activer l'envoi sur le serveur en ligne."
}
