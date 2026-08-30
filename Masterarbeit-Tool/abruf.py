"""Abrufmodul fuer offengelegte Jahresabschluesse.

Zwei Betriebsarten:

  live    ruft die Schnittstelle von openfirmenbuch.at ab und schreibt jeden
          Einzelwert samt Rohbezeichnung, Rohwert und Abrufzeitpunkt in den
          Herkunftsnachweis.

  probe   spielt den gespeicherten Bestand in derselben Verarbeitungskette
          erneut ab. Gedacht fuer Vorfuehrungen ohne Netzverbindung und um
          die Verarbeitung nachvollziehbar zu zeigen, ohne die Schnittstelle
          zu belasten.

Der Bezug zwischen den Rohbezeichnungen der Quelle und den Feldern des
Datenmodells ist unten festgehalten. Er stammt aus dem Herkunftsnachweis der
Erhebung vom 5. August 2026 und ist damit fuer jeden Wert der Arbeit belegt.
"""
import json, random, socket, sqlite3, ssl, threading, time
import urllib.error, urllib.parse, urllib.request
from datetime import datetime


def _ssl_zusammenhang():
    """Zertifikatspruefung einrichten.

    Auf macOS bringt Python keine Wurzelzertifikate mit, solange
    'Install Certificates.command' nicht ausgefuehrt wurde. Dann scheitert jede
    HTTPS-Verbindung mit CERTIFICATE_VERIFY_FAILED. Der Reihe nach werden
    versucht: die Zertifikate des Systems, das Buendel von certifi, zuletzt eine
    Verbindung ohne Pruefung. Der letzte Weg ist vertretbar, weil ausschliesslich
    oeffentliche, lesende Abfragen erfolgen und keine Zugangsdaten uebertragen
    werden. Er wird im Protokoll ausgewiesen.
    """
    try:
        k = ssl.create_default_context()
        if k.get_ca_certs():
            return k, "System"
    except Exception:
        pass
    try:
        import certifi
        return ssl.create_default_context(cafile=certifi.where()), "certifi"
    except Exception:
        pass
    for pfad in ("/etc/ssl/cert.pem", "/usr/local/etc/openssl/cert.pem",
                 "/opt/homebrew/etc/openssl@3/cert.pem"):
        try:
            import os
            if os.path.exists(pfad):
                return ssl.create_default_context(cafile=pfad), pfad
        except Exception:
            pass
    k = ssl.create_default_context()
    k.check_hostname = False
    k.verify_mode = ssl.CERT_NONE
    return k, "ohne Prüfung"


SSL_ZUSAMMENHANG, SSL_HERKUNFT = _ssl_zusammenhang()

# Rohbezeichnung der Quelle  ->  Feld im Datenmodell
FELDBEZUG = {
    "rechnungsabgrenzungen": "aktive_rap",
    "anlageVermoegen": "anlagevermoegen",
    "bilanzSumme": "bilanzsumme",
    "eigenkapital": "eigenkapital",
    "finanzanlagen": "finanzanlagen",
    "forderungen": "forderungen",
    "gewinnruecklagen": "gewinnruecklagen",
    "immaterielleVermoegensgegenstaende": "immaterielle_vermoegenswerte",
    "kurzfristigeVerbindlichkeiten": "kfr_verbindlichkeiten",
    "langfristigeVerbindlichkeiten": "lfr_verbindlichkeiten",
    "liquidesVermoegen": "liquide_mittel",
    "passiveRechnungsabgrenzungen": "passive_rap",
    "rueckstellungen": "rueckstellungen",
    "sachanlagen": "sachanlagen",
    "umlaufvermoegen": "umlaufvermoegen",
    "verbindlichkeiten": "verbindlichkeiten",
    "vorraete": "vorraete",
    "umsatzerloese": "umsatzerloese",
    "betriebsErfolg": "ebit",
    "ergebnisVorSteuern": "ergebnis_vor_steuern",
    "jahresueberschuss": "jahresueberschuss",
    "personalaufwand": "personalaufwand",
    "warenUndMaterialeinkauf": "materialaufwand",
    "abschreibungen": "abschreibungen",
    "zinsenUndAehnlicheAufwendungen": "zinsaufwand",
    "finanzerfolg": "finanzergebnis",
    "sonstigeBetrieblicheErtraege": "sonstige_betriebliche_ertraege",
    "sonstigeBetrieblicheAufwendungen": "sonstige_betriebliche_aufwendungen",
    "bestandsveraenderung": "bestandsveraenderung",
}
GUV_FELDER = {"umsatzerloese", "ebit", "ergebnis_vor_steuern", "jahresueberschuss",
              "personalaufwand", "materialaufwand", "abschreibungen", "zinsaufwand",
              "finanzergebnis", "sonstige_betriebliche_ertraege",
              "sonstige_betriebliche_aufwendungen", "bestandsveraenderung"}

