/* Diagramme im Bildstil der Masterarbeit.

   Nachgebildet sind Titelsatz, Farbwahl, Gitter, Beschriftung und Zahlensatz der
   Abbildungen 1 bis 20. Jede Grafik traegt Titel und Untertitel im SVG selbst und
   verwendet ausschliesslich feste Farbwerte. Dadurch bleibt eine heruntergeladene
   Datei fuer sich allein vollstaendig und sieht aus wie in der Arbeit.

   Ohne Fremdbibliothek, damit die Oberflaeche auch ohne Netzverbindung laeuft. */

/* ------------------------------------------------------------ Gestaltung */
export const FARBE = {
  Bau: '#4F9CF9', Handel: '#3ECF8E', Transport: '#A78BFA',
  Gastronomie: '#F5B544', Unternehmensberatung: '#F2545B', Beratung: '#F2545B'
};
/* Reihenfolge und Kurzform wie in den Abbildungen der Arbeit */
export const BRANCHEN = ['Bau', 'Handel', 'Transport', 'Gastronomie', 'Unternehmensberatung'];
export const KURZ = { Unternehmensberatung: 'Beratung' };
export const GROESSE = {
  Kleinst: '#4F9CF9', Klein: '#3ECF8E', Mittelgross: '#F5B544', Gross: '#F2545B'
};
export const T = {
  titel: '#232733', unter: '#8A8FA0', achse: '#6E7480', gitter: '#E9E9EE',
  null: '#B8BCC6', grund: '#FFFFFF', dunkel: '#232733', quelle: '#A6AAB6',
  logit: '#2E6DA4', wald: '#3D8F6D', zufall: '#CC3311', warnband: '#FDF3E0',
  warntext: '#B7791F'
};
const SCHRIFT = 'Verdana, "DejaVu Sans", "Bitstream Vera Sans", Geneva, Tahoma, sans-serif';

/* ------------------------------------------------------------- Zahlensatz */
export const z = (v, n = 1) => v === null || v === undefined || Number.isNaN(v)
  ? '–' : v.toLocaleString('de-DE', { minimumFractionDigits: n, maximumFractionDigits: n });
export const g = v => v === null || v === undefined ? '–' : Math.round(v).toLocaleString('de-DE');
export const pz = (v, n = 1) => v === null || v === undefined ? '–' : z(v, n) + ' %';
export const eur = v => {
  if (v === null || v === undefined) return '–';
  const a = Math.abs(v);
  if (a >= 1e9) return z(v / 1e9, 2) + ' Mrd.';
  if (a >= 1e6) return z(v / 1e6, 2) + ' Mio.';
  if (a >= 1e3) return z(v / 1e3, 1) + ' Tsd.';
  return g(v);
};
const kurz = n => KURZ[n] || n;
/* Zwischen Zahl und Einheit gehoert ein Abstand: 28,8 % statt 28,8%. */
const mitEinheit = (t, e) => !e ? t : t + (e.startsWith(' ') ? e : ' ' + e);

/* ----------------------------------------------------------------- Bausteine */
const NS = 'http://www.w3.org/2000/svg';
const el = (t, a = {}) => {
  const n = document.createElementNS(NS, t);
  for (const k in a) if (a[k] !== null && a[k] !== undefined) n.setAttribute(k, a[k]);
  return n;
};
const txt = (s, a = {}) => {
  const n = el('text', { 'font-family': SCHRIFT, ...a });
  n.textContent = s;
  return n;
};

let hf;
function hinweis(knoten, text) {
  if (!hf) { hf = document.createElement('div'); hf.className = 'hinweisfeld'; document.body.appendChild(hf); }
  knoten.addEventListener('mousemove', e => {
    hf.textContent = text;
    hf.classList.add('an');
    const b = hf.getBoundingClientRect();
    hf.style.left = Math.min(window.innerWidth - b.width - 12, e.clientX + 14) + 'px';
    hf.style.top = Math.max(8, e.clientY - b.height - 10) + 'px';
  });
  knoten.addEventListener('mouseleave', () => hf.classList.remove('an'));
}

