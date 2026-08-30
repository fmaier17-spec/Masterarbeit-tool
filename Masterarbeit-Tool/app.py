#!/usr/bin/env python3
"""Fabian Maier Masterarbeit - Analysewerkzeug.

Startet einen lokalen Dienst und oeffnet die Oberflaeche im Browser.
Es werden ausschliesslich Bestandteile der Standardbibliothek verwendet,
zusaetzliche Pakete sind nicht erforderlich.

    python3 app.py
"""
import io, json, math, os, sqlite3, sys, threading, webbrowser, csv
from collections import defaultdict, Counter
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs

HIER = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HIER)

import kern as K
import abruf as A

# Ueber DB_PFAD laesst sich ein anderer Bestand ansprechen, etwa eine Kopie fuer
# einen Probelauf, ohne den Hauptbestand anzuruehren.
DB = os.environ.get("DB_PFAD") or os.path.join(HIER, "masterarbeit.db")
if not os.path.isabs(DB):
    DB = os.path.join(HIER, DB)
WEB = os.path.join(HIER, "web")
PORT = int(os.environ.get("PORT", "8731"))

LAUF = {"aktiv": None}
MODELL = {"zustand": None, "ergebnis": None, "log": []}
CACHE = {}
SPERRE = threading.Lock()


# ------------------------------------------------------------------ Datenbank

def verb():
    c = sqlite3.connect(DB, timeout=30)
    c.row_factory = sqlite3.Row
    return c


def alle_jahre(c=None):
    schluessel = "jahre"
    if schluessel in CACHE:
        return CACHE[schluessel]
    eigen = c is None
    c = c or verb()
    rows = [dict(r) for r in c.execute("""
        SELECT f.*, u.branche, u.name, u.sitz FROM firmenjahr f
        JOIN unternehmen u ON u.fnr=f.fnr ORDER BY f.fnr, f.gj""")]
    for r in rows:
        r["kz"] = K.kennzahlen(r)
        r["auff"] = K.auffaellig(r["kz"])
        r["groesse"] = K.groessenklasse(r.get("bilanzsumme"), r["gj"])
    if eigen:
        c.close()
    CACHE[schluessel] = rows
    return rows


def leeren():
    CACHE.clear()


def einstellungen(c=None):
    eigen = c is None
    c = c or verb()
    d = {r["schluessel"]: r["wert"] for r in c.execute("SELECT * FROM einstellung")}
    if eigen:
        c.close()
    return d


# ------------------------------------------------------------------ Auswertung

def uebersicht():
    if "uebersicht" in CACHE:
        return CACHE["uebersicht"]
    c = verb()
    R = alle_jahre(c)
    u = [dict(r) for r in c.execute("SELECT * FROM unternehmen")]
    proU = defaultdict(list)
    for r in R:
        proU[r["fnr"]].append((r["gj"], r.get("bilanzsumme")))
    klassen = {f: K.klasse_unternehmen(v) for f, v in proU.items()}
    zk = Counter(v for v in klassen.values() if v)
    branche = Counter(x["branche"] for x in u)
    jahr = Counter(r["gj"] for r in R)
    auff = sum(1 for r in R if r["auff"]["auffaellig"])
    dim = Counter(r["auff"]["anzahl"] for r in R)
    lueck = luecken(R)
    letzter = c.execute("SELECT * FROM lauf ORDER BY id DESC LIMIT 1").fetchone()
    aus = {
        "unternehmen": len(u), "firmenjahre": len(R),
        "einzelwerte": c.execute("SELECT COUNT(*) FROM herkunft").fetchone()[0],
        "guv": sum(1 for r in R if r.get("guv_offengelegt")),
        "oenace": sum(1 for x in u if x.get("oenace")),
        "branchen": [{"name": b, "unternehmen": branche[b],
                      "firmenjahre": sum(1 for r in R if r["branche"] == b)} for b in K.BRANCHEN],
        "jahre": [{"gj": g, "anzahl": jahr[g]} for g in sorted(jahr)],
        "groessenklassen": [{"klasse": k, "anzahl": zk.get(k, 0)}
                            for k in ("Kleinst", "Klein", "Mittelgross", "Gross")],
        "auffaellig": auff, "auffaellig_quote": auff / max(1, len(R)),
        "dimensionen": [{"anzahl": i, "faelle": dim.get(i, 0)} for i in range(4)],
        "uebergaenge": lueck,
        "bilanzsumme_median": K.median([r.get("bilanzsumme") for r in R]),
        "letzter_lauf": dict(letzter) if letzter else None,
        "laeufe": [dict(r) for r in c.execute("SELECT * FROM lauf ORDER BY id DESC LIMIT 12")],
        "kennzahl_uebersicht": [
            {"schluessel": k, "name": K.BEZEICHNUNG.get(k, k),
             "median": K.median([r["kz"].get(k) for r in R]),
             "n": sum(1 for r in R if r["kz"].get(k) is not None)}
            for k in ("eigenkapitalquote", "verschuldungsgrad", "liquiditaet_2",
                      "anlagendeckung_2", "umsatzrentabilitaet", "altman_z")],
    }
    c.close()
    CACHE["uebersicht"] = aus
    return aus


