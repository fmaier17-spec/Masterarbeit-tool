"""Analysekern: Kennzahlen, Auffaelligkeitsregel, Groessenklassen, Prognosemodelle.

Alle Verfahren sind in reinem Python umgesetzt. Das Werkzeug laeuft dadurch ohne
zusaetzlich installierte Pakete auf jedem Rechner mit Python 3.9 oder neuer.
"""
import math, random
from collections import defaultdict

# Reihenfolge wie in den Abbildungen der Arbeit, nicht alphabetisch.
BRANCHEN = ["Bau", "Handel", "Transport", "Gastronomie", "Unternehmensberatung"]

# ---------------------------------------------------------------- Kennzahlen

def teile(z, n):
    if z is None or n in (None, 0):
        return None
    return z / n


def pz(v):
    return None if v is None else v * 100.0


def kennzahlen(r):
    """Vier bilanzbasierte Kennzahlen plus Rentabilitaet, alle in Prozent."""
    bs, ek = r.get("bilanzsumme"), r.get("eigenkapital")
    av = r.get("anlagevermoegen")
    fo, lm = r.get("forderungen"), r.get("liquide_mittel")
    kfr, lfr = r.get("kfr_verbindlichkeiten"), r.get("lfr_verbindlichkeiten")
    ul, vr = r.get("umlaufvermoegen"), r.get("vorraete")
    fk = None if (bs is None or ek is None) else bs - ek
    k = {
        "eigenkapitalquote": pz(teile(ek, bs)),
        "verschuldungsgrad": pz(teile(fk, ek)) if ek not in (None, 0) else None,
        "liquiditaet_2": pz(teile((fo or 0) + (lm or 0), kfr)) if kfr else None,
        "liquiditaet_3": pz(teile(ul, kfr)) if kfr else None,
        "anlagendeckung_2": pz(teile((ek or 0) + (lfr or 0), av)) if av else None,
        "anlagenintensitaet": pz(teile(av, bs)),
        "vorratsquote": pz(teile(vr, bs)),
        "working_capital": None if (ul is None or kfr is None) else ul - kfr,
    }
    ums, jue = r.get("umsatzerloese"), r.get("jahresueberschuss")
    ebit = r.get("ebit")
    k["umsatzrentabilitaet"] = pz(teile(jue, ums)) if ums else None
    k["gesamtkapitalrentabilitaet"] = pz(teile(ebit, bs)) if ebit is not None else None
    k["altman_z"] = altman(r)
    return k


def altman(r):
    """Altman Z'' fuer nicht boersennotierte Gesellschaften."""
    bs = r.get("bilanzsumme")
    if not bs:
        return None
    ul, kfr = r.get("umlaufvermoegen"), r.get("kfr_verbindlichkeiten")
    gr, ebit, ek = r.get("gewinnruecklagen"), r.get("ebit"), r.get("eigenkapital")
    if ul is None or kfr is None or ebit is None or ek is None:
        return None
    fk = bs - ek
    if fk <= 0:
        return None
    return (6.56 * ((ul - kfr) / bs) + 3.26 * ((gr or 0) / bs)
            + 6.72 * (ebit / bs) + 1.05 * (ek / fk))


# ------------------------------------------------------- Auffaelligkeitsregel

SCHWELLE = {"eigenkapitalquote": 20.0, "liquiditaet_2": 100.0, "umsatzrentabilitaet": 0.0}


def auffaellig(k):
    """Drei Dimensionen. Auffaellig ab zwei zugleich kritischen Dimensionen."""
    d = {
        "kapitalstruktur": k["eigenkapitalquote"] is not None and k["eigenkapitalquote"] < SCHWELLE["eigenkapitalquote"],
        "liquiditaet": k["liquiditaet_2"] is not None and k["liquiditaet_2"] < SCHWELLE["liquiditaet_2"],
        "rentabilitaet": k["umsatzrentabilitaet"] is not None and k["umsatzrentabilitaet"] < SCHWELLE["umsatzrentabilitaet"],
    }
    n = sum(d.values())
    return {"dimensionen": d, "anzahl": n, "auffaellig": n >= 2}


# ------------------------------------------------------------ Groessenklassen
# § 221 UGB. Schwellen ab Geschaeftsjahr 2024 um 25 % angehoben.
# Die Beschaeftigtenzahl liegt nicht vor, die Einstufung stuetzt sich auf die
# Bilanzsumme und ist damit eine Naeherung.

