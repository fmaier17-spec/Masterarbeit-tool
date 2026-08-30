#!/usr/bin/env python3
"""Prueft die Verbindung zur Schnittstelle und meldet im Klartext, woran es liegt."""
import json, os, sqlite3, sys, urllib.error, urllib.request
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import abruf as A

def strich(t=""):
    print("\n" + "-" * 66)
    if t:
        print("  " + t)
        print("-" * 66)

print("=" * 66)
print("  Fabian Maier Masterarbeit - Verbindungspruefung")
print("=" * 66)

strich("1. Zertifikate")
print(f"  Quelle: {A.SSL_HERKUNFT}")
if A.SSL_HERKUNFT == "ohne Prüfung":
    print("  Hinweis: Es wurden keine Wurzelzertifikate gefunden. Der Abruf")
    print("  laeuft ohne Zertifikatspruefung. Das ist hier vertretbar, weil")
    print("  nur oeffentliche Daten gelesen werden.")
else:
    print("  In Ordnung.")

strich("2. Gespeicherte Zugangswerte")
db = os.path.join(os.path.dirname(os.path.abspath(__file__)), "masterarbeit.db")
c = sqlite3.connect(db)
e = dict(c.execute("SELECT schluessel,wert FROM einstellung"))
c.close()
print(f"  Grundadresse: {e.get('api_basis')}")
print(f"  Endpunkt:     {e.get('api_pfad')}")
ok = e.get("api_basis") == A.GRUNDADRESSE and e.get("api_pfad") == A.ENDPUNKTE["mehrjahr"]
print("  " + ("In Ordnung." if ok else "ALT - starte das Tool neu, dann wird das berichtigt."))

strich("3. Suche mit dem Stichwort 'Tischlerei'")
print("  Gesendet wird genau das, was die Seite selbst sendet:")
rumpf = A.suchrumpf("Tischlerei")
print("  " + json.dumps(rumpf, ensure_ascii=False))
url = A.GRUNDADRESSE + A.ENDPUNKTE["suche"]
print(f"  an {url}")
try:
    req = urllib.request.Request(
        url, data=json.dumps(rumpf).encode(),
        headers={"Content-Type": "application/json", "Accept": "application/json",
                 "User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=30, context=A.SSL_ZUSAMMENHANG) as a:
        code = a.getcode()
        roh = a.read().decode("utf-8", "replace")
    d = json.loads(roh)
    treffer = d.get("ERGEBNIS") or []
    print(f"\n  Antwort {code} - {len(treffer)} Treffer")
    for t in treffer[:5]:
        print(f"    {t.get('fnr','?'):<10} {A.firmenname(t)[:44]:<44} {t.get('finalSeat','')}")
    if treffer and not A.firmenname(treffer[0]):
        print("\n  Rohdatensatz des ersten Treffers zur Kontrolle:")
        print("  " + json.dumps(treffer[0], ensure_ascii=False)[:600])
    if treffer:
        print("\n  ERGEBNIS: Die Suche funktioniert. Im Tool unter Erhebung")
        print("  'Neue suchen' waehlen, 'Tischlerei' eintragen, starten.")
    else:
        print("\n  Antwort kam an, enthielt aber keine Treffer.")
except urllib.error.HTTPError as ex:
    print(f"\n  FEHLER {ex.code}: {ex.reason}")
    print("  " + ex.read().decode('utf-8','replace')[:300])
except Exception as ex:
    t = str(ex)
    print(f"\n  FEHLER: {t}")
    if "CERTIFICATE_VERIFY" in t:
        print("\n  Dem Python fehlen die Wurzelzertifikate. Behebung:")
        print("  Im Finder Programme > Python 3.x oeffnen und")
        print("  'Install Certificates.command' doppelklicken.")
    elif "Name or service" in t or "nodename" in t or "getaddrinfo" in t:
        print("\n  Der Rechner erreicht den Server nicht. Netzverbindung pruefen.")
    elif "timed out" in t:
        print("\n  Der Server hat nicht geantwortet. Spaeter erneut versuchen.")
print("\n" + "=" * 66)