def luecken(R):
    """Herleitung der auswertbaren Uebergaenge."""
    pro = defaultdict(list)
    for r in R:
        pro[r["fnr"]].append(r["gj"])
    erste = len(pro)
    nach_luecke = 0
    faelle = []
    for f, js in pro.items():
        js = sorted(js)
        fehlt = [js[i] for i in range(1, len(js)) if js[i] - js[i - 1] > 1]
        if fehlt:
            nach_luecke += len(fehlt)
            fluecke = [j for i in range(1, len(js)) for j in range(js[i - 1] + 1, js[i])]
            faelle.append({"fnr": f, "jahre": js, "luecke": fluecke})
    return {"firmenjahre": len(R), "erste_jahre": erste, "nach_luecke": nach_luecke,
            "auswertbar": len(R) - erste - nach_luecke, "faelle": faelle,
            "nur_ein_jahr": sum(1 for v in pro.values() if len(v) == 1),
            "alle_fuenf": sum(1 for v in pro.values() if len(v) == 5)}


def kennzahl_auswertung(kz, jahr=None):
    schluessel = f"kz:{kz}:{jahr}"
    if schluessel in CACHE:
        return CACHE[schluessel]
    R = alle_jahre()
    if jahr:
        R = [r for r in R if r["gj"] == int(jahr)]
    gruppen = {b: [r["kz"].get(kz) for r in R if r["branche"] == b] for b in K.BRANCHEN}
    zeilen = []
    for b in K.BRANCHEN:
        w = [x for x in gruppen[b] if x is not None]
        zeilen.append({
            "branche": b, "n": len(w), "median": K.median(w), "mittel": K.mittel(w),
            "q1": K.quantil(w, .25), "q3": K.quantil(w, .75),
            "p10": K.quantil(w, .10), "p90": K.quantil(w, .90),
            "min": min(w) if w else None, "max": max(w) if w else None,
            "ki": K.bootstrap_ki(w),
        })
    kw = K.kruskal_wallis([gruppen[b] for b in K.BRANCHEN])
    paare, ps = [], []
    for i in range(len(K.BRANCHEN)):
        for j in range(i + 1, len(K.BRANCHEN)):
            a, b = K.BRANCHEN[i], K.BRANCHEN[j]
            t = K.mann_whitney(gruppen[a], gruppen[b])
            if t:
                paare.append({"a": a, "b": b, **t})
                ps.append(t["p"])
    if ps:
        korr = K.benjamini_hochberg(ps)
        for p, kq in zip(paare, korr):
            p["p_korr"] = kq
            p["signifikant"] = kq < 0.05
    verlauf = []
    for g in sorted({r["gj"] for r in alle_jahre()}):
        e = {"gj": g}
        for b in K.BRANCHEN:
            e[b] = K.median([r["kz"].get(kz) for r in alle_jahre() if r["gj"] == g and r["branche"] == b])
        verlauf.append(e)
    paar = [(r["kz"].get(kz), n["kz"].get(kz)) for r, n in nachbarn(alle_jahre())]
    aus = {"kennzahl": kz, "name": K.BEZEICHNUNG.get(kz, kz), "jahr": jahr,
           "zeilen": zeilen, "kruskal": kw, "paare": paare, "verlauf": verlauf,
           "wilcoxon": K.wilcoxon(paar),
           "verteilung": [x for x in (r["kz"].get(kz) for r in R) if x is not None]}
    CACHE[schluessel] = aus
    return aus


def nachbarn(R):
    pro = defaultdict(dict)
    for r in R:
        pro[r["fnr"]][r["gj"]] = r
    aus = []
    for f, js in pro.items():
        for g in sorted(js):
            if g - 1 in js:
                aus.append((js[g - 1], js[g]))
    return aus


KORR_FELDER = [("eigenkapitalquote", "EK-Quote"), ("verschuldungsgrad", "Verschuldungsgrad"),
               ("liquiditaet_2", "Liquidität II"), ("liquiditaet_3", "Liquidität III"),
               ("anlagendeckung_2", "Anlagendeckung II"), ("anlagenintensitaet", "Anlagenintensität"),
               ("vorratsquote", "Vorratsquote")]


def korrelation():
    """Rangkorrelation nach Spearman zwischen den bilanzbasierten Kennzahlen."""
    if "korr" in CACHE:
        return CACHE["korr"]
    R = alle_jahre()
    sp = [k for k, _ in KORR_FELDER]
    reihen = {k: [r["kz"].get(k) for r in R] for k in sp}
    werte, ps = [], []
    for a in sp:
        zeile = []
        for b in sp:
            if a == b:
                zeile.append(1.0)
                continue
            s = K.spearman(reihen[a], reihen[b])
            zeile.append(s["rho"] if s else None)
            if s and sp.index(a) < sp.index(b):
                ps.append({"a": a, "b": b, **s})
        werte.append(zeile)
    if ps:
        for p, kq in zip(ps, K.benjamini_hochberg([x["p"] for x in ps])):
            p["p_korr"] = kq
            p["signifikant"] = kq < 0.05
    aus = {"felder": [n for _, n in KORR_FELDER], "schluessel": sp, "werte": werte,
           "paare": sorted(ps, key=lambda x: -abs(x["rho"]))}
    CACHE["korr"] = aus
    return aus