GRENZEN = {
    "alt": {"kleinst": 450_000, "klein": 5_000_000, "mittel": 20_000_000},
    "neu": {"kleinst": 562_500, "klein": 6_250_000, "mittel": 25_000_000},
}


def groessenklasse(bs, gj):
    if bs is None:
        return None
    g = GRENZEN["neu"] if gj >= 2024 else GRENZEN["alt"]
    if bs <= g["kleinst"]:
        return "Kleinst"
    if bs <= g["klein"]:
        return "Klein"
    if bs <= g["mittel"]:
        return "Mittelgross"
    return "Gross"


def klasse_unternehmen(jahre):
    """Zwei-Jahres-Regel: die hoehere Klasse gilt erst, wenn sie an zwei
    aufeinanderfolgenden Abschlussstichtagen ueberschritten wird."""
    kl = [groessenklasse(bs, gj) for gj, bs in sorted(jahre) if bs is not None]
    if not kl:
        return None
    aktuell = kl[0]
    for i in range(1, len(kl)):
        if kl[i] == kl[i - 1] and kl[i] != aktuell:
            aktuell = kl[i]
    return aktuell


# ------------------------------------------------------------------ Statistik

def median(xs):
    s = sorted(x for x in xs if x is not None)
    if not s:
        return None
    n = len(s)
    return s[n // 2] if n % 2 else (s[n // 2 - 1] + s[n // 2]) / 2


def quantil(xs, q):
    s = sorted(x for x in xs if x is not None)
    if not s:
        return None
    if len(s) == 1:
        return s[0]
    p = q * (len(s) - 1)
    lo = int(math.floor(p))
    hi = min(lo + 1, len(s) - 1)
    return s[lo] + (s[hi] - s[lo]) * (p - lo)


def mittel(xs):
    s = [x for x in xs if x is not None]
    return sum(s) / len(s) if s else None


def raenge(xs):
    idx = sorted(range(len(xs)), key=lambda i: xs[i])
    r = [0.0] * len(xs)
    i = 0
    while i < len(idx):
        j = i
        while j + 1 < len(idx) and xs[idx[j + 1]] == xs[idx[i]]:
            j += 1
        mr = (i + j) / 2 + 1
        for k in range(i, j + 1):
            r[idx[k]] = mr
        i = j + 1
    return r


def kruskal_wallis(gruppen):
    """H-Test auf Gleichheit der Verteilungen, mit Bindungskorrektur."""
    daten, zuord = [], []
    for gi, g in enumerate(gruppen):
        for v in g:
            if v is not None:
                daten.append(v)
                zuord.append(gi)
    n = len(daten)
    if n < 3 or len(set(zuord)) < 2:
        return None
    r = raenge(daten)
    summe, anzahl = defaultdict(float), defaultdict(int)
    for gi, rv in zip(zuord, r):
        summe[gi] += rv
        anzahl[gi] += 1
    h = 12.0 / (n * (n + 1)) * sum(summe[g] ** 2 / anzahl[g] for g in summe) - 3 * (n + 1)
    zaehl = defaultdict(int)
    for v in daten:
        zaehl[v] += 1
    korr = 1 - sum(t ** 3 - t for t in zaehl.values()) / (n ** 3 - n) if n > 1 else 1
    if korr > 0:
        h /= korr
    df = len(summe) - 1
    return {"H": h, "df": df, "p": chi2_p(h, df), "n": n}


def mann_whitney(a, b):
    a = [x for x in a if x is not None]
    b = [x for x in b if x is not None]
    if not a or not b:
        return None
    alle = a + b
    r = raenge(alle)
    n1, n2 = len(a), len(b)
    u1 = sum(r[:n1]) - n1 * (n1 + 1) / 2
    u = min(u1, n1 * n2 - u1)
    zaehl = defaultdict(int)
    for v in alle:
        zaehl[v] += 1
    n = n1 + n2
    korr = sum(t ** 3 - t for t in zaehl.values())
    sd = math.sqrt(max(1e-12, (n1 * n2 / 12) * ((n + 1) - korr / (n * (n - 1)))))
    z = (u - n1 * n2 / 2) / sd
    return {"U": u, "z": z, "p": 2 * (1 - phi(abs(z))), "r": abs(z) / math.sqrt(n), "n1": n1, "n2": n2}


def wilcoxon(paare):
    d = [b - a for a, b in paare if a is not None and b is not None and b != a]
    if len(d) < 6:
        return None
    r = raenge([abs(x) for x in d])
    wp = sum(ri for ri, di in zip(r, d) if di > 0)
    wn = sum(ri for ri, di in zip(r, d) if di < 0)
    w, n = min(wp, wn), len(d)
    sd = math.sqrt(n * (n + 1) * (2 * n + 1) / 24)
    z = (w - n * (n + 1) / 4) / sd
    return {"W": w, "z": z, "p": 2 * (1 - phi(abs(z))), "r": abs(z) / math.sqrt(n), "n": n}


def spearman(x, y):
    p = [(a, b) for a, b in zip(x, y) if a is not None and b is not None]
    if len(p) < 4:
        return None
    rx, ry = raenge([a for a, _ in p]), raenge([b for _, b in p])
    n = len(p)
    mx, my = sum(rx) / n, sum(ry) / n
    zx = sum((a - mx) * (b - my) for a, b in zip(rx, ry))
    nx = math.sqrt(sum((a - mx) ** 2 for a in rx) * sum((b - my) ** 2 for b in ry))
    if nx == 0:
        return None
    rho = zx / nx
    t = rho * math.sqrt(max(1e-12, (n - 2) / (1 - min(rho ** 2, 0.999999))))
    return {"rho": rho, "p": 2 * (1 - phi(abs(t))), "n": n}


def benjamini_hochberg(ps):
    """Kontrolle der Falscherkennungsrate bei mehreren Vergleichen."""
    m = len(ps)
    idx = sorted(range(m), key=lambda i: ps[i])
    out = [0.0] * m
    vor = 1.0
    for rang in range(m, 0, -1):
        i = idx[rang - 1]
        vor = min(vor, ps[i] * m / rang)
        out[i] = min(1.0, vor)
    return out


def bootstrap_ki(xs, fn=median, n=1500, alpha=0.05, saat=42):
    s = [x for x in xs if x is not None]
    if len(s) < 5:
        return None
    rnd = random.Random(saat)
    w = sorted(fn([s[rnd.randrange(len(s))] for _ in range(len(s))]) for _ in range(n))
    return {"unten": w[int(alpha / 2 * n)], "oben": w[int((1 - alpha / 2) * n)]}


def phi(z):
    return 0.5 * (1 + math.erf(z / math.sqrt(2)))


def chi2_p(x, df):
    if x <= 0 or df <= 0:
        return 1.0
    return max(0.0, min(1.0, 1.0 - unvollst_gamma(df / 2.0, x / 2.0)))


def unvollst_gamma(s, x):
    if x < s + 1:
        summe = glied = 1.0 / s
        for k in range(1, 300):
            glied *= x / (s + k)
            summe += glied
            if abs(glied) < abs(summe) * 1e-14:
                break
        return summe * math.exp(-x + s * math.log(x) - math.lgamma(s))
    b, c = x + 1 - s, 1e300
    d = h = 1 / b
    for i in range(1, 300):
        an = -i * (i - s)
        b += 2
        d = an * d + b
        if abs(d) < 1e-300:
            d = 1e-300
        c = b + an / c
        if abs(c) < 1e-300:
            c = 1e-300
        d = 1 / d
        de = d * c
        h *= de
        if abs(de - 1) < 1e-14:
            break
    return 1 - math.exp(-x + s * math.log(x) - math.lgamma(s)) * h


def auc(y, s):
    """Flaeche unter der Grenzwertoptimierungskurve, ueber Rangbildung."""
    p = [(a, b) for a, b in zip(y, s) if b is not None]
    if not p:
        return None
    yy = [a for a, _ in p]
    n1 = sum(yy)
    n0 = len(yy) - n1
    if n1 == 0 or n0 == 0:
        return None
    r = raenge([b for _, b in p])
    return (sum(ri for ri, yi in zip(r, yy) if yi == 1) - n1 * (n1 + 1) / 2) / (n1 * n0)


def roc(y, s):
    p = sorted(((b, a) for a, b in zip(y, s) if b is not None), key=lambda t: -t[0])
    n1 = sum(a for _, a in p)
    n0 = len(p) - n1
    if not n1 or not n0:
        return []
    tp = fp = 0
    punkte = [(0.0, 0.0)]
    for _, yi in p:
        if yi:
            tp += 1
        else:
            fp += 1
        punkte.append((round(fp / n0, 5), round(tp / n1, 5)))
    if len(punkte) > 260:
        schritt = len(punkte) / 250
        punkte = [punkte[int(i * schritt)] for i in range(250)] + [punkte[-1]]
    return punkte


def guete(y, p, schwelle=0.5):
    rp = rn = fp = fn = 0
    for yi, pi in zip(y, p):
        v = 1 if pi >= schwelle else 0
        if yi and v:
            rp += 1
        elif yi and not v:
            fn += 1
        elif not yi and v:
            fp += 1
        else:
            rn += 1
    sens = rp / (rp + fn) if rp + fn else 0.0
    spez = rn / (rn + fp) if rn + fp else 0.0
    return {"richtig_positiv": rp, "falsch_negativ": fn, "falsch_positiv": fp, "richtig_negativ": rn,
            "sensitivitaet": sens, "spezifitaet": spez,
            "praezision": rp / (rp + fp) if rp + fp else 0.0,
            "treffergenauigkeit": (rp + rn) / max(1, len(y)),
            "ausgeglichen": (sens + spez) / 2,
            "f1": 2 * rp / max(1, 2 * rp + fp + fn)}


# ------------------------------------------------------------------- Modelle

MERKMALE = ["eigenkapitalquote", "verschuldungsgrad", "liquiditaet_2", "liquiditaet_3",
            "anlagendeckung_2", "anlagenintensitaet", "vorratsquote", "log_bilanzsumme",
            "d_eigenkapitalquote", "d_liquiditaet_2"]

BEZEICHNUNG = {
    "eigenkapitalquote": "Eigenkapitalquote", "verschuldungsgrad": "Verschuldungsgrad",
    "liquiditaet_2": "Liquidität 2. Grades", "liquiditaet_3": "Liquidität 3. Grades",
    "anlagendeckung_2": "Anlagendeckung II", "anlagenintensitaet": "Anlagenintensität",
    "vorratsquote": "Vorratsquote", "log_bilanzsumme": "Bilanzsumme (logarithmiert)",
    "d_eigenkapitalquote": "Veränderung Eigenkapitalquote", "d_liquiditaet_2": "Veränderung Liquidität 2. Grades",
    "umsatzrentabilitaet": "Umsatzrentabilität", "gesamtkapitalrentabilitaet": "Gesamtkapitalrentabilität",
    "altman_z": "Altman Z''", "working_capital": "Working Capital",
}


def stutzen(v, lo=-500.0, hi=2000.0):
    return 0.0 if v is None else max(lo, min(hi, v))


class LogReg:
    """Logistische Regression ueber Gradientenabstieg, mit Standardisierung
    und schwacher Regularisierung."""

    def __init__(self, schritte=800, lr=0.4, l2=1e-3):
        self.schritte, self.lr, self.l2 = schritte, lr, l2

    def fit(self, X, y, fortschritt=None):
        n, m = len(X), len(X[0])
        self.mu = [sum(r[j] for r in X) / n for j in range(m)]
        self.sd = [math.sqrt(max(1e-9, sum((r[j] - self.mu[j]) ** 2 for r in X) / n)) for j in range(m)]
        Z = [[(r[j] - self.mu[j]) / self.sd[j] for j in range(m)] for r in X]
        self.w = [0.0] * m
        self.b = 0.0
        for s in range(self.schritte):
            gw = [0.0] * m
            gb = 0.0
            for zi, yi in zip(Z, y):
                p = 1 / (1 + math.exp(-max(-30, min(30, sum(w * z for w, z in zip(self.w, zi)) + self.b))))
                e = p - yi
                gb += e
                for j in range(m):
                    gw[j] += e * zi[j]
            self.b -= self.lr * gb / n
            for j in range(m):
                self.w[j] -= self.lr * (gw[j] / n + self.l2 * self.w[j])
            if fortschritt and s % 80 == 0:
                fortschritt(s + 1, self.schritte)
        return self

    def predict(self, X):
        out = []
        for r in X:
            z = sum(w * ((r[j] - self.mu[j]) / self.sd[j]) for j, w in enumerate(self.w)) + self.b
            out.append(1 / (1 + math.exp(-max(-30, min(30, z)))))
        return out

    def gewichte(self):
        g = {MERKMALE[j]: self.w[j] for j in range(len(self.w))}
        return dict(sorted(g.items(), key=lambda x: -abs(x[1])))


class Knoten:
    __slots__ = ("merkmal", "schwelle", "links", "rechts", "wert")


def _bester_schnitt(B, y, idx, kandidaten, min_blatt):
    bester = None
    n = len(idx)
    for j in kandidaten:
        hn = [0] * 32
        hp = [0] * 32
        for i in idx:
            b = B[i][j]
            hn[b] += 1
            hp[b] += y[i]
        gn, gp = n, sum(hp)
        cn = cp = 0
        for b in range(31):
            cn += hn[b]
            cp += hp[b]
            rn = gn - cn
            if cn < min_blatt or rn < min_blatt:
                continue
            rp = gp - cp
            pl, pr = cp / cn, rp / rn
            g = (cn * pl * (1 - pl) + rn * pr * (1 - pr)) * 2 / n
            if bester is None or g < bester[0]:
                bester = (g, j, b)
    return bester


class RandomForest:
    """Zufallswald mit histogrammbasierter Aufteilung. 32 Klassen je Merkmal,
    dadurch bleibt die Anpassung auch in reinem Python zuegig."""

    def __init__(self, baeume=60, tiefe=7, min_blatt=12, saat=42):
        self.baeume, self.tiefe, self.min_blatt, self.saat = baeume, tiefe, min_blatt, saat

    def _binne(self, X):
        G = self.grenzen
        out = []
        for r in X:
            z = []
            for j, v in enumerate(r):
                g = G[j]
                lo, hi = 0, len(g)
                while lo < hi:
                    mi = (lo + hi) // 2
                    if v > g[mi]:
                        lo = mi + 1
                    else:
                        hi = mi
                z.append(lo)
            out.append(z)
        return out

    def fit(self, X, y, fortschritt=None):
        m = len(X[0])
        self.grenzen = []
        for j in range(m):
            s = sorted(r[j] for r in X)
            self.grenzen.append([s[int(len(s) * k / 32)] for k in range(1, 32)])
        B = self._binne(X)
        rnd = random.Random(self.saat)
        k = max(1, int(math.sqrt(m)))
        self.wald = []
        for t in range(self.baeume):
            idx = [rnd.randrange(len(X)) for _ in range(len(X))]
            self.wald.append(self._baue(B, y, idx, 0, rnd, k))
            if fortschritt:
                fortschritt(t + 1, self.baeume)
        return self

    def _baue(self, B, y, idx, tiefe, rnd, k):
        kn = Knoten()
        p = sum(y[i] for i in idx) / len(idx)
        if tiefe >= self.tiefe or len(idx) < 2 * self.min_blatt or p in (0.0, 1.0):
            kn.merkmal, kn.wert = None, p
            return kn
        b = _bester_schnitt(B, y, idx, rnd.sample(range(len(B[0])), k), self.min_blatt)
        if b is None:
            kn.merkmal, kn.wert = None, p
            return kn
        _, j, s = b
        kn.merkmal, kn.schwelle = j, s
        kn.links = self._baue(B, y, [i for i in idx if B[i][j] <= s], tiefe + 1, rnd, k)
        kn.rechts = self._baue(B, y, [i for i in idx if B[i][j] > s], tiefe + 1, rnd, k)
        return kn

    def predict(self, X):
        out = []
        for r in self._binne(X):
            s = 0.0
            for b in self.wald:
                kn = b
                while kn.merkmal is not None:
                    kn = kn.links if r[kn.merkmal] <= kn.schwelle else kn.rechts
                s += kn.wert
            out.append(s / len(self.wald))
        return out

    def bedeutung(self):
        z = defaultdict(float)

        def lauf(kn, g):
            if kn.merkmal is None:
                return
            z[MERKMALE[kn.merkmal]] += g
            lauf(kn.links, g * 0.5)
            lauf(kn.rechts, g * 0.5)

        for b in self.wald:
            lauf(b, 1.0)
        s = sum(z.values()) or 1
        return {k: v / s for k, v in sorted(z.items(), key=lambda x: -x[1])}