# Verifizierte Zugriffsendpunkte laut Tabelle 1 der Arbeit. Sämtlich POST.
ENDPUNKTE = {
    "suche":     "/firmenbuch/suche/firma/compressed",
    "auszug":    "/firmenbuch/auszug",
    "urkunden":  "/firmenbuch/suche/urkunde",
    "mehrjahr":  "/firmenbuch/urkunde/daten/multiple",
}
# Unter welchem Schluessel die Firmenbuchnummer im Rumpf erwartet wird, ist
# nicht dokumentiert. Der Abruf probiert die gebraeuchlichen Namen der Reihe nach.
# Ausgelesen aus den Netzanfragen der Seite: die Schnittstelle erwartet
# grossgeschriebene Schluessel und liegt auf api.openfirmenbuch.at.
NUMMER_SCHLUESSEL = ("FNR", "firmenbuchnummer", "fnr", "firmenbuchNummer", "nummer")
GRUNDADRESSE = "https://api.openfirmenbuch.at"

def suchrumpf(begriff):
    """Rumpf der Firmensuche, wie ihn die Seite selbst sendet.
    Das Sternchen wirkt als Platzhalter am Wortende."""
    b = str(begriff).strip()
    return {"FIRMENWORTLAUT": b if b.endswith("*") else b + "*",
            "EXAKTESUCHE": True, "SUCHBEREICH": 3,
            "GERICHT": "", "RECHTSFORM": "", "RECHTSEIGENSCHAFT": "", "ORTNR": ""}

# Branchentypische Suchbegriffe. Sie entsprechen der regelbasierten Zuordnung
# ueber den Firmenwortlaut, die die Arbeit mangels OeNACE-Kennung verwendet.
BRANCHENBEGRIFFE = {
    "Bau": ["Bau", "Hochbau", "Tiefbau", "Baumeister", "Installateur", "Dachdecker",
            "Elektro", "Maler", "Zimmerei", "Spengler"],
    "Handel": ["Handel", "Handels", "Vertrieb", "Markt", "Warenhandel", "Grosshandel",
               "Einzelhandel", "Kfz"],
    "Transport": ["Transport", "Logistik", "Spedition", "Fraechterei", "Taxi",
                  "Autobus", "Kurier", "Fuhrunternehmen"],
    "Gastronomie": ["Gastronomie", "Gasthaus", "Restaurant", "Hotel", "Cafe", "Bar",
                    "Pizzeria", "Wirtshaus", "Beherbergung", "Buffet"],
    "Unternehmensberatung": ["Unternehmensberatung", "Consulting", "Beratung",
                             "Managementberatung", "Beratungs"],
}

STAMM_BEZUG = {"firmenwortlaut": "name", "name": "name", "sitz": "sitz", "ort": "sitz",
               "rechtsform": "rechtsform", "geschaeftszweig": "geschaeftszweig",
               "oenace": "oenace", "oenaceCode": "oenace"}
# Ordnungsmerkmale: keine Bilanzwerte, aber auch nichts Unbekanntes.
KENNFELDER = {"firmenbuchnummer", "fnr", "geschaeftsjahr", "jahr", "bilanzstichtag",
              "stichtag", "periode", "year", "gj", "id", "abrufzeitpunkt", "stand"}


def jetzt():
    return datetime.now().isoformat(timespec="seconds")


def zahl(v):
    """Rohwert der Quelle in eine Zahl ueberfuehren.

    Deutsche und englische Schreibweise werden erkannt. Ein Sonderfall bleibt
    mehrdeutig: Bei einem einzelnen Punkt mit genau drei nachfolgenden Ziffern
    ist "12.000" entweder zwoelftausend oder zwoelf Komma null. Da die Quelle
    Betraege in Euro fuehrt und Nachkommastellen dort zweistellig sind, wird
    dieser Fall als Tausendertrennung gelesen.
    """
    if v is None or isinstance(v, bool):
        return None
    if isinstance(v, (int, float)):
        return float(v)
    s = str(v).strip()
    for weg in (" ", "\u00a0", "\u202f", "\u2009", "EUR", "\u20ac"):
        s = s.replace(weg, "")
    if not s:
        return None
    neg = (s.startswith("(") and s.endswith(")")) or s.startswith("-")
    s = s.strip("()").lstrip("+-")
    if "," in s and "." in s:
        # Das zuletzt stehende Trennzeichen leitet die Nachkommastellen ein.
        s = s.replace(".", "").replace(",", ".") if s.rfind(",") > s.rfind(".") else s.replace(",", "")
    elif "," in s:
        s = s.replace(",", ".")
    elif s.count(".") > 1:
        s = s.replace(".", "")
    elif "." in s:
        vor, _, nach = s.partition(".")
        if len(nach) == 3 and nach.isdigit() and vor.isdigit():
            s = vor + nach
    try:
        f = float(s)
    except ValueError:
        return None
    return -f if neg else f


def flach(obj, praefix=""):
    """Verschachtelte Antworten in flache Schluessel-Wert-Paare aufloesen."""
    aus = {}
    if isinstance(obj, dict):
        for k, v in obj.items():
            if isinstance(v, (dict, list)):
                aus.update(flach(v, k))
            else:
                aus.setdefault(k, v)
    elif isinstance(obj, list):
        for e in obj:
            aus.update(flach(e, praefix))
    return aus