# Wortbestandteile der Branchenzuordnung, wie in Abschnitt 5.2 beschrieben.
ZUORDNUNG = {
 "Bau": ["bauunternehm","baumeister","baugesellsch","hochbau","tiefbau","wohnbau","bautraeger",
         "bauträger","installateur","dachdecker","elektro","maler","zimmerei","spengler","bau"],
 "Handel": ["handelsgesellsch","warenhandel","grosshandel","großhandel","vertrieb","import",
            "export","fahrzeughandel","kfz","markt","handel"],
 "Transport": ["spedition","logistik","fraechterei","frächterei","transport","autobus","taxi",
               "kurier","fuhrunternehm","verkehr"],
 "Gastronomie": ["gasthaus","gasthof","restaurant","hotel","pension","cafe","café","bar",
                 "pizzeria","wirtshaus","beherbergung","buffet","gastronomie","stub"],
 "Unternehmensberatung": ["unternehmensberatung","managementberatung","consulting","beratung",
                          "beratungs"],
}


def stichprobe():
    """Belegt die Zusammensetzung der Stichprobe aus dem Bestand selbst:
    welcher Wortbestandteil welche Gesellschaft der Branche zugeordnet hat."""
    if "stich" in CACHE:
        return CACHE["stich"]
    c = verb()
    u = [dict(r) for r in c.execute("SELECT fnr,name,branche FROM unternehmen")]
    jahre = {r["fnr"]: r["n"] for r in c.execute(
        "SELECT fnr, COUNT(*) n FROM firmenjahr GROUP BY fnr")}
    c.close()
    aus = []
    for b in K.BRANCHEN:
        firmen = [x for x in u if x["branche"] == b]
        begriffe = ZUORDNUNG.get(b, [])
        treffer = Counter()
        ohne = []
        for f in firmen:
            n = (f["name"] or "").lower().replace("ß", "ss")
            for w in ("gesellschaft m.b.h.", "gesellschaft mbh", "ges.m.b.h.", "gmbh",
                      "ges mbh", "m.b.h.", "& co kg", "kg"):
                n = n.replace(w, " ")
            g = next((w for w in begriffe if w.replace("ß", "ss") in n), None)
            if g:
                treffer[g] += 1
            else:
                ohne.append(f["name"])
        js = [jahre.get(f["fnr"], 0) for f in firmen]
        aus.append({
            "branche": b, "unternehmen": len(firmen),
            "firmenjahre": sum(js),
            "jahre_je_unternehmen": round(sum(js) / max(1, len(firmen)), 2),
            "mit_fuenf_jahren": sum(1 for x in js if x >= 5),
            "begriffe": [{"wort": w, "treffer": treffer[w]}
                         for w in begriffe if treffer[w]],
            "ohne_treffer": len(ohne), "beispiele_ohne": ohne[:6],
            "abdeckung": round((len(firmen) - len(ohne)) / max(1, len(firmen)) * 100, 1),
        })
    ges = sum(x["unternehmen"] for x in aus)
    aus_d = {"branchen": aus, "gesamt": ges,
             "mindestziel": 80,
             "ziel_erreicht": all(x["unternehmen"] >= 80 for x in aus),
             "abdeckung_gesamt": round(
                 sum(x["unternehmen"] - x["ohne_treffer"] for x in aus) / max(1, ges) * 100, 1),
             "oenace": 0}
    CACHE["stich"] = aus_d
    return aus_d


def groessen_auswertung():
    R = alle_jahre()
    pro = defaultdict(list)
    for r in R:
        pro[r["fnr"]].append((r["gj"], r.get("bilanzsumme")))
    kl = {f: K.klasse_unternehmen(v) for f, v in pro.items()}
    bra = {r["fnr"]: r["branche"] for r in R}
    kreuz = defaultdict(Counter)
    for f, k in kl.items():
        if k:
            kreuz[bra[f]][k] += 1
    ordn = ("Kleinst", "Klein", "Mittelgross", "Gross")
    jeJahr = []
    for g in sorted({r["gj"] for r in R}):
        z = Counter(r["groesse"] for r in R if r["gj"] == g and r["groesse"])
        jeJahr.append({"gj": g, **{k: z.get(k, 0) for k in ordn}})
    ges = Counter(v for v in kl.values() if v)
    kz = {}
    for k in ordn:
        f = {x for x, v in kl.items() if v == k}
        w = [r for r in R if r["fnr"] in f]
        kz[k] = {"eigenkapitalquote": K.median([r["kz"]["eigenkapitalquote"] for r in w]),
                 "liquiditaet_2": K.median([r["kz"]["liquiditaet_2"] for r in w]),
                 "auffaellig": sum(1 for r in w if r["auff"]["auffaellig"]) / max(1, len(w)),
                 "bilanzsumme": K.median([r.get("bilanzsumme") for r in w]), "n": len(w)}
    return {"gesamt": [{"klasse": k, "anzahl": ges.get(k, 0)} for k in ordn],
            "je_branche": [{"branche": b, **{k: kreuz[b].get(k, 0) for k in ordn}} for b in K.BRANCHEN],
            "je_jahr": jeJahr, "kennzahlen": kz, "grenzen": K.GRENZEN}