/* Grundgeruest einer Abbildung: weisse Flaeche, Titel, Untertitel, Quellenzeile. */
function figur(o) {
  const b = o.breite || 900;
  const h = o.hoehe || 400;
  const s = el('svg', {
    viewBox: `0 0 ${b} ${h}`, class: 'abb-svg', xmlns: NS,
    preserveAspectRatio: 'xMidYMid meet'
  });
  s.appendChild(el('rect', { x: 0, y: 0, width: b, height: h, fill: T.grund }));
  let oben = 14;
  if (o.titel) {
    s.appendChild(txt(o.titel, {
      x: 14, y: oben + 17, 'font-size': 19, 'font-weight': 700, fill: T.titel
    }));
    oben += 26;
  }
  if (o.unter) {
    s.appendChild(txt(o.unter, { x: 14, y: oben + 14, 'font-size': 13.5, fill: T.unter }));
    oben += 22;
  }
  const unten = o.quelle ? 26 : 0;
  if (o.quelle) s.appendChild(txt(o.quelle, { x: 14, y: h - 9, 'font-size': 11.5, fill: T.quelle }));
  return {
    s, b, h,
    l: o.links ?? 62, r: b - (o.rechts ?? 20),
    o: oben + (o.abstand ?? 22), u: h - (o.fuss ?? 40) - unten,
    get bb() { return this.r - this.l; },
    get hh() { return this.u - this.o; }
  };
}

function skala(max, min = 0, teile = 5) {
  if (max === min) { max = min + 1; }
  const roh = (max - min) / teile;
  const p = Math.pow(10, Math.floor(Math.log10(Math.abs(roh) || 1)));
  const s = [1, 2, 2.5, 5, 10].find(x => x * p >= roh) * p;
  return { unten: Math.floor(min / s) * s, oben: Math.ceil(max / s) * s, schritt: s };
}

/* Waagrechtes Gitter mit Achsenbeschriftung, ohne Rahmenlinien. */
function gitter(k, sk, fmt = z, achse) {
  for (let v = sk.unten; v <= sk.oben + 1e-9; v += sk.schritt) {
    const y = k.u - (v - sk.unten) / (sk.oben - sk.unten) * k.hh;
    k.s.appendChild(el('line', {
      x1: k.l, x2: k.r, y1: y, y2: y,
      stroke: Math.abs(v) < 1e-9 ? T.null : T.gitter, 'stroke-width': Math.abs(v) < 1e-9 ? 1.6 : 1.2
    }));
    k.s.appendChild(txt(fmt(v), {
      x: k.l - 10, y: y + 5, 'text-anchor': 'end', 'font-size': 13, fill: T.achse
    }));
  }
  if (achse) k.s.appendChild(txt(achse, {
    x: 0, y: 0, 'text-anchor': 'middle', 'font-size': 13, fill: T.achse,
    transform: `translate(18 ${k.o + k.hh / 2}) rotate(-90)`
  }));
}