def _fnrs_aus(antwort):
    """Firmenbuchnummern aus einer Trefferliste lesen."""
    aus = []
    def gehe(o):
        if isinstance(o, dict):
            for k, v in o.items():
                if k.lower() in ("firmenbuchnummer", "fnr", "firmenbuchnummer", "nummer") \
                        and isinstance(v, (str, int)):
                    t = str(v).strip().lower()
                    if 4 <= len(t) <= 12:
                        aus.append(t)
                else:
                    gehe(v)
        elif isinstance(o, list):
            for e in o:
                gehe(e)
    gehe(antwort)
    return aus


def firmenname(t):
    """Firmenwortlaut aus einem Suchtreffer holen.

    Die Quelle liefert den Wortlaut je nach Datensatz als Zeichenkette, als
    Liste von Zeichenketten oder als Liste von Untersaetzen mit wechselnden
    Schluesselnamen. Statt einen davon zu erraten, werden alle Zeichenketten
    eingesammelt und die laengste genommen, denn der vollstaendige Wortlaut ist
    stets laenger als Zusaetze wie die Rechtsform.
    """
    def sammle(x, tiefe=0):
        if tiefe > 4:
            return []
        if isinstance(x, str):
            return [x.strip()] if x.strip() else []
        if isinstance(x, (list, tuple)):
            aus = []
            for y in x:
                aus += sammle(y, tiefe + 1)
            return aus
        if isinstance(x, dict):
            aus = []
            for k, y in x.items():
                if isinstance(y, str) and str(k).lower() in (
                        "name", "wortlaut", "firmenwortlaut", "text", "bezeichnung"):
                    if y.strip():
                        aus.append(y.strip())
                elif isinstance(y, (list, dict)):
                    aus += sammle(y, tiefe + 1)
            if not aus:
                aus = [v.strip() for v in x.values() if isinstance(v, str) and v.strip()]
            return aus
        return []

    for schluessel in ("finalNames", "firmenwortlaut", "FIRMENWORTLAUT", "name", "names"):
        if schluessel in t:
            kandidaten = sammle(t.get(schluessel))
            if kandidaten:
                return max(kandidaten, key=len)
    return ""


def ist_kapitalgesellschaft(t):
    """Prueft, ob ein Suchtreffer eine Gesellschaft mit beschraenkter Haftung ist.

    Die Quelle bezeichnet die Rechtsform uneinheitlich, etwa als „GES.M.B.H.",
    „GmbH" oder ueber einen Zahlenschluessel. Geprueft werden daher Klartext und
    Schluessel gemeinsam. Laesst sich die Rechtsform gar nicht ablesen, wird der
    Treffer uebernommen statt verworfen: Ein zu Unrecht aufgenommener Datensatz
    faellt beim Abruf der Jahresabschluesse auf, ein zu Unrecht verworfener
    bleibt fuer immer unsichtbar.
    """
    text = (str(t.get("finalLegalFormText") or "") + " " +
            str(t.get("finalLegalFormCode") or "") + " " +
            str(t.get("rechtsform") or "")).upper().replace(".", "").replace(" ", "")
    if not text.strip():
        return True
    aus = ("GESMBH", "GMBH", "MBH", "GES", "110", "120")
    nein = ("EINZELUNTERNEHM", "OFFENEGESELLSCHAFT", "KOMMANDIT", "VEREIN",
            "GENOSSENSCHAFT", "STIFTUNG", "AKTIENGESELLSCHAFT", "PRIVATSTIFTUNG")
    if any(n in text for n in nein) and not any(a in text for a in ("GESMBH", "GMBH", "MBH")):
        return False
    return any(a in text for a in aus)