def auffaelligkeit():
    R = alle_jahre()
    dim = Counter(r["auff"]["anzahl"] for r in R)
    je = {d: sum(1 for r in R if r["auff"]["dimensionen"][d]) for d in ("kapitalstruktur", "liquiditaet", "rentabilitaet")}
    bra = []
    for b in K.BRANCHEN:
        w = [r for r in R if r["branche"] == b]
        bra.append({"branche": b, "n": len(w),
                    "auffaellig": sum(1 for r in w if r["auff"]["auffaellig"]),
                    "quote": sum(1 for r in w if r["auff"]["auffaellig"]) / max(1, len(w)),
                    **{d: sum(1 for r in w if r["auff"]["dimensionen"][d]) / max(1, len(w))
                       for d in ("kapitalstruktur", "liquiditaet", "rentabilitaet")}})
    jahr = [{"gj": g, "n": sum(1 for r in R if r["gj"] == g),
             "auffaellig": sum(1 for r in R if r["gj"] == g and r["auff"]["auffaellig"]),
             "quote": sum(1 for r in R if r["gj"] == g and r["auff"]["auffaellig"]) / max(1, sum(1 for r in R if r["gj"] == g))}
            for g in sorted({r["gj"] for r in R})]
    liste = sorted([r for r in R if r["auff"]["auffaellig"]],
                   key=lambda r: (r["kz"]["eigenkapitalquote"] if r["kz"]["eigenkapitalquote"] is not None else 999))
    return {"verteilung": [{"anzahl": i, "faelle": dim.get(i, 0)} for i in range(4)],
            "je_dimension": je, "je_branche": bra, "je_jahr": jahr,
            "schwellen": K.SCHWELLE, "gesamt": sum(1 for r in R if r["auff"]["auffaellig"]),
            "liste": [{"fnr": r["fnr"], "name": r["name"], "branche": r["branche"], "gj": r["gj"],
                       "ekq": r["kz"]["eigenkapitalquote"], "liq": r["kz"]["liquiditaet_2"],
                       "ums": r["kz"]["umsatzrentabilitaet"], "bs": r.get("bilanzsumme"),
                       "dim": r["auff"]["anzahl"]} for r in liste[:400]]}


# ------------------------------------------------------------------- Prognose

def merkmalsatz():
    R = alle_jahre()
    pro = defaultdict(dict)
    for r in R:
        pro[r["fnr"]][r["gj"]] = r
    X, y, meta = [], [], []
    for f, js in pro.items():
        for g in sorted(js):
            if g - 1 not in js:
                continue
            v, n = js[g - 1], js[g]
            bs = v.get("bilanzsumme") or 1
            X.append([
                K.stutzen(v["kz"]["eigenkapitalquote"]), K.stutzen(v["kz"]["verschuldungsgrad"]),
                K.stutzen(v["kz"]["liquiditaet_2"]), K.stutzen(v["kz"]["liquiditaet_3"]),
                K.stutzen(v["kz"]["anlagendeckung_2"]), K.stutzen(v["kz"]["anlagenintensitaet"]),
                K.stutzen(v["kz"]["vorratsquote"]), math.log10(max(1, bs)),
                K.stutzen((v["kz"]["eigenkapitalquote"] or 0) - ((js[g - 2]["kz"]["eigenkapitalquote"] or 0) if g - 2 in js else (v["kz"]["eigenkapitalquote"] or 0))),
                K.stutzen((v["kz"]["liquiditaet_2"] or 0) - ((js[g - 2]["kz"]["liquiditaet_2"] or 0) if g - 2 in js else (v["kz"]["liquiditaet_2"] or 0))),
            ])
            y.append(1 if n["auff"]["auffaellig"] else 0)
            meta.append({"fnr": f, "gj": g, "branche": v["branche"], "name": v["name"],
                         "vorjahr": 1 if v["auff"]["auffaellig"] else 0})
    return X, y, meta