/* ------------------------------------------------- Herunterladen der Grafik */
function ausSvg(svg) {
  const k = svg.cloneNode(true);
  k.setAttribute('xmlns', NS);
  k.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');
  const vb = k.getAttribute('viewBox').split(' ');
  k.setAttribute('width', vb[2]);
  k.setAttribute('height', vb[3]);
  return '<?xml version="1.0" encoding="UTF-8"?>\n' + new XMLSerializer().serializeToString(k);
}
function sichern(name, art, svg) {
  const quelle = ausSvg(svg);
  if (art === 'svg') return lade(new Blob([quelle], { type: 'image/svg+xml' }), name + '.svg');
  const vb = svg.getAttribute('viewBox').split(' ');
  const w = +vb[2], h = +vb[3], f = 2.5;
  const bild = new Image();
  bild.onload = () => {
    const c = document.createElement('canvas');
    c.width = w * f; c.height = h * f;
    const x = c.getContext('2d');
    x.fillStyle = T.grund; x.fillRect(0, 0, c.width, c.height);
    x.drawImage(bild, 0, 0, c.width, c.height);
    c.toBlob(bl => lade(bl, name + '.png'), 'image/png');
  };
  bild.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(quelle)));
}
function lade(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

/* Grafik einsetzen und mit Ladeschaltflaechen versehen. */
function einsetzen(ziel, k, o) {
  const name = (o.datei || o.titel || 'abbildung').toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
  const h = document.createElement('div');
  h.className = 'abb';
  h.appendChild(k.s);
  const leiste = document.createElement('div');
  leiste.className = 'abb-laden';
  for (const [art, bez] of [['png', 'PNG'], ['svg', 'SVG']]) {
    const b = document.createElement('button');
    b.className = 'knopf klein';
    b.type = 'button';
    b.textContent = bez;
    b.title = `Abbildung als ${bez} sichern`;
    b.onclick = () => sichern(name, art, k.s);
    leiste.appendChild(b);
  }
  h.appendChild(leiste);
  ziel.replaceChildren(h);
  return k.s;
}

/* ============================================================ Säulen (Abb. 2–5, 9, 10, 15, 17) */
export function balken(ziel, daten, o = {}) {
  const k = figur({ hoehe: o.hoehe || 340, ...o });
  const fmt = o.format || g;
  const werte = daten.flatMap(d => [d.wert, d.ki?.oben ?? d.wert]).filter(v => v !== null);
  const sk = skala(Math.max(...werte, 0), Math.min(0, ...daten.map(d => d.wert)), 4);
  if (o.band) {
    const y1 = k.u - (o.band.bis - sk.unten) / (sk.oben - sk.unten) * k.hh;
    const y2 = k.u - (o.band.von - sk.unten) / (sk.oben - sk.unten) * k.hh;
    k.s.appendChild(el('rect', {
      x: k.l, y: y1, width: k.bb, height: Math.max(0, y2 - y1), fill: T.warnband
    }));
    if (o.band.text) k.s.appendChild(txt(o.band.text, {
      x: k.l + 6, y: y1 - 7, 'font-size': 12, fill: T.warntext, 'font-weight': 600
    }));
  }
  gitter(k, sk, o.achsformat || (v => z(v, 0)), o.yLabel);
  const sb = k.bb / daten.length;
  const bw = Math.min(o.maxBreite || 108, sb * 0.62);
  const py = v => k.u - (v - sk.unten) / (sk.oben - sk.unten) * k.hh;
  daten.forEach((d, i) => {
    const x = k.l + sb * i + sb / 2;
    const f = d.farbe || FARBE[d.name] || '#4F9CF9';
    const y = py(Math.max(0, d.wert));
    const hoehe = Math.abs(py(d.wert) - py(0));
    const r = el('rect', { x: x - bw / 2, y, width: bw, height: Math.max(1, hoehe), fill: f, class: 'stab' });
    hinweis(r, `${kurz(d.name)}\n${mitEinheit(fmt(d.wert), o.einheit)}` +
      (d.n !== undefined ? `\nn = ${g(d.n)}` : '') +
      (d.ki ? `\n95-%-Bereich ${fmt(d.ki.unten)} bis ${fmt(d.ki.oben)}` : ''));
    k.s.appendChild(r);
    if (d.ki && d.ki.oben !== null) {
      const [a, b2] = [py(d.ki.oben), py(d.ki.unten)];
      k.s.appendChild(el('line', { x1: x, x2: x, y1: a, y2: b2, stroke: T.dunkel, 'stroke-width': 2 }));
      [a, b2].forEach(yy => k.s.appendChild(el('line', {
        x1: x - 9, x2: x + 9, y1: yy, y2: yy, stroke: T.dunkel, 'stroke-width': 2
      })));
    }
    /* Wert innerhalb der Saeule, wie in den Abbildungen der Arbeit */
    if (o.werte !== false) {
      const passt = hoehe > 34;
      k.s.appendChild(txt(mitEinheit(fmt(d.wert), o.einheit), {
        x, y: passt ? py(0) - 16 : y - 9, 'text-anchor': 'middle',
        'font-size': 15, 'font-weight': 700, fill: passt ? '#FFFFFF' : T.dunkel
      }));
    }
    k.s.appendChild(txt(kurz(d.name), {
      x, y: k.u + 22, 'text-anchor': 'middle', 'font-size': 13.5, fill: T.achse
    }));
    if (o.zweitzeile && d.n !== undefined) k.s.appendChild(txt('n = ' + g(d.n), {
      x, y: k.u + 39, 'text-anchor': 'middle', 'font-size': 11.5, fill: T.quelle
    }));
  });
  return einsetzen(ziel, k, o);
}

/* ==================================================== Balken waagrecht (Abb. 19) */
export function hbalken(ziel, daten, o = {}) {
  const zeile = o.zeile || 30;
  const k = figur({
    hoehe: (o.hoehe || daten.length * zeile + 120), links: o.links ?? 250,
    rechts: o.rechts ?? 78, fuss: 18, ...o
  });
  const fmt = o.format || (v => z(v, 1));
  const max = Math.max(...daten.map(d => d.wert), 1e-9);
  daten.forEach((d, i) => {
    const y = k.o + i * zeile;
    k.s.appendChild(txt(kurz(d.name), {
      x: k.l - 12, y: y + zeile / 2 + 5, 'text-anchor': 'end', 'font-size': 13.5, fill: T.achse
    }));
    const hoch = Math.min(19, zeile - 8);
    const w = Math.max(2, d.wert / max * k.bb);
    const r = el('rect', {
      x: k.l, y: y + (zeile - hoch) / 2, width: w, height: hoch,
      fill: d.farbe || FARBE[d.name] || '#4F9CF9', class: 'stab'
    });
    hinweis(r, `${kurz(d.name)}\n${mitEinheit(fmt(d.wert), o.einheit)}`);
    k.s.appendChild(r);
    k.s.appendChild(txt(mitEinheit(fmt(d.wert), o.einheit), {
      x: k.l + w + 9, y: y + zeile / 2 + 5, 'font-size': 12.5, fill: T.dunkel, 'font-weight': 600
    }));
  });
  return einsetzen(ziel, k, o);
}

/* ====================================================== Kastengrafik (Abb. 6, 11) */
export function kasten(ziel, daten, o = {}) {
  const k = figur({ hoehe: o.hoehe || 380, ...o });
  const fmt = o.format || (v => z(v, 1));
  const alle = daten.flatMap(d => [d.p10, d.p90, d.q1, d.q3, d.median]).filter(v => v !== null && v !== undefined);
  if (!alle.length) { ziel.replaceChildren(); return null; }
  const deckel = o.kappen ?? null;
  const hoch = deckel !== null ? deckel : Math.max(...alle);
  /* Fuenf Abschnitte statt vier: bei Verteilungen mit negativen Werten bleibt
     dadurch weniger leere Flaeche unterhalb der Kaesten stehen. */
  const sk = skala(hoch, Math.min(0, ...alle), 5);
  gitter(k, sk, o.achsformat || (v => z(v, 0)), o.yLabel);
  const py = v => k.u - (Math.min(Math.max(v, sk.unten), sk.oben) - sk.unten) / (sk.oben - sk.unten) * k.hh;
  const sb = k.bb / daten.length, bw = Math.min(96, sb * 0.5);
  daten.forEach((d, i) => {
    if (d.median === null || d.median === undefined) return;
    const x = k.l + sb * i + sb / 2;
    const f = FARBE[d.branche] || '#4F9CF9';
    const gr = el('g');
    /* Antenne, im Bildstil der Arbeit duenn und grau hinter dem Kasten */
    gr.appendChild(el('line', {
      x1: x, x2: x, y1: py(d.p90), y2: py(d.p10), stroke: '#B0B4BE', 'stroke-width': 1.6
    }));
    gr.appendChild(el('rect', {
      x: x - bw / 2, y: py(d.q3), width: bw, height: Math.max(2, py(d.q1) - py(d.q3)), fill: f
    }));
    gr.appendChild(el('line', {
      x1: x - bw / 2, x2: x + bw / 2, y1: py(d.median), y2: py(d.median),
      stroke: '#FFFFFF', 'stroke-width': 3.4
    }));
    hinweis(gr, `${kurz(d.branche)}   n = ${g(d.n)}\nMedian ${fmt(d.median)}\n` +
      `Quartile ${fmt(d.q1)} bis ${fmt(d.q3)}\nDezile ${fmt(d.p10)} bis ${fmt(d.p90)}`);
    k.s.appendChild(gr);
    /* Dreieck zeigt an, dass die Verteilung ueber die Achse hinausreicht */
    if (deckel !== null && d.p90 > sk.oben) k.s.appendChild(el('path', {
      d: `M ${x} ${k.o - 4} l 6 9 l -12 0 z`, fill: '#B0B4BE'
    }));
    k.s.appendChild(txt(mitEinheit(fmt(d.median), o.einheit), {
      x, y: k.o - 10, 'text-anchor': 'middle', 'font-size': 14, 'font-weight': 700, fill: T.dunkel
    }));
    k.s.appendChild(txt(kurz(d.branche), {
      x, y: k.u + 22, 'text-anchor': 'middle', 'font-size': 13.5, fill: T.achse
    }));
  });
  return einsetzen(ziel, k, o);
}

/* ======================================================= Linien (Abb. 8, 14) */
export function linie(ziel, x, reihen, o = {}) {
  const mehr = reihen.length > 1;
  const k = figur({
    hoehe: o.hoehe || 350, rechts: o.rechts ?? (o.endwerte === false ? 20 : 84),
    abstand: mehr ? 44 : 22, ...o
  });
  const fmt = o.format || (v => z(v, 1));
  const alle = reihen.flatMap(r => r.werte).filter(v => v !== null && v !== undefined);
  if (!alle.length) { ziel.replaceChildren(); return null; }
  const sk = skala(Math.max(...alle), o.nullBasis ? 0 : Math.min(...alle), 4);
  /* Legende waagrecht oberhalb der Zeichenflaeche */
  if (mehr) {
    let lx = k.l + 4;
    reihen.forEach((r, i) => {
      const f = r.farbe || FARBE[r.name] || '#4F9CF9';
      k.s.appendChild(el('line', {
        x1: lx, x2: lx + 26, y1: k.o - 26, y2: k.o - 26, stroke: f, 'stroke-width': 3
      }));
      k.s.appendChild(el('circle', { cx: lx + 13, cy: k.o - 26, r: 5, fill: f }));
      const n = kurz(r.name);
      k.s.appendChild(txt(n, { x: lx + 33, y: k.o - 21, 'font-size': 13.5, fill: T.achse }));
      lx += 33 + n.length * 7.4 + 26;
    });
  }
  gitter(k, sk, o.achsformat || (v => z(v, 0)), o.yLabel);
  const px = i => k.l + (x.length === 1 ? k.bb / 2 : i / (x.length - 1) * k.bb);
  const py = v => k.u - (v - sk.unten) / (sk.oben - sk.unten) * k.hh;
  x.forEach((v, i) => k.s.appendChild(txt(v, {
    x: px(i), y: k.u + 22, 'text-anchor': 'middle', 'font-size': 13.5, fill: T.achse
  })));
  reihen.forEach((r, ri) => {
    const f = r.farbe || FARBE[r.name] || '#4F9CF9';
    const pkt = r.werte.map((v, i) => v === null || v === undefined ? null : [px(i), py(v)]);
    let d = '';
    pkt.forEach((p, i) => { if (p) d += (d && pkt[i - 1] ? ' L ' : ' M ') + p[0] + ' ' + p[1]; });
    if (d) k.s.appendChild(el('path', {
      d: d.trim(), fill: 'none', stroke: f, 'stroke-width': 3,
      'stroke-linecap': 'round', 'stroke-linejoin': 'round'
    }));
    pkt.forEach((p, i) => {
      if (!p) return;
      const c = el('circle', { cx: p[0], cy: p[1], r: 5.5, fill: f });
      hinweis(c, `${kurz(r.name)}\n${x[i]}: ${mitEinheit(fmt(r.werte[i]), o.einheit)}`);
      k.s.appendChild(c);
    });
    /* Endwert in Reihenfarbe, wie in Abbildung 8 */
    const letzt = [...pkt].reverse().find(p => p);
    const wert = [...r.werte].reverse().find(v => v !== null && v !== undefined);
    if (o.endwerte !== false && letzt) k.s.appendChild(txt(fmt(wert), {
      x: letzt[0] + 12, y: letzt[1] + 5, 'font-size': 14, 'font-weight': 700, fill: f
    }));
  });
  return einsetzen(ziel, k, o);
}

/* ========================================== Gestapelte Balken waagrecht (Abb. 16) */
export function stapel(ziel, daten, schluessel, o = {}) {
  const zeile = o.zeile || 54;
  const k = figur({
    hoehe: o.hoehe || daten.length * zeile + 176, links: o.links ?? 132,
    rechts: 26, fuss: 92, ...o
  });
  const summen = daten.map(d => schluessel.reduce((a, s) => a + (d[s.k] || 0), 0));
  const max = o.prozent ? 100 : Math.max(...summen, 1);
  daten.forEach((d, i) => {
    const y = k.o + i * zeile;
    const summe = summen[i] || 1;
    const name = kurz(d.name || d.branche || String(d.gj));
    k.s.appendChild(txt(name, {
      x: k.l - 12, y: y + zeile / 2 + 5, 'text-anchor': 'end', 'font-size': 14, fill: T.achse
    }));
    let x = k.l;
    const hoch = Math.min(38, zeile - 16);
    schluessel.forEach(s => {
      const v = d[s.k] || 0;
      if (!v) return;
      const anteil = o.prozent ? v / summe * 100 : v;
      const w = anteil / max * k.bb;
      const r = el('rect', { x, y: y + (zeile - hoch) / 2, width: w, height: hoch, fill: s.farbe, class: 'stab' });
      hinweis(r, `${name}\n${s.n}: ${g(v)}` + (o.prozent ? ` (${z(anteil, 0)} %)` : ''));
      k.s.appendChild(r);
      if (w > 44) k.s.appendChild(txt(o.prozent ? z(anteil, 0) + ' %' : g(v), {
        x: x + w / 2, y: y + zeile / 2 + 6, 'text-anchor': 'middle',
        'font-size': 14, 'font-weight': 700, fill: '#FFFFFF'
      }));
      x += w;
    });
  });
  /* Achse unten */
  const yA = k.o + daten.length * zeile + 8;
  k.s.appendChild(el('line', { x1: k.l, x2: k.r, y1: yA, y2: yA, stroke: T.null, 'stroke-width': 1.4 }));
  for (let t = 0; t <= 1.001; t += 0.2) {
    k.s.appendChild(txt(z(max * t, 0), {
      x: k.l + k.bb * t, y: yA + 20, 'text-anchor': 'middle', 'font-size': 13, fill: T.achse
    }));
  }
  if (o.xLabel) k.s.appendChild(txt(o.xLabel, {
    x: k.l + k.bb / 2, y: yA + 42, 'text-anchor': 'middle', 'font-size': 13.5, fill: T.achse
  }));
  /* Legende mittig unter der Achse */
  const breiten = schluessel.map(s => 22 + s.n.length * 7.6 + 22);
  let lx = k.l + (k.bb - breiten.reduce((a, b) => a + b, 0)) / 2;
  const ly = k.h - 14;
  schluessel.forEach((s, i) => {
    k.s.appendChild(el('rect', { x: lx, y: ly - 11, width: 17, height: 13, fill: s.farbe, rx: 2 }));
    k.s.appendChild(txt(s.n, { x: lx + 24, y: ly, 'font-size': 13.5, fill: T.achse }));
    lx += breiten[i];
  });
  return einsetzen(ziel, k, o);
}

/* ============================================== Gestapelte Säulen senkrecht */
export function stapelV(ziel, daten, schluessel, o = {}) {
  const k = figur({ hoehe: o.hoehe || 360, fuss: 66, ...o });
  const summen = daten.map(d => schluessel.reduce((a, s) => a + (d[s.k] || 0), 0));
  const sk = skala(Math.max(...summen, 1), 0, 4);
  gitter(k, sk, g, o.yLabel);
  const sb = k.bb / daten.length, bw = Math.min(84, sb * 0.6);
  daten.forEach((d, i) => {
    const x = k.l + sb * i + sb / 2;
    let unten = k.u;
    schluessel.forEach(s => {
      const v = d[s.k] || 0;
      if (!v) return;
      const hoehe = v / (sk.oben - sk.unten) * k.hh;
      const r = el('rect', { x: x - bw / 2, y: unten - hoehe, width: bw, height: hoehe, fill: s.farbe, class: 'stab' });
      hinweis(r, `${d.name || d.gj}\n${s.n}: ${g(v)}`);
      k.s.appendChild(r);
      if (hoehe > 20) k.s.appendChild(txt(g(v), {
        x, y: unten - hoehe / 2 + 5, 'text-anchor': 'middle',
        'font-size': 12.5, 'font-weight': 700, fill: '#FFFFFF'
      }));
      unten -= hoehe;
    });
    k.s.appendChild(txt(String(d.name || d.gj), {
      x, y: k.u + 22, 'text-anchor': 'middle', 'font-size': 13.5, fill: T.achse
    }));
  });
  let breiten = schluessel.map(s => 22 + s.n.length * 7.6 + 22);
  let lx = k.l + (k.bb - breiten.reduce((a, b) => a + b, 0)) / 2;
  schluessel.forEach((s, i) => {
    k.s.appendChild(el('rect', { x: lx, y: k.h - 27, width: 17, height: 13, fill: s.farbe, rx: 2 }));
    k.s.appendChild(txt(s.n, { x: lx + 24, y: k.h - 16, 'font-size': 13.5, fill: T.achse }));
    lx += breiten[i];
  });
  return einsetzen(ziel, k, o);
}

/* ================================================== Häufigkeitsverteilung */
export function histogramm(ziel, werte, o = {}) {
  const k = figur({ hoehe: o.hoehe || 340, ...o });
  if (!werte.length) { ziel.replaceChildren(); return null; }
  const s = [...werte].sort((a, c) => a - c);
  const lo = o.von ?? s[Math.floor(s.length * .01)];
  const hi = o.bis ?? s[Math.floor(s.length * .99)];
  const n = o.klassen || 36, w = (hi - lo) / n || 1;
  const f = new Array(n).fill(0);
  s.forEach(v => { const i = Math.floor((v - lo) / w); if (i >= 0 && i < n) f[i]++; });
  const sk = skala(Math.max(...f), 0, 4);
  gitter(k, sk, g, o.yLabel || 'Firmenjahre');
  const bw = k.bb / n;
  f.forEach((c, i) => {
    const hoehe = c / (sk.oben - sk.unten) * k.hh;
    const r = el('rect', {
      x: k.l + i * bw + 0.6, y: k.u - hoehe, width: Math.max(1, bw - 1.2),
      height: Math.max(0, hoehe), fill: o.farbe || '#4F9CF9', class: 'stab'
    });
    hinweis(r, `${z(lo + i * w)} bis ${z(lo + (i + 1) * w)}\n${g(c)} Firmenjahre`);
    k.s.appendChild(r);
  });
  [0, .25, .5, .75, 1].forEach(t => k.s.appendChild(txt(z(lo + (hi - lo) * t, 0), {
    x: k.l + k.bb * t, y: k.u + 22, 'text-anchor': 'middle', 'font-size': 13, fill: T.achse
  })));
  if (o.marke !== undefined && o.marke !== null && o.marke >= lo && o.marke <= hi) {
    const x = k.l + (o.marke - lo) / (hi - lo) * k.bb;
    k.s.appendChild(el('line', {
      x1: x, x2: x, y1: k.o, y2: k.u, stroke: T.zufall, 'stroke-width': 1.8, 'stroke-dasharray': '6 4'
    }));
    k.s.appendChild(txt(o.markeText || 'Schwelle', {
      x: x + 7, y: k.o + 13, 'font-size': 12.5, fill: T.zufall, 'font-weight': 700
    }));
  }
  return einsetzen(ziel, k, o);
}

/* ============================== Grenzwertoptimierungskurve (Abb. 20) */
export function rocKurve(ziel, kurven, o = {}) {
  const k = figur({
    breite: o.breite || 560, hoehe: o.hoehe || 560, links: 66, rechts: 24, fuss: 58, ...o
  });
  for (let t = 0; t <= 1.001; t += 0.2) {
    const y = k.u - t * k.hh, x = k.l + t * k.bb;
    k.s.appendChild(el('line', { x1: k.l, x2: k.r, y1: y, y2: y, stroke: T.gitter, 'stroke-width': 1.2 }));
    k.s.appendChild(txt(z(t, 1), { x: k.l - 10, y: y + 5, 'text-anchor': 'end', 'font-size': 13, fill: T.achse }));
    k.s.appendChild(txt(z(t, 1), { x, y: k.u + 22, 'text-anchor': 'middle', 'font-size': 13, fill: T.achse }));
  }
  k.s.appendChild(el('line', {
    x1: k.l, y1: k.u, x2: k.r, y2: k.o, stroke: T.zufall, 'stroke-width': 1.8, 'stroke-dasharray': '7 5'
  }));
  kurven.forEach(c => {
    if (!c.punkte || !c.punkte.length) return;
    k.s.appendChild(el('path', {
      d: c.punkte.map((p, j) => `${j ? 'L' : 'M'} ${k.l + p[0] * k.bb} ${k.u - p[1] * k.hh}`).join(' '),
      fill: 'none', stroke: c.farbe, 'stroke-width': 2.6, 'stroke-linejoin': 'round'
    }));
  });
  k.s.appendChild(txt('Falsch-Positiv-Rate', {
    x: k.l + k.bb / 2, y: k.u + 46, 'text-anchor': 'middle', 'font-size': 14, fill: T.achse
  }));
  k.s.appendChild(txt('Richtig-Positiv-Rate', {
    x: 0, y: 0, 'text-anchor': 'middle', 'font-size': 14, fill: T.achse,
    transform: `translate(20 ${k.o + k.hh / 2}) rotate(-90)`
  }));
  /* Legende unten rechts, wie in Abbildung 20 */
  const eintraege = [...kurven.map(c => ({ n: c.name, f: c.farbe, gestrichelt: false })),
  { n: 'Zufall', f: T.zufall, gestrichelt: true }];
  /* Der Block richtet sich am laengsten Eintrag aus, damit nichts abgeschnitten
     wird, egal wie lang die Verfahrensbezeichnung ausfaellt. */
  const breit = Math.max(...eintraege.map(e => e.n.length)) * 7.1 + 62;
  const lx = Math.max(k.l + 6, k.r - breit);
  let ly = k.u - eintraege.length * 26 - 10;
  eintraege.forEach(e => {
    k.s.appendChild(el('line', {
      x1: lx, x2: lx + 42, y1: ly, y2: ly, stroke: e.f, 'stroke-width': 2.6,
      'stroke-dasharray': e.gestrichelt ? '7 5' : null
    }));
    k.s.appendChild(txt(e.n, { x: lx + 52, y: ly + 5, 'font-size': 13.5, fill: T.achse }));
    ly += 26;
  });
  return einsetzen(ziel, k, o);
}

/* ================================================ Rangkorrelation (Abb. 12) */
export function matrix(ziel, felder, werte, o = {}) {
  const n = felder.length;
  const zelle = o.zelle || 62;
  /* Kopfraum fuer die schraeg gesetzten Spaltentitel, darunter genau so viel
     Flaeche, wie die Felder brauchen. */
  const laengste = Math.max(...felder.map(f => f.length)) * 6.6;
  const kopf = o.kopf ?? Math.round(laengste * 0.65 + 16);
  const k = figur({
    breite: 190 + n * zelle + Math.round(laengste * 0.78),
    hoehe: 62 + kopf + n * zelle + 22,
    links: 190, rechts: Math.round(laengste * 0.78), abstand: kopf, fuss: 22, ...o
  });
  const fb = v => {
    /* Blau fuer gleichlaeufig, Rot fuer gegenlaeufig */
    const a = Math.min(1, Math.abs(v));
    const [r1, g1, b1] = v >= 0 ? [47, 75, 216] : [209, 56, 79];
    return `rgb(${Math.round(255 - (255 - r1) * a)},${Math.round(255 - (255 - g1) * a)},${Math.round(255 - (255 - b1) * a)})`;
  };
  felder.forEach((f, i) => {
    k.s.appendChild(txt(f, {
      x: k.l - 10, y: k.o + i * zelle + zelle / 2 + 5, 'text-anchor': 'end',
      'font-size': 12.5, fill: T.achse
    }));
    const x = k.l + i * zelle + zelle / 2;
    k.s.appendChild(txt(f, {
      x: 0, y: 0, 'font-size': 12.5, fill: T.achse, 'text-anchor': 'start',
      transform: `translate(${x} ${k.o - 10}) rotate(-40)`
    }));
  });
  felder.forEach((_, i) => felder.forEach((__, j) => {
    const v = werte[i][j];
    const x = k.l + j * zelle, y = k.o + i * zelle;
    const r = el('rect', {
      x, y, width: zelle - 3, height: zelle - 3, rx: 3,
      fill: v === null ? '#F4F4F7' : fb(v)
    });
    hinweis(r, `${felder[i]} ↔ ${felder[j]}\nRangkorrelation ${z(v, 2)}`);
    k.s.appendChild(r);
    k.s.appendChild(txt(v === null ? '–' : z(v, 2), {
      x: x + (zelle - 3) / 2, y: y + (zelle - 3) / 2 + 5, 'text-anchor': 'middle',
      'font-size': 12.5, 'font-weight': 600,
      fill: v !== null && Math.abs(v) > 0.55 ? '#FFFFFF' : T.dunkel
    }));
  }));
  return einsetzen(ziel, k, o);
}

/* ------------------------------------------------------------------ Legende */
export function legende(ziel, eintraege) {
  ziel.replaceChildren(...eintraege.map(e => {
    const s = document.createElement('span');
    const i = document.createElement('i');
    i.style.cssText = `width:11px;height:11px;border-radius:2px;background:${e.farbe};display:inline-block`;
    s.appendChild(i);
    s.appendChild(document.createTextNode(' ' + e.name));
    return s;
  }));
}