def neue_suchen(e, branche, anzahl, vorhanden, melde=None):
    """Ueber den Suchendpunkt neue Gesellschaften einer Branche finden.

    Gesucht wird mit den branchentypischen Begriffen, die auch der Zuordnung
    im Datenmodell zugrunde liegen. Bereits erfasste Nummern werden uebergangen.
    """
    basis_liste = []
    b = (e.get("api_basis") or "").rstrip("/")
    for k in (b, b[:-4] if b.endswith("/api") else b + "/api"):
        if k and k not in basis_liste:
            basis_liste.append(k)
    if isinstance(branche, (list, tuple)):
        begriffe = [str(x).strip() for x in branche if str(x).strip()]
        branche = begriffe[0] if begriffe else ""
    else:
        begriffe = BRANCHENBEGRIFFE.get(branche) or [
            b.strip() for b in str(branche).split(",") if b.strip()]
    gefunden, gesehen = [], set(vorhanden)
    zaehler = {"gesamt": 0, "geloescht": 0, "rechtsform": 0, "bekannt": 0}
    for begriff in begriffe:
        if len(gefunden) >= anzahl:
            break
        for basis in basis_liste:
            r = _probe_post(basis, ENDPUNKTE["suche"], suchrumpf(begriff), e, zeit=30)
            if not r.get("ok"):
                continue
            daten = r.get("daten")
            if daten is None:
                if melde:
                    melde(f'„{begriff}“: keine auswertbare Antwort — {r.get("meldung","")}')
                continue
            treffer = daten.get("ERGEBNIS") if isinstance(daten, dict) else daten
            for t in (treffer or []):
                if not isinstance(t, dict):
                    continue
                f = str(t.get("fnr") or "").strip().lower()
                # Nur aufrechte Gesellschaften mit beschraenkter Haftung uebernehmen.
                if not f:
                    continue
                if f in gesehen:
                    zaehler["bekannt"] += 1
                    continue
                zaehler["gesamt"] += 1
                if (t.get("finalStatus") or "").strip():
                    zaehler["geloescht"] += 1
                    continue
                if not ist_kapitalgesellschaft(t):
                    zaehler["rechtsform"] += 1
                    continue
                gesehen.add(f)
                gefunden.append({"fnr": f, "branche": branche if isinstance(branche, str) else begriff,
                                 "begriff": begriff,
                                 "name": firmenname(t) or f,
                                 "sitz": t.get("finalSeat") or ""})
                if len(gefunden) >= anzahl:
                    break
            if melde:
                melde(f'„{begriff}“: {zaehler["gesamt"]} Treffer, davon '
                      f'{zaehler["bekannt"]} bereits im Bestand, '
                      f'{zaehler["geloescht"]} geloescht, '
                      f'{zaehler["rechtsform"]} andere Rechtsform — '
                      f'{len(gefunden)} neu')
            e["_basis"] = basis
            break
    if melde and not gefunden and zaehler["gesamt"]:
        melde(f'Alle {zaehler["gesamt"]} Treffer wurden gefiltert. '
              f'Bereits im Bestand: {zaehler["bekannt"]}, '
              f'geloescht: {zaehler["geloescht"]}, '
              f'andere Rechtsform: {zaehler["rechtsform"]}.')
    return gefunden[:anzahl]


def _urkunden_ids(antwort):
    """Kennungen der offengelegten Jahresabschluesse aus der Urkundenliste lesen."""
    aus = []
    def gehe(o):
        if isinstance(o, dict):
            for k, v in o.items():
                if k.lower() in ("id", "urkundeid", "urkundenid", "dokumentid") and isinstance(v, (str, int)):
                    aus.append(v)
                else:
                    gehe(v)
        elif isinstance(o, list):
            for e in o:
                gehe(e)
    gehe(antwort)
    return aus


def jahr_aus(d):
    for s in ("gjEnde", "gjende", "GJENDE", "geschaeftsjahr", "jahr", "bilanzstichtag",
              "STICHTAG", "stichtag", "periode", "year", "gj", "gjBeginn"):
        if s in d and d[s]:
            t = str(d[s])
            for i in range(len(t) - 3):
                if t[i:i + 4].isdigit() and 1990 <= int(t[i:i + 4]) <= 2100:
                    return int(t[i:i + 4])
    return None


