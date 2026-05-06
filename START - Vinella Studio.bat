@echo off
title Vinella Content Studio
echo.
echo   Vinella Content Studio startet...
echo.

:: Prüfe ob Node.js installiert ist
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo FEHLER: Node.js ist nicht installiert!
    echo Bitte nodejs.org besuchen und LTS installieren.
    pause
    exit
)

:: Prüfe ob .env existiert
if not exist ".env" (
    echo FEHLER: .env Datei nicht gefunden!
    echo Bitte .env.example umbenennen zu .env und API-Key eintragen.
    pause
    exit
)

:: Installiere Dependencies falls node_modules fehlt
if not exist "node_modules" (
    echo Installiere Abhängigkeiten - bitte warten...
    npm install
    echo.
)

:: Öffne Browser automatisch nach 2 Sekunden
start "" timeout /t 2 >nul & start "" "http://localhost:3747"

:: Starte Server
echo   Browser öffnet sich automatisch...
echo   Dieses Fenster offen lassen!
echo   Zum Beenden: Fenster schliessen
echo.
node server.js
pause