def prognose_rechnen():
    def sag(t):
        MODELL["log"].append(t)
        MODELL["zustand"]["text"] = t

    try:
        MODELL["zustand"] = {"status": "laeuft", "schritt": 0, "von": 4, "text": "", "anteil": 0}
        MODELL["log"] = []
        sag("Merkmale werden aus den Vorjahreswerten gebildet.")
        X, y, meta = merkmalsatz()
        tr = [i for i, m in enumerate(meta) if m["gj"] <= 2023]
        te = [i for i, m in enumerate(meta) if m["gj"] >= 2024]
        Xtr, ytr = [X[i] for i in tr], [y[i] for i in tr]
        Xte, yte = [X[i] for i in te], [y[i] for i in te]
        MODELL["zustand"]["schritt"] = 1
        sag(f"Aufteilung nach Zieljahren: {len(tr)} Fälle zum Anlernen, {len(te)} zum Prüfen.")

        naiv = [meta[i]["vorjahr"] for i in te]
        gn = K.guete(yte, naiv, 0.5)
        MODELL["zustand"]["schritt"] = 2
        sag("Naive Fortschreibung ausgewertet.")

        lr = K.LogReg()
        lr.fit(Xtr, ytr, lambda a, b: MODELL["zustand"].update(anteil=a / b * .35))
        plr = lr.predict(Xte)
        MODELL["zustand"]["schritt"] = 3
        sag("Logistische Regression angepasst.")

        rf = K.RandomForest()
        rf.fit(Xtr, ytr, lambda a, b: MODELL["zustand"].update(anteil=.35 + a / b * .65))
        prf = rf.predict(Xte)
        MODELL["zustand"]["schritt"] = 4
        sag("Zufallswald angepasst. Auswertung auf dem Prüfsatz.")

        erg = {
            "n_train": len(tr), "n_test": len(te),
            "rate_train": sum(ytr) / max(1, len(ytr)), "rate_test": sum(yte) / max(1, len(yte)),
            "modelle": [
                {"name": "Naive Fortschreibung", "kurz": "naiv", "auc": None,
                 "ausgeglichen": gn["ausgeglichen"], **gn,
                 "erlaeuterung": "Die Einstufung des Vorjahres wird unverändert übernommen. Ohne Anpassung, ohne Merkmale."},
                {"name": "Logistische Regression", "kurz": "logreg", "auc": K.auc(yte, plr),
                 **K.guete(yte, plr, 0.5), "roc": K.roc(yte, plr), "gewichte": lr.gewichte(),
                 "erlaeuterung": "Lineares Modell auf standardisierten Merkmalen. Die Gewichte sind unmittelbar lesbar."},
                {"name": "Zufallswald", "kurz": "forest", "auc": K.auc(yte, prf),
                 **K.guete(yte, prf, 0.5), "roc": K.roc(yte, prf), "bedeutung": rf.bedeutung(),
                 "erlaeuterung": "60 Entscheidungsbäume auf Zufallsstichproben. Erfasst auch nichtlineare Zusammenhänge."},
            ],
            "ausgewiesen": {"logreg": 0.811, "forest": 0.902, "naiv": 0.826},
            "merkmale": K.MERKMALE,
        }
        MODELL["ergebnis"] = erg
        MODELL["zustand"] = {"status": "fertig", "schritt": 4, "von": 4, "anteil": 1,
                             "text": "Auswertung abgeschlossen."}
    except Exception as ex:
        MODELL["zustand"] = {"status": "fehler", "text": f"{type(ex).__name__}: {ex}"}


# ------------------------------------------------------------------- Ausgabe

def csv_ausgabe(art):
    R = alle_jahre()
    p = io.StringIO()
    w = csv.writer(p, delimiter=";")
    if art == "firmenjahre":
        kzs = ["eigenkapitalquote", "verschuldungsgrad", "liquiditaet_2", "liquiditaet_3",
               "anlagendeckung_2", "anlagenintensitaet", "umsatzrentabilitaet", "altman_z"]
        w.writerow(["Firmenbuchnummer", "Firmenwortlaut", "Branche", "Geschaeftsjahr", "Bilanzsumme",
                    "Eigenkapital", "Groessenklasse"] + [K.BEZEICHNUNG.get(k, k) for k in kzs]
                   + ["kritische Dimensionen", "auffaellig"])
        for r in R:
            w.writerow([r["fnr"], r["name"], r["branche"], r["gj"], r.get("bilanzsumme"),
                        r.get("eigenkapital"), r["groesse"]]
                       + [r["kz"].get(k) for k in kzs]
                       + [r["auff"]["anzahl"], "ja" if r["auff"]["auffaellig"] else "nein"])
    elif art == "unternehmen":
        c = verb()
        pro = defaultdict(list)
        for r in R:
            pro[r["fnr"]].append((r["gj"], r.get("bilanzsumme")))
        w.writerow(["Firmenbuchnummer", "Firmenwortlaut", "Branche", "Rechtsform", "Sitz",
                    "Firmenjahre", "von", "bis", "Groessenklasse", "Quelle"])
        for u in c.execute("SELECT * FROM unternehmen ORDER BY name"):
            w.writerow([u["fnr"], u["name"], u["branche"], u["rechtsform"], u["sitz"],
                        u["anzahl_jahre"], u["jahr_von"], u["jahr_bis"],
                        K.klasse_unternehmen(pro.get(u["fnr"], [])), u["quelle_url"]])
        c.close()
    else:
        c = verb()
        w.writerow(["Firmenbuchnummer", "Geschaeftsjahr", "Feld", "Rohbezeichnung", "Rohwert",
                    "uebernommener Wert", "Einheit", "Quelle", "Abrufzeitpunkt"])
        for h in c.execute("SELECT * FROM herkunft ORDER BY fnr,gj,feld"):
            w.writerow([h["fnr"], h["gj"], h["feld"], h["rohbezeichnung"], h["rohwert"],
                        h["wert"], h["einheit"], h["quelle"], h["abrufzeitpunkt"]])
        c.close()
    return "﻿" + p.getvalue()


