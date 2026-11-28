#!/bin/bash
# Menjadwalkan pembaruan database mingguan di macOS (launchd). Hanya menulis ke ~/Library/LaunchAgents dan data/logs di proyek ini.
#   bash scripts/schedule-mac.sh install   # Senin 06:30; bila Mac tidur, dijalankan saat bangun
#   bash scripts/schedule-mac.sh status | run-now | remove
set -euo pipefail
LABEL="id.unhas.fkm.journal-assessment.dbupdate"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
PROJ="$(cd "$(dirname "$0")/.." && pwd)"
LOG="$PROJ/data/logs/db-update.log"
case "${1:-}" in
  install)
    command -v npm >/dev/null || { echo "npm tidak ditemukan di PATH"; exit 1; }
    NPM_DIR="$(dirname "$(command -v npm)")"
    mkdir -p "$PROJ/data/logs" "$PROJ/data/inbox/scopus" "$HOME/Library/LaunchAgents"
    cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key><array><string>/bin/bash</string><string>-lc</string><string>export PATH="$NPM_DIR:\$PATH"; cd "$PROJ" &amp;&amp; npm run db:update &gt;&gt; "$LOG" 2&gt;&amp;1</string></array>
  <key>StartCalendarInterval</key><dict><key>Weekday</key><integer>1</integer><key>Hour</key><integer>6</integer><key>Minute</key><integer>30</integer></dict>
  <key>RunAtLoad</key><false/>
</dict></plist>
EOF
    launchctl unload "$PLIST" 2>/dev/null || true
    launchctl load "$PLIST"
    echo "Terpasang: setiap Senin 06:30. Log: $LOG"
    echo "Folder Scopus: $PROJ/data/inbox/scopus (letakkan berkas .xlsx baru di sana)";;
  status) launchctl list | grep "$LABEL" || echo "Belum terpasang"; [ -f "$LOG" ] && tail -n 15 "$LOG" || echo "Belum ada log";;
  run-now) launchctl start "$LABEL" && echo "Dimulai; lihat $LOG";;
  remove) launchctl unload "$PLIST" 2>/dev/null || true; [ -f "$PLIST" ] && mv "$PLIST" "$PLIST.removed"; echo "Jadwal dihapus (berkas plist diganti nama menjadi .removed)";;
  *) echo "Pemakaian: bash scripts/schedule-mac.sh install|status|run-now|remove"; exit 2;;
esac
