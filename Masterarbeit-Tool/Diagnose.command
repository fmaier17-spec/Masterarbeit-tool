#!/bin/bash
cd "$(dirname "$0")"
clear
python3 diagnose.py
echo ""
read -p "Zum Schliessen die Eingabetaste druecken."
