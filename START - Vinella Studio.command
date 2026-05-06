#!/bin/bash
cd "$(dirname "$0")"

echo ""
echo "  🍇 Vinella Content Studio startet..."
echo ""

# Prüfe Node.js
if ! command -v node &> /dev/null; then
    osascript -e 'display alert "Node.js fehlt" message "Bitte nodejs.org besuchen und LTS installieren."'
    exit 1
fi

# Prüfe .env
if [ ! -f ".env" ]; then
    osascript -e 'display alert "Kein API-Key" message "Bitte .env.example umbenennen zu .env und deinen Anthropic API-Key eintragen."'
    exit 1
fi

# Installiere Dependencies falls nötig
if [ ! -d "node_modules" ]; then
    echo "  Installiere Abhängigkeiten..."
    npm install
fi

# Browser nach 2 Sekunden öffnen
sleep 2 && open "http://localhost:3747" &

echo "  Browser öffnet sich automatisch..."
echo "  Dieses Fenster offen lassen!"
echo "  Zum Beenden: Fenster schliessen"
echo ""

node server.js