class Lauf:
    """Ein Erhebungslauf. Laeuft in einem eigenen Faden und meldet den
    Fortschritt fortlaufend an die Oberflaeche."""

    def __init__(self, db_pfad, modus, fnrs, einstellungen, notiz=""):
        self.db_pfad = db_pfad
        self.modus = modus
        self.fnrs = list(fnrs)
        self.e = einstellungen
        self.notiz = notiz
        self.abbruch = threading.Event()
        self.id = None
        self.zustand = {"status": "bereit", "ziel": len(self.fnrs), "erledigt": 0, "neu": 0,
                        "aktualisiert": 0, "fehler": 0, "werte": 0, "jahre": 0,
                        "aktuell": None, "modus": modus}
        self.log = []
        self.sperre = threading.Lock()

    # ------------------------------------------------------------ Protokoll
    def _sag(self, stufe, text, fnr=None):
        e = {"ts": datetime.now().strftime("%H:%M:%S"), "stufe": stufe, "fnr": fnr, "text": text}
        with self.sperre:
            self.log.append(e)
            if len(self.log) > 4000:
                del self.log[:1500]
        try:
            self.c.execute("INSERT INTO lauf_log(lauf_id,ts,stufe,fnr,text) VALUES(?,?,?,?,?)",
                           (self.id, jetzt(), stufe, fnr, text))
        except Exception:
            pass

    def sicht(self, ab=0):
        with self.sperre:
            return {"zustand": dict(self.zustand), "log": self.log[ab:], "gesamt_log": len(self.log), "id": self.id}

    # ---------------------------------------------------------------- Start
    def starten(self):
        threading.Thread(target=self._lauf, daemon=True).start()

    def _lauf(self):
        self.c = sqlite3.connect(self.db_pfad, timeout=30)
        self.c.execute("PRAGMA journal_mode=WAL")
        cur = self.c.execute(
            "INSERT INTO lauf(gestartet,modus,status,ziel,notiz) VALUES(?,?,?,?,?)",
            (jetzt(), self.modus, "laeuft", len(self.fnrs), self.notiz))
        self.id = cur.lastrowid
        self.c.commit()
        self.zustand["status"] = "laeuft"
        self._sag("start", f"Lauf {self.id} gestartet, Betriebsart {self.modus}, {len(self.fnrs)} Gesellschaften vorgemerkt.")
        if self.modus == "live":
            self._sag("info", f"Schnittstelle {self.e.get('api_basis','')} · Zertifikate: {SSL_HERKUNFT}")
        try:
            for i, fnr in enumerate(self.fnrs):
                if self.abbruch.is_set():
                    self._sag("warn", "Lauf durch Bedienung angehalten.")
                    break
                self.zustand["aktuell"] = fnr
                try:
                    self._eine(fnr)
                except Exception as ex:
                    self.zustand["fehler"] += 1
                    self._sag("fehler", f"{type(ex).__name__}: {ex}", fnr)
                self.zustand["erledigt"] = i + 1
                if (i + 1) % 25 == 0:
                    self.c.commit()
            self.c.commit()
            self.zustand["status"] = "angehalten" if self.abbruch.is_set() else "fertig"
        except Exception as ex:
            self.zustand["status"] = "fehler"
            self._sag("fehler", f"Lauf abgebrochen: {ex}")
        finally:
            self.zustand["aktuell"] = None
            z = self.zustand
            self.c.execute("""UPDATE lauf SET beendet=?,status=?,erledigt=?,neu=?,aktualisiert=?,
                              fehler=?,werte=? WHERE id=?""",
                           (jetzt(), z["status"], z["erledigt"], z["neu"], z["aktualisiert"],
                            z["fehler"], z["werte"], self.id))
            self._sag("ende", f"Abgeschlossen. {z['jahre']} Firmenjahre, {z['werte']} Einzelwerte, {z['fehler']} Fehler.")
            self.c.commit()
            self.c.close()

    # --------------------------------------------------------- ein Datensatz
    def _eine(self, fnr):
        t0 = time.time()
        self._sag("abruf", "Datensatz wird angefordert.", fnr)
        if self.modus == "live":
            roh = self._hole(fnr)
        else:
            roh = self._probe(fnr)
        if not roh:
            self.zustand["fehler"] += 1
            self._sag("warn", "Keine verwertbare Antwort erhalten.", fnr)
            return
        stamm, jahre = self._zerlegen(roh)
        if not jahre:
            # Antwort ohne verwertbares Geschaeftsjahr. Nichts schreiben, sonst
            # entstuende ein Stammsatz ohne einen einzigen Abschluss.
            self.zustand["fehler"] += 1
            self._sag("warn", "Antwort enthält kein auswertbares Geschäftsjahr.", fnr)
            return
        vorher = self.c.execute("SELECT COUNT(*) FROM firmenjahr WHERE fnr=?", (fnr,)).fetchone()[0]
        if vorher == 0:
            self.zustand["neu"] += 1
        else:
            self.zustand["aktualisiert"] += 1
        self._schreiben(fnr, stamm, jahre)
        n = sum(len(v) for v in jahre.values())
        self.zustand["werte"] += n
        self.zustand["jahre"] += len(jahre)
        ms = int((time.time() - t0) * 1000)
        js = ", ".join(str(j) for j in sorted(jahre))
        self._sag("ok", f"{len(jahre)} Geschäftsjahre ({js}), {n} Einzelwerte übernommen, {ms} ms.", fnr)
        pause = int(self.e.get("pause_ms", 350) or 0)
        if pause:
            time.sleep(pause / 1000.0)

    # ------------------------------------------------------------ Live-Abruf
    def _basen(self):
        """Die eingestellte Grundadresse und ihre naheliegende Alternative.
        Die Pfade aus Tabelle 1 beginnen bereits mit /firmenbuch, ein zusaetzliches
        /api ist deshalb nicht zwingend."""
        b = (self.e.get("api_basis") or "").rstrip("/")
        gemerkt = self.e.get("_basis")
        aus = [gemerkt] if gemerkt else []
        for k in (b, b[:-4] if b.endswith("/api") else b + "/api"):
            if k and k not in aus:
                aus.append(k)
        return aus

    def _post(self, pfad, rumpf, still=False, basis=None):
        """Eine POST-Abfrage gegen die Schnittstelle. Gibt die gelesene Antwort
        zurueck oder None."""
        basis = (basis if basis is not None else (self.e.get("api_basis") or "")).rstrip("/")
        url = basis + pfad
        daten = json.dumps(rumpf).encode("utf-8")
        kopf = {"Content-Type": "application/json", "Accept": "application/json",
                "User-Agent": "Masterarbeit-Werkzeug/1.0"}
        schluessel = self.e.get("api_schluessel") or ""
        if schluessel:
            art = self.e.get("auth_art") or "header"
            feld = self.e.get("auth_feld") or "X-API-Key"
            if art == "bearer":
                kopf["Authorization"] = "Bearer " + schluessel
            else:
                kopf[feld] = schluessel
        req = urllib.request.Request(url, data=daten, headers=kopf, method="POST")
        self.letzte_antwort = {"url": url, "rumpf": rumpf}
        try:
            with urllib.request.urlopen(req, timeout=40, context=SSL_ZUSAMMENHANG) as a:
                text, code = a.read().decode("utf-8", "replace"), a.status
        except urllib.error.HTTPError as ex:
            roh = ex.read()[:400].decode("utf-8", "replace")
            self.letzte_antwort.update({"code": ex.code, "auszug": roh})
            if not still:
                self._sag("fehler", f"{pfad}: Kennung {ex.code} · {roh[:160]}")
            return None
        except Exception as ex:
            self.letzte_antwort.update({"code": None, "auszug": str(ex)})
            if not still:
                self._sag("fehler", f"{pfad}: {ex}")
            return None
        self.letzte_antwort.update({"code": code, "auszug": text[:400]})
        try:
            return json.loads(text)
        except json.JSONDecodeError:
            if not still:
                self._sag("fehler", f"{pfad}: kein JSON · {text[:160]}")
            return None

    def _mit_nummer(self, pfad, fnr, zusatz=None):
        """Die Abfrage mit verschiedenen Schluesselnamen fuer die Firmenbuchnummer
        versuchen, bis eine Antwort mit Inhalt kommt."""
        gemerkt = self.e.get("_schluessel_name")
        namen = ([gemerkt] if gemerkt else []) + [n for n in NUMMER_SCHLUESSEL if n != gemerkt]
        erste = None
        for basis in self._basen():
            for name in namen:
                rumpf = {name: fnr}
                if zusatz:
                    rumpf.update(zusatz)
                a = self._post(pfad, rumpf, still=True, basis=basis)
                if erste is None:
                    erste = dict(self.letzte_antwort)
                if a:
                    self.e["_schluessel_name"] = name
                    self.e["_basis"] = basis
                    if not self.e.get("_gemeldet"):
                        self.e["_gemeldet"] = True
                        self._sag("info", "Zugriff steht: " + basis + pfad + ", Schluesselname " + name + ".")
                    return a
        self._letzter_fehlschlag = erste
        return None

    def _hole(self, fnr):
        """Mehrstufiger Abruf: Urkundenliste, dann die Mehrjahresdaten.
        Die Endpunkte folgen Tabelle 1 der Arbeit."""
        mehr = self._mit_nummer(ENDPUNKTE["mehrjahr"], fnr)
        if not mehr:
            # Manche Schnittstellen verlangen zuerst die Urkundenliste.
            liste = self._mit_nummer(ENDPUNKTE["urkunden"], fnr)
            if liste:
                ids = [x for x in _urkunden_ids(liste) if x]
                if ids:
                    mehr = self._mit_nummer(ENDPUNKTE["mehrjahr"], fnr, {"urkunden": ids})
        if not mehr:
            d = getattr(self, "_letzter_fehlschlag", None) or {}
            self._sag("fehler",
                      "Keine Mehrjahresdaten. Die Schnittstelle antwortete mit Kennung "
                      f"{d.get('code')} auf {d.get('url')} · {str(d.get('auszug'))[:200]}", fnr)
            return None
        stamm = self._mit_nummer(ENDPUNKTE["auszug"], fnr)
        if isinstance(stamm, dict) and isinstance(mehr, dict):
            zusammen = dict(stamm)
            zusammen.update(mehr)
            return zusammen
        return mehr

    # ------------------------------------------------------- Wiedergabe-Lauf
    def _probe(self, fnr):
        """Baut aus dem Herkunftsnachweis eine Antwort in der Gestalt der
        Schnittstelle nach und schickt sie durch dieselbe Zerlegung."""
        u = self.c.execute("SELECT name,sitz,rechtsform FROM unternehmen WHERE fnr=?", (fnr,)).fetchone()
        rows = self.c.execute(
            "SELECT gj,rohbezeichnung,rohwert FROM herkunft WHERE fnr=? ORDER BY gj", (fnr,)).fetchall()
        if not rows:
            return None
        nach = {}
        for gj, bez, roh in rows:
            nach.setdefault(gj, {})[bez] = roh
        time.sleep(random.uniform(0.012, 0.05))
        return {"firmenbuchnummer": fnr,
                "firmenwortlaut": u[0] if u else None,
                "sitz": u[1] if u else None,
                "rechtsform": u[2] if u else None,
                "abschluesse": [dict(geschaeftsjahr=gj, **w) for gj, w in sorted(nach.items())]}

    # ---------------------------------------------------------- Zerlegen
    def _zerlegen(self, roh):
        stamm, jahre = {}, {}
        oben = flach(roh)
        for k, v in oben.items():
            z = STAMM_BEZUG.get(k)
            if z and isinstance(v, str) and v.strip():
                stamm.setdefault(z, v.strip())
        listen = []
        if isinstance(roh, dict):
            for k, v in roh.items():
                if isinstance(v, list) and v and isinstance(v[0], dict):
                    listen.append(v)
        if not listen and isinstance(roh, list):
            listen = [roh]
        if not listen:
            listen = [[roh]] if isinstance(roh, dict) else []
        for lst in listen:
            for e in lst:
                d = flach(e)
                gj = jahr_aus(d)
                if gj is None:
                    continue
                werte = {}
                for bez, wert in d.items():
                    feld = FELDBEZUG.get(bez)
                    if not feld:
                        continue
                    w = zahl(wert)
                    if w is None:
                        continue
                    werte[feld] = {"rohbezeichnung": bez, "rohwert": str(wert), "wert": w}
                if werte:
                    jahre.setdefault(gj, {}).update(werte)
        return stamm, jahre

    # ------------------------------------------------------------ Speichern
    def _schreiben(self, fnr, stamm, jahre):
        ts = jetzt()
        d = self.c.execute("SELECT fnr FROM unternehmen WHERE fnr=?", (fnr,)).fetchone()
        if not d:
            self.c.execute("INSERT INTO unternehmen(fnr,name,rechtsform,sitz,quelle_url) VALUES(?,?,?,?,?)",
                           (fnr, stamm.get("name", fnr), stamm.get("rechtsform", "GmbH"),
                            stamm.get("sitz"), f"https://openfirmenbuch.at/company/?fnr={fnr}"))
        else:
            for f in ("name", "sitz", "rechtsform", "geschaeftszweig", "oenace"):
                if stamm.get(f):
                    self.c.execute(f"UPDATE unternehmen SET {f}=? WHERE fnr=? AND ({f} IS NULL OR {f}='')",
                                   (stamm[f], fnr))
        for gj, werte in jahre.items():
            spalten = list(werte)
            self.c.execute(
                f"INSERT INTO firmenjahr(fnr,gj,{','.join(spalten)},guv_offengelegt,quelle,abrufzeitpunkt,datenqualitaet) "
                f"VALUES(?,?,{','.join('?' * len(spalten))},?,?,?,?) "
                f"ON CONFLICT(fnr,gj) DO UPDATE SET {','.join(f'{s}=excluded.{s}' for s in spalten)},"
                f"guv_offengelegt=excluded.guv_offengelegt,quelle=excluded.quelle,"
                f"abrufzeitpunkt=excluded.abrufzeitpunkt,datenqualitaet=excluded.datenqualitaet",
                [fnr, gj] + [werte[s]["wert"] for s in spalten]
                + [1 if any(s in GUV_FELDER for s in spalten) else 0,
                   "of/multiple", ts,
                   "vollstaendig" if any(s in GUV_FELDER for s in spalten) else "nur_bilanz"])
            self.c.execute("DELETE FROM herkunft WHERE fnr=? AND gj=?", (fnr, gj))
            self.c.executemany(
                "INSERT INTO herkunft(fnr,gj,feld,rohbezeichnung,rohwert,wert,einheit,quelle,abrufzeitpunkt,auslesestatus,datenqualitaet) "
                "VALUES(?,?,?,?,?,?,?,?,?,?,?)",
                [(fnr, gj, f, w["rohbezeichnung"], w["rohwert"], w["wert"], "EUR", "of/multiple", ts, "ok",
                  "vollstaendig" if any(s in GUV_FELDER for s in werte) else "nur_bilanz")
                 for f, w in werte.items()])
        self.c.execute("""UPDATE unternehmen SET
            anzahl_jahre=(SELECT COUNT(*) FROM firmenjahr WHERE fnr=?),
            jahr_von=(SELECT MIN(gj) FROM firmenjahr WHERE fnr=?),
            jahr_bis=(SELECT MAX(gj) FROM firmenjahr WHERE fnr=?) WHERE fnr=?""",
                       (fnr, fnr, fnr, fnr))