# -------------------------------------------------------------------- Server

class H(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, *a):
        pass

    def _send(self, code, koerper, typ="application/json; charset=utf-8", kopf=None):
        if isinstance(koerper, str):
            koerper = koerper.encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", typ)
        self.send_header("Content-Length", str(len(koerper)))
        self.send_header("Cache-Control", "no-store")
        for k, v in (kopf or {}).items():
            self.send_header(k, v)
        self.end_headers()
        try:
            self.wfile.write(koerper)
        except (BrokenPipeError, ConnectionResetError):
            pass

    def _json(self, obj, code=200):
        self._send(code, json.dumps(obj, ensure_ascii=False, default=str))

    def do_GET(self):
        u = urlparse(self.path)
        q = {k: v[0] for k, v in parse_qs(u.query).items()}
        p = u.path
        try:
            if p == "/" or p == "/index.html":
                return self._datei("index.html")
            if p.startswith("/web/"):
                return self._datei(p[5:])
            if p == "/api/uebersicht":
                return self._json(uebersicht())
            if p == "/api/unternehmen":
                return self._json(self._liste(q))
            if p.startswith("/api/unternehmen/"):
                return self._json(self._detail(p.rsplit("/", 1)[1]))
            if p == "/api/kennzahl":
                return self._json(kennzahl_auswertung(q.get("kz", "eigenkapitalquote"), q.get("jahr")))
            if p == "/api/groessen":
                return self._json(groessen_auswertung())
            if p == "/api/stichprobe":
                return self._json(stichprobe())
            if p == "/api/korrelation":
                return self._json(korrelation())
            if p == "/api/auffaellig":
                return self._json(auffaelligkeit())
            if p == "/api/prognose":
                return self._json({"zustand": MODELL["zustand"], "ergebnis": MODELL["ergebnis"],
                                   "log": MODELL["log"]})
            if p == "/api/erhebung":
                l = LAUF["aktiv"]
                if not l:
                    return self._json({"zustand": None})
                return self._json(l.sicht(int(q.get("ab", 0))))
            if p == "/api/einstellungen":
                e = einstellungen()
                if e.get("api_schluessel"):
                    e["api_schluessel_gesetzt"] = True
                    e["api_schluessel"] = "•" * 8 + e["api_schluessel"][-4:]
                return self._json(e)
            if p == "/api/verbindung":
                return self._json(A.verbindung_pruefen(einstellungen(), q.get("fnr", "134736t")))
            if p == "/api/alle-endpunkte":
                return self._json(A.alle_pruefen(einstellungen(), q.get("fnr", "134736t"),
                                                 q.get("begriff", "Bau")))
            if p == "/api/endpunkt-suche":
                r = A.endpunkt_suchen(einstellungen(), q.get("fnr", "134736t"))
                if r.get("treffer"):
                    # Der gefundene Pfad wird gleich hinterlegt, damit der naechste
                    # Abruf ohne weiteres Zutun greift.
                    c = verb()
                    c.execute("INSERT INTO einstellung(schluessel,wert) VALUES('api_pfad',?) "
                              "ON CONFLICT(schluessel) DO UPDATE SET wert=excluded.wert",
                              (r["treffer"]["pfad"],))
                    c.commit()
                    c.close()
                    r["gespeichert"] = True
                return self._json(r)
            if p.startswith("/api/export/"):
                art = p.rsplit("/", 1)[1]
                return self._send(200, csv_ausgabe(art), "text/csv; charset=utf-8",
                                  {"Content-Disposition": f'attachment; filename="{art}.csv"'})
            self._send(404, "nicht gefunden", "text/plain; charset=utf-8")
        except Exception as ex:
            import traceback
            traceback.print_exc()
            self._json({"fehler": f"{type(ex).__name__}: {ex}"}, 500)

    def do_POST(self):
        u = urlparse(self.path)
        n = int(self.headers.get("Content-Length") or 0)
        koerper = json.loads(self.rfile.read(n) or b"{}") if n else {}
        try:
            if u.path == "/api/erhebung/start":
                if LAUF["aktiv"] and LAUF["aktiv"].zustand["status"] == "laeuft":
                    return self._json({"fehler": "Es läuft bereits eine Erhebung."}, 409)
                leeren()
                c = verb()
                if koerper.get("fnrs"):
                    fnrs = koerper["fnrs"]
                else:
                    sql = "SELECT fnr FROM unternehmen"
                    par = []
                    if koerper.get("branche"):
                        sql += " WHERE branche=?"
                        par.append(koerper["branche"])
                    sql += " ORDER BY name"
                    if koerper.get("grenze"):
                        sql += f" LIMIT {int(koerper['grenze'])}"
                    fnrs = [r["fnr"] for r in c.execute(sql, par)]
                e = einstellungen(c)
                c.close()
                modus = koerper.get("modus", "probe")
                if modus == "neu":
                    # Erst neue Gesellschaften suchen, dann deren Daten abrufen.
                    br = koerper.get("stichwoerter") or koerper.get("branche")
                    anzahl = int(koerper.get("grenze") or 25)
                    c2 = verb()
                    schon = {r["fnr"] for r in c2.execute("SELECT fnr FROM unternehmen")}
                    c2.close()
                    treffer = A.neue_suchen(e, br, anzahl, schon)
                    if not treffer:
                        return self._json({"fehler":
                            "Über den Suchendpunkt kamen keine neuen Gesellschaften zurück. "
                            "Unter Einstellungen lässt sich mit „Verbindung prüfen“ nachsehen, "
                            "was die Schnittstelle antwortet."}, 502)
                    c2 = verb()
                    for t in treffer:
                        c2.execute("INSERT OR IGNORE INTO unternehmen(fnr,name,branche,rechtsform,quelle_url) "
                                   "VALUES(?,?,?,?,?)",
                                   (t["fnr"], t.get("name") or t["fnr"], t["branche"], "GmbH",
                                    f"https://openfirmenbuch.at/company/?fnr={t['fnr']}"))
                    c2.commit(); c2.close()
                    fnrs = [t["fnr"] for t in treffer]
                    modus = "live"
                    l = A.Lauf(DB, modus, fnrs, e,
                               koerper.get("notiz", "") or f"Neue Gesellschaften, Branche {br}")
                    LAUF["aktiv"] = l
                    l.starten()
                    return self._json({"ok": True, "ziel": len(fnrs), "modus": "neu",
                                       "gefunden": len(treffer)})
                # openfirmenbuch.at ist frei zugaenglich, ein Zugangsschluessel ist
                # nicht erforderlich. Er wird nur mitgesendet, wenn einer hinterlegt ist.
                if modus == "live" and not (e.get("api_basis") or "").strip():
                    return self._json({"fehler": "Für den Live-Abruf fehlt die Grundadresse der Schnittstelle."}, 400)
                l = A.Lauf(DB, modus, fnrs, e, koerper.get("notiz", ""))
                LAUF["aktiv"] = l
                l.starten()
                return self._json({"ok": True, "ziel": len(fnrs), "modus": modus})
            if u.path == "/api/erhebung/stop":
                if LAUF["aktiv"]:
                    LAUF["aktiv"].abbruch.set()
                return self._json({"ok": True})
            if u.path == "/api/prognose/start":
                if MODELL["zustand"] and MODELL["zustand"].get("status") == "laeuft":
                    return self._json({"fehler": "Die Auswertung läuft bereits."}, 409)
                threading.Thread(target=prognose_rechnen, daemon=True).start()
                return self._json({"ok": True})
            if u.path == "/api/einstellungen":
                c = verb()
                for k, v in koerper.items():
                    if k == "api_schluessel" and (not v or v.startswith("•")):
                        continue
                    c.execute("INSERT INTO einstellung(schluessel,wert) VALUES(?,?) "
                              "ON CONFLICT(schluessel) DO UPDATE SET wert=excluded.wert", (k, str(v)))
                c.commit()
                c.close()
                return self._json({"ok": True})
            if u.path == "/api/leeren":
                leeren()
                return self._json({"ok": True})
            self._send(404, "nicht gefunden", "text/plain; charset=utf-8")
        except Exception as ex:
            import traceback
            traceback.print_exc()
            self._json({"fehler": f"{type(ex).__name__}: {ex}"}, 500)

    # ------------------------------------------------------------- Teilstuecke
    def _datei(self, rel):
        pfad = os.path.normpath(os.path.join(WEB, rel))
        if not pfad.startswith(WEB) or not os.path.isfile(pfad):
            return self._send(404, "nicht gefunden", "text/plain; charset=utf-8")
        typ = {"html": "text/html; charset=utf-8", "js": "application/javascript; charset=utf-8",
               "css": "text/css; charset=utf-8", "svg": "image/svg+xml",
               "woff2": "font/woff2"}.get(pfad.rsplit(".", 1)[-1], "application/octet-stream")
        with open(pfad, "rb") as f:
            self._send(200, f.read(), typ)

    def _liste(self, q):
        R = alle_jahre()
        pro = defaultdict(list)
        for r in R:
            pro[r["fnr"]].append(r)
        c = verb()
        aus = []
        for u in c.execute("SELECT * FROM unternehmen"):
            js = pro.get(u["fnr"], [])
            letzt = max(js, key=lambda r: r["gj"]) if js else None
            aus.append({
                "fnr": u["fnr"], "name": u["name"], "branche": u["branche"], "sitz": u["sitz"],
                "jahre": len(js), "von": u["jahr_von"], "bis": u["jahr_bis"],
                "klasse": K.klasse_unternehmen([(r["gj"], r.get("bilanzsumme")) for r in js]),
                "bilanzsumme": letzt.get("bilanzsumme") if letzt else None,
                "ekq": letzt["kz"]["eigenkapitalquote"] if letzt else None,
                "liq": letzt["kz"]["liquiditaet_2"] if letzt else None,
                "auffaellig": sum(1 for r in js if r["auff"]["auffaellig"]),
                "guv": sum(1 for r in js if r.get("guv_offengelegt")),
                "url": u["quelle_url"],
            })
        c.close()
        s = (q.get("such") or "").strip().lower()
        if s:
            aus = [x for x in aus if s in (x["name"] or "").lower() or s in x["fnr"].lower()
                   or s in (x["sitz"] or "").lower()]
        if q.get("branche"):
            aus = [x for x in aus if x["branche"] == q["branche"]]
        if q.get("klasse"):
            aus = [x for x in aus if x["klasse"] == q["klasse"]]
        if q.get("nur") == "auffaellig":
            aus = [x for x in aus if x["auffaellig"] > 0]
        sort = q.get("sort", "name")
        ab = q.get("richtung", "auf") == "ab"
        aus.sort(key=lambda x: (x.get(sort) is None, x.get(sort) if not isinstance(x.get(sort), str) else x[sort].lower()), reverse=ab)
        seite = int(q.get("seite", 1))
        gr = int(q.get("gr", 40))
        return {"gesamt": len(aus), "seite": seite, "seiten": max(1, math.ceil(len(aus) / gr)),
                "zeilen": aus[(seite - 1) * gr: seite * gr]}

    def _detail(self, fnr):
        c = verb()
        u = c.execute("SELECT * FROM unternehmen WHERE fnr=?", (fnr,)).fetchone()
        if not u:
            c.close()
            return {"fehler": "unbekannt"}
        js = [r for r in alle_jahre() if r["fnr"] == fnr]
        js.sort(key=lambda r: r["gj"])
        h = [dict(x) for x in c.execute(
            "SELECT * FROM herkunft WHERE fnr=? ORDER BY gj DESC, feld", (fnr,))]
        c.close()
        pos = ["bilanzsumme", "eigenkapital", "anlagevermoegen", "umlaufvermoegen", "vorraete",
               "forderungen", "liquide_mittel", "rueckstellungen", "verbindlichkeiten",
               "kfr_verbindlichkeiten", "lfr_verbindlichkeiten", "umsatzerloese", "ebit",
               "jahresueberschuss"]
        return {
            "stamm": dict(u),
            "klasse": K.klasse_unternehmen([(r["gj"], r.get("bilanzsumme")) for r in js]),
            "jahre": [{"gj": r["gj"], "groesse": r["groesse"], "guv": r.get("guv_offengelegt"),
                       "bilanz": {k: r.get(k) for k in pos},
                       "kz": r["kz"], "auff": r["auff"]} for r in js],
            "herkunft": h,
        }


