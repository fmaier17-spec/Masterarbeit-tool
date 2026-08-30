#!/bin/bash
# Doppelklick startet das Werkzeug und oeffnet die Oberflaeche im Browser.
cd "$(dirname "$0")" || exit 1

if command -v python3 >/dev/null 2>&1; then
  PY=python3
elif command -v python >/dev/null 2>&1; then
  PY=python
else
  echo
  echo "  Python 3 wurde nicht gefunden."
  echo "  Unter macOS laesst es sich mit  xcode-select --install  nachruesten,"
  echo "  alternativ ueber python.org."
  echo
  read -r -p "  Mit der Eingabetaste schliessen "
  exit 1
fi

clear
exec "$PY" app.py