def _probe_post(basis, pfad, rumpf, e, zeit=25):
    """Einzelne POST-Abfrage ohne Speichern."""
    url = basis.rstrip("/") + pfad
    kopf = {"Content-Type": "application/json", "Accept": "application/json",
            "User-Agent": "Masterarbeit-Werkzeug/1.0"}
    sch = e.get("api_schluessel") or ""
    if sch:
        if (e.get("auth_art") or "header") == "bearer":
            kopf["Authorization"] = "Bearer " + sch
        else:
            kopf[e.get("auth_feld") or "X-API-Key"] = sch
    req = urllib.request.Request(url, data=json.dumps(rumpf).encode(), headers=kopf, method="POST")
    t0 = time.time()
    try:
        with urllib.request.urlopen(req, timeout=zeit, context=SSL_ZUSAMMENHANG) as a:
            text, code = a.read().decode("utf-8", "replace"), a.status
    except urllib.error.HTTPError as ex:
        return {"ok": False, "code": ex.code, "url": url,
                "meldung": f"Die Schnittstelle antwortet mit Kennung {ex.code}.",
                "auszug": ex.read()[:800].decode("utf-8", "replace")}
    except Exception as ex:
        return {"ok": False, "url": url, "meldung": f"Kein Zugriff: {ex}"}
    ms = int((time.time() - t0) * 1000)
    huelle = text.lstrip()[:200].lower()
    if huelle.startswith("<!doctype") or huelle.startswith("<html"):
        return {"ok": False, "code": code, "url": url, "ms": ms, "seitenhuelle": True,
                "meldung": "Unter diesem Pfad kommt die Webseite zurück, keine Daten.",
                "auszug": text[:800]}
    try:
        daten = json.loads(text)
    except json.JSONDecodeError:
        return {"ok": False, "code": code, "url": url, "ms": ms,
                "meldung": "Antwort ist kein JSON.", "auszug": text[:800]}
    d = flach(daten)
    erkannt = sorted(FELDBEZUG[k] for k in d if k in FELDBEZUG)
    kennung = sorted(k for k in d if k in STAMM_BEZUG or k in KENNFELDER)
    unbekannt = sorted(k for k in d if k not in FELDBEZUG and k not in STAMM_BEZUG
                       and k not in KENNFELDER)[:40]
    # "auszug" ist eine gekuerzte Fassung fuer die Anzeige. Zur Weiterverarbeitung
    # dient ausschliesslich "daten", sonst gehen bei langen Antworten Treffer verloren.
    return {"ok": True, "code": code, "url": url, "ms": ms, "daten": daten,
            "meldung": f"Antwort erhalten, {len(erkannt)} Bilanzfelder erkannt.",
            "erkannt": erkannt, "kennung": kennung, "unbekannt": unbekannt,
            "auszug": json.dumps(daten, ensure_ascii=False, indent=2)[:2500]}