def zugang_richten():
    """Beim Start die geprueften Zugangswerte setzen, falls noch alte
    Einstellungen gespeichert sind. Der Nutzer muss nichts eintragen."""
    richtig = {"api_basis": A.GRUNDADRESSE, "api_pfad": A.ENDPUNKTE["mehrjahr"]}
    c = verb()
    ist = {r["schluessel"]: r["wert"] for r in c.execute("SELECT * FROM einstellung")}
    geaendert = []
    for k, v in richtig.items():
        if (ist.get(k) or "") != v:
            c.execute("INSERT INTO einstellung(schluessel,wert) VALUES(?,?) "
                      "ON CONFLICT(schluessel) DO UPDATE SET wert=excluded.wert", (k, v))
            geaendert.append(f"{k}: {ist.get(k) or 'leer'} -> {v}")
    c.commit()
    c.close()
    if geaendert:
        print("  Zugang berichtigt:")
        for g in geaendert:
            print("    " + g)
    print(f"  Zertifikate   {A.SSL_HERKUNFT}")


def main():
    if not os.path.exists(DB):
        print("Die Datenbank masterarbeit.db fehlt im Programmordner.")
        sys.exit(1)
    zugang_richten()
    srv = ThreadingHTTPServer(("127.0.0.1", PORT), H)
    url = f"http://127.0.0.1:{PORT}/"
    print("\n  Fabian Maier Masterarbeit - Analysewerkzeug")
    print("  " + "-" * 44)
    c = verb()
    print(f"  Unternehmen   {c.execute('SELECT COUNT(*) FROM unternehmen').fetchone()[0]}")
    print(f"  Firmenjahre   {c.execute('SELECT COUNT(*) FROM firmenjahr').fetchone()[0]}")
    print(f"  Einzelwerte   {c.execute('SELECT COUNT(*) FROM herkunft').fetchone()[0]}")
    c.close()
    print(f"\n  Oberflaeche   {url}")
    print("  Beenden       Strg + C\n")
    if os.environ.get("KEIN_BROWSER") != "1":
        threading.Timer(1.0, lambda: webbrowser.open(url)).start()
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        print("\n  Beendet.\n")


if __name__ == "__main__":
    main()