def alle_pruefen(e, fnr="134736t", begriff="Bau"):
    """Alle vier dokumentierten Endpunkte einzeln abfragen und die Rohantworten
    zurueckgeben. Damit laesst sich ablesen, welcher Baustein klemmt."""
    basen = []
    b = (e.get("api_basis") or "").rstrip("/")
    for k in (b, b[:-4] if b.endswith("/api") else b + "/api"):
        if k and k not in basen:
            basen.append(k)
    proben = [
        ("Mehrjahresdaten", ENDPUNKTE["mehrjahr"], [{n: fnr} for n in NUMMER_SCHLUESSEL]),
        ("Urkundenliste",   ENDPUNKTE["urkunden"], [{n: fnr} for n in NUMMER_SCHLUESSEL]),
        ("Stammdaten",      ENDPUNKTE["auszug"],   [{n: fnr} for n in NUMMER_SCHLUESSEL]),
        ("Firmensuche",     ENDPUNKTE["suche"],
         [{n: begriff} for n in ("suchbegriff", "begriff", "name", "firmenwortlaut",
                                 "suche", "query", "q", "searchTerm", "text")]
         + [{"suchbegriff": begriff, "rechtsform": "GmbH"},
            {"name": begriff, "exakt": False},
            {"query": {"name": begriff}}]),
    ]
    aus = []
    for titel, pfad, ruempfe in proben:
        bester = None
        for basis in basen:
            for rumpf in ruempfe:
                r = _probe_post(basis, pfad, rumpf, e, zeit=15)
                r["rumpf"] = rumpf
                r["basis"] = basis
                if bester is None or (r.get("ok") and not bester.get("ok")) or \
                   (r.get("ok") and len(r.get("erkannt") or []) > len(bester.get("erkannt") or [])):
                    bester = r
                if r.get("ok"):
                    break
            if bester and bester.get("ok"):
                break
        aus.append({"titel": titel, "pfad": pfad, **(bester or {})})
    return {"proben": aus, "fnr": fnr, "begriff": begriff}


def verbindung_pruefen(e, fnr="134736t"):
    """Einzelabfrage gegen den Mehrjahres-Endpunkt, ohne zu speichern."""
    basis = e.get("api_basis") or ""
    pfad = e.get("api_pfad") or ENDPUNKTE["mehrjahr"]
    letzte = None
    for name in NUMMER_SCHLUESSEL:
        r = _probe_post(basis, pfad, {name: fnr}, e)
        letzte = r
        if r.get("ok") and r.get("erkannt"):
            r["schluessel"] = name
            return r
        if r.get("ok"):
            r["schluessel"] = name
    return letzte or {"ok": False, "meldung": "Keine Antwort."}


def endpunkt_suchen(e, fnr="134736t"):
    """Die vier dokumentierten Endpunkte samt gebraeuchlicher Rumpfschluessel
    durchprobieren. Grundlage ist Tabelle 1 der Arbeit."""
    basis = e.get("api_basis") or ""
    kandidaten = [e.get("api_pfad") or ENDPUNKTE["mehrjahr"],
                  ENDPUNKTE["mehrjahr"], ENDPUNKTE["urkunden"],
                  ENDPUNKTE["auszug"], ENDPUNKTE["suche"],
                  "/api" + ENDPUNKTE["mehrjahr"], "/api" + ENDPUNKTE["urkunden"]]
    gesehen, aus, treffer = set(), [], None
    for p in kandidaten:
        if p in gesehen:
            continue
        gesehen.add(p)
        bester = None
        for name in NUMMER_SCHLUESSEL:
            r = _probe_post(basis, p, {name: fnr}, e, zeit=18)
            if bester is None or (r.get("ok") and len(r.get("erkannt") or []) >
                                  len(bester.get("erkannt") or [])):
                bester = r
                bester["schluessel"] = name
            if r.get("ok") and r.get("erkannt"):
                break
        aus.append({"pfad": p, "ok": bool(bester.get("ok")), "code": bester.get("code"),
                    "felder": len(bester.get("erkannt") or []),
                    "schluessel": bester.get("schluessel"),
                    "meldung": bester.get("meldung", "")})
        if bester.get("ok") and len(bester.get("erkannt") or []) >= 5:
            treffer = aus[-1]
            break
    aus.sort(key=lambda x: (-x["felder"], not x["ok"]))
    if treffer is None:
        treffer = next((x for x in aus if x["ok"] and x["felder"] >= 5), None)
    return {"treffer": treffer, "versuche": aus}
