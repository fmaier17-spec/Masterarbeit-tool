import * as D from './diagramm.js';
const { z, g, pz, eur, FARBE } = D;

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const hole = async (u, o) => {
  const a = await fetch(u, o);
  const j = await a.json();
  if (j && j.fehler) throw new Error(j.fehler);
  return j;
};
const senden = (u, k) => hole(u, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(k || {})
});
const html = (s, ...v) => s.reduce((a, x, i) => a + x + (v[i] ?? ''), '');
const sicher = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const bp = b => `<i class="bpunkt b-${sicher(b)}"></i>`;
const KLASSE = { Kleinst: 'Kleinst', Klein: 'Klein', Mittelgross: 'Mittelgroß', Gross: 'Groß' };

const TITEL = {
  uebersicht: 'Übersicht', stichprobe: 'Stichprobe', erhebung: 'Datenabruf', unternehmen: 'Unternehmen',
  kennzahlen: 'Kennzahlen', groessen: 'Größenklassen', auffaellig: 'Auffälligkeiten',
  prognose: 'Prognose', herkunft: 'Herkunftsnachweis', einstellungen: 'Einstellungen'
};
/* Richtwertbänder, wie sie die Arbeit in den Säulenabbildungen hinterlegt */
const BAND = {
  eigenkapitalquote: { von: 20, bis: 30, text: 'Richtwertband 20–30 %' },
  liquiditaet_2: { von: 100, bis: 120, text: 'Orientierungswert ab 100 %' },
  anlagendeckung_2: { von: 100, bis: 110, text: 'Goldene Bilanzregel ab 100 %' }
};
const KZ_MED = {
  eigenkapitalquote: 'Mediane Eigenkapitalquote', verschuldungsgrad: 'Medianer Verschuldungsgrad',
  liquiditaet_2: 'Mediane Liquidität 2. Grades', liquiditaet_3: 'Mediane Liquidität 3. Grades',
  anlagendeckung_2: 'Mediane Anlagendeckung II', anlagenintensitaet: 'Mediane Anlagenintensität',
  vorratsquote: 'Mediane Vorratsquote', umsatzrentabilitaet: 'Mediane Umsatzrentabilität',
  gesamtkapitalrentabilitaet: 'Mediane Gesamtkapitalrentabilität', altman_z: 'Medianer Altman-Z-Wert'
};
const KZ_GEN = {
  eigenkapitalquote: 'der Eigenkapitalquote', verschuldungsgrad: 'des Verschuldungsgrads',
  liquiditaet_2: 'der Liquidität 2. Grades', liquiditaet_3: 'der Liquidität 3. Grades',
  anlagendeckung_2: 'der Anlagendeckung II', anlagenintensitaet: 'der Anlagenintensität',
  vorratsquote: 'der Vorratsquote', umsatzrentabilitaet: 'der Umsatzrentabilität',
  gesamtkapitalrentabilitaet: 'der Gesamtkapitalrentabilität', altman_z: "des Altman Z''"
};
const KZ_LISTE = [
  ['eigenkapitalquote', 'Eigenkapitalquote', '%'], ['verschuldungsgrad', 'Verschuldungsgrad', '%'],
  ['liquiditaet_2', 'Liquidität 2. Grades', '%'], ['liquiditaet_3', 'Liquidität 3. Grades', '%'],
  ['anlagendeckung_2', 'Anlagendeckung II', '%'], ['anlagenintensitaet', 'Anlagenintensität', '%'],
  ['vorratsquote', 'Vorratsquote', '%'], ['umsatzrentabilitaet', 'Umsatzrentabilität', '%'],
  ['gesamtkapitalrentabilitaet', 'Gesamtkapitalrentabilität', '%'], ['altman_z', "Altman Z''", '']
];

const S = { ueber: null, seite: 'uebersicht', u: { seite: 1, sort: 'name', richtung: 'auf' },
  log: 0, ptakt: 0, nachgeladen: false };

/* -------------------------------------------------------------- Wegführung */
function wechsel(n) {
  if (!TITEL[n]) n = 'uebersicht';
  S.seite = n;
  $$('.seite').forEach(e => e.classList.toggle('an', e.id === 's_' + n));
  $$('#nav a').forEach(a => a.classList.toggle('an', a.dataset.seite === n));
  $('#titel').textContent = TITEL[n];
  $('#kopf_merk').innerHTML = '';
  ({ uebersicht: zeigeUebersicht, stichprobe: zeigeStichprobe, unternehmen: zeigeUnternehmen, kennzahlen: zeigeKennzahlen,
    groessen: zeigeGroessen, auffaellig: zeigeAuffaellig, prognose: zeigePrognose,
    erhebung: zeigeErhebung, herkunft: zeigeHerkunft, einstellungen: zeigeEinstellungen }[n] || (() => { }))();
}
addEventListener('hashchange', () => wechsel(location.hash.slice(1)));

/* --------------------------------------------------------------- Übersicht */
async function laden() {
  S.ueber = await hole('/api/uebersicht');
  const u = S.ueber;
  $('#n_untern').textContent = g(u.unternehmen);
  $('#n_auff').textContent = g(u.auffaellig);
  const b = $('#f_branche'), b2 = $('#f_branche_e');
  [b, b2].forEach(s => {
    if (s.options.length > 1) return;
    u.branchen.forEach(x => s.add(new Option(x.name, x.name)));
  });
  const j = $('#f_kzjahr');
  if (j.options.length <= 1) u.jahre.forEach(x => j.add(new Option(x.gj, x.gj)));
  const k = $('#f_kz');
  if (!k.options.length) KZ_LISTE.forEach(([v, n]) => k.add(new Option(n, v)));
}

function zeigeUebersicht() {
  const u = S.ueber; if (!u) return;
  $('#k_untern').textContent = g(u.unternehmen);
  $('#k_untern_h').textContent = `${u.branchen.length} Branchen, Rechtsform GmbH`;
  $('#k_jahre').textContent = g(u.firmenjahre);
  $('#k_jahre_h').textContent = `Geschäftsjahre ${u.jahre[0]?.gj} bis ${u.jahre.at(-1)?.gj}`;
  $('#k_werte').textContent = g(u.einzelwerte);
  $('#k_werte_h').textContent = `${g(u.guv)} Firmenjahre mit offengelegter GuV`;
  $('#k_auff').innerHTML = `${g(u.auffaellig)} <small>/ ${g(u.firmenjahre)}</small>`;
  $('#k_auff_h').textContent = `${pz(u.auffaellig_quote * 100)} aller Firmenjahre`;
  $('#k_auff_b').style.width = (u.auffaellig_quote * 100) + '%';

  $('#t_kz').innerHTML = html`
    <thead><tr><th>Kennzahl</th><th class="z">Median</th><th class="z">Firmenjahre</th></tr></thead>
    <tbody>${u.kennzahl_uebersicht.map(k => `<tr><td class="haupt">${sicher(k.name)}</td>
      <td class="z num">${k.schluessel === 'altman_z' ? z(k.median, 2) : pz(k.median)}</td>
      <td class="z num leise">${g(k.n)}</td></tr>`).join('')}</tbody>`;

  D.balken($('#d_ring'), u.branchen.map(x => ({ name: x.name, wert: x.unternehmen, n: x.firmenjahre })), {
    titel: 'Stichprobenumfang je Branche',
    unter: 'Unternehmen je Branche, darunter die Zahl der Firmenjahre',
    datei: 'abbildung-stichprobenumfang-je-branche',
    breite: 560, hoehe: 360, links: 54, format: g, zweitzeile: true, yLabel: 'Unternehmen'
  });
  D.balken($('#d_jahre'), u.jahre.map(x => ({ name: String(x.gj), wert: x.anzahl, farbe: D.T.logit })), {
    titel: 'Offengelegte Firmenjahre nach Geschäftsjahr',
    unter: `Geschäftsjahre ${u.jahre[0]?.gj} bis ${u.jahre.at(-1)?.gj}`,
    datei: 'abbildung-firmenjahre-je-geschaeftsjahr',
    hoehe: 340, format: g, yLabel: 'Firmenjahre'
  });
  D.balken($('#d_groessen'), u.groessenklassen.map(x => ({
    name: KLASSE[x.klasse], wert: x.anzahl, farbe: D.GROESSE[x.klasse]
  })), {
    titel: 'Verteilung der Größenklassen nach § 221 UGB',
    unter: 'Näherung über die Bilanzsumme, Einstufung je Unternehmen',
    datei: 'abbildung-groessenklassen', hoehe: 340, format: g, yLabel: 'Unternehmen'
  });

  const t = u.uebergaenge;
  $('#d_uebergang').innerHTML = html`
    <div class="stapel" style="gap:var(--s3)">
      ${[['Erhobene Firmenjahre', t.firmenjahre, ''],
        ['Erstes Jahr je Gesellschaft, kein Vorjahr vorhanden', -t.erste_jahre, 'ab'],
        ['Erstes Jahr nach einer Offenlegungslücke', -t.nach_luecke, 'ab'],
        ['Auswertbare Übergänge', t.auswertbar, 'summe']].map(([n, v, art]) => `
        <div class="reihe" style="justify-content:space-between;${art === 'summe' ? 'border-top:1px solid var(--rand);padding-top:var(--s3);font-weight:600' : ''}">
          <span style="font-size:13px;${art === 'ab' ? 'color:var(--text-3)' : ''}">${n}</span>
          <span class="num" style="font-size:14px;${art === 'ab' ? 'color:var(--kritisch)' : ''}">${v > 0 ? '' : '−'}${g(Math.abs(v))}</span>
        </div>`).join('')}
      <p class="hilfe" style="margin-top:var(--s2)">${g(t.nur_ein_jahr)} Gesellschaften weisen nur ein
      einziges Firmenjahr aus und tragen deshalb nichts zum Prognosemodell bei.
      ${g(t.alle_fuenf)} decken fünf Geschäftsjahre ab.
      ${t.faelle.length ? `${t.faelle.length} Gesellschaften haben eine Lücke in der Offenlegung.` : ''}</p>
    </div>`;

  $('#t_laeufe').innerHTML = html`
    <thead><tr><th>Gestartet</th><th>Art</th><th>Stand</th><th class="z">Werte</th></tr></thead>
    <tbody>${u.laeufe.map(l => `<tr>
      <td class="num leise">${sicher((l.gestartet || '').replace('T', '  ').slice(0, 16))}</td>
      <td>${l.modus === 'live' ? 'Live-Abruf' : 'Wiedergabe'}</td>
      <td><span class="merk ${l.status === 'fertig' ? 'gut' : l.status === 'laeuft' ? 'akzent' : 'warn'}"><i></i>${
        { fertig: 'fertig', laeuft: 'läuft', angehalten: 'angehalten', fehler: 'Fehler' }[l.status] || l.status}</span></td>
      <td class="z num">${g(l.werte)}</td></tr>`).join('') ||
    '<tr><td colspan="4" class="leise" style="padding:var(--s5);text-align:center">Noch kein Lauf</td></tr>'}</tbody>`;
}

/* --------------------------------------------------------------- Stichprobe */
async function zeigeStichprobe() {
  const d = await hole('/api/stichprobe');
  const u = S.ueber;
  $('#d_stkpi').innerHTML = html`
    <div class="karte kpi"><div class="titel">Ausgewertet</div>
      <div class="wert">${g(d.gesamt)}</div>
      <div class="hinweis">Gesellschaften in fünf Branchen</div></div>
    <div class="karte kpi"><div class="titel">Mindestziel je Branche</div>
      <div class="wert">${d.mindestziel}</div>
      <div class="hinweis">${d.ziel_erreicht ? 'in jeder Branche übertroffen' : 'nicht überall erreicht'}</div></div>
    <div class="karte kpi"><div class="titel">Regel greift bei</div>
      <div class="wert">${pz(d.abdeckung_gesamt)}</div>
      <div class="hinweis">der Firmenwortlaute unmittelbar</div></div>
    <div class="karte kpi" style="border-color:rgba(242,84,91,.3)">
      <div class="titel">Amtliche Branchenkennung</div>
      <div class="wert" style="color:var(--kritisch)">${d.oenace}</div>
      <div class="hinweis">von ${g(d.gesamt)} — deshalb die Wortregel</div></div>`;

  $('#d_stschritte').innerHTML = html`
    <div class="liste">
      <div class="z"><span class="n" style="color:var(--akzent)">01</span><span class="t">
        <b>Grundgesamtheit.</b> Alle österreichischen GmbH, die für 2019 bis 2025 einen
        Jahresabschluss nach §§ 277 ff. UGB offengelegt haben und über openfirmenbuch abrufbar
        sind. Einzelunternehmen und Personengesellschaften bleiben außen vor, weil sie nicht
        im selben Umfang offenlegungspflichtig sind.</span></div>
      <div class="z"><span class="n" style="color:var(--akzent)">02</span><span class="t">
        <b>Schichtung nach Branche.</b> Fünf Branchen, ausgewählt nach ÖNACE 2008, decken
        bewusst unterschiedliche Geschäftsmodelle ab: kapitalintensiv und anlagenlastig
        (Bau, Transport), vorratshaltend (Handel), krisen- und saisonempfindlich
        (Gastronomie) und anlagenarm wissensintensiv (Unternehmensberatung, Bereich M70).
        Die Auswahl folgt damit einem inhaltlichen Kontrast, nicht der Verfügbarkeit.</span></div>
      <div class="z"><span class="n" style="color:var(--akzent)">03</span><span class="t">
        <b>Auswahl innerhalb der Branche.</b> Vorrang haben Gesellschaften mit möglichst
        vielen Firmenjahren mit auswertbaren Bilanzpositionen, damit Zeitvergleiche tragen.
        Angestrebt waren mindestens 80 je Branche, erreicht wurden
        ${d.branchen.map(b => b.unternehmen).sort((x, y) => x - y)[0]} bis
        ${d.branchen.map(b => b.unternehmen).sort((x, y) => y - x)[0]}.</span></div>
    </div>
    <div class="meldung warn" style="margin-top:var(--s4)">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.3 4.3 2.6 17.5A2 2 0 0 0 4.3 20.5h15.4a2 2 0 0 0 1.7-3L13.7 4.3a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4M12 17h.01"/></svg>
      <div><b>Warum nicht mehr Gesellschaften?</b> Je Branche liegen zwischen 480 und 548
        Firmenjahre vor. Nichtparametrische Verfahren decken damit Unterschiede mittlerer
        Effektstärke verlässlich auf — die gefundenen Effektstärken reichen bis 0,340. Bei
        mehreren tausend Beobachtungen würden dagegen auch bedeutungslose Unterschiede
        signifikant, und jede zusätzliche Gesellschaft belastet eine öffentliche
        Schnittstelle, die auf Einzelabfragen ausgelegt ist.</div>
    </div>`;

  $('#t_stbranche').innerHTML = html`
    <thead><tr><th>Branche</th><th class="z">Untern.</th><th class="z">Firmenjahre</th>
      <th class="z">Jahre je Untern.</th><th class="z">Regel greift</th>
      <th>Wortbestandteile mit Treffern</th></tr></thead>
    <tbody>${d.branchen.map(b => `<tr>
      <td><span class="reihe" style="gap:6px">${bp(b.branche)}<span class="haupt">${sicher(b.branche)}</span></span></td>
      <td class="z num">${g(b.unternehmen)}</td>
      <td class="z num">${g(b.firmenjahre)}</td>
      <td class="z num leise">${z(b.jahre_je_unternehmen, 2)}</td>
      <td class="z num" style="${b.abdeckung < 90 ? 'color:var(--warn)' : 'color:var(--gut)'}">${pz(b.abdeckung)}</td>
      <td style="font-size:12.5px;line-height:1.7">${b.begriffe.map(x =>
        `<span class="merk" style="margin:0 4px 4px 0">${sicher(x.wort)} · ${x.treffer}</span>`).join('')}</td>
      </tr>`).join('')}</tbody>`;

  $('#d_stohne').innerHTML = html`
    <div class="lead" style="margin-bottom:var(--s4)">Bei ${pz(100 - d.abdeckung_gesamt)} der
      Gesellschaften trägt der Firmenwortlaut kein Stichwort der Regel. Diese Fälle wurden
      einzeln durchgesehen. <b>Das ist die dokumentierte Grenze der Zuordnung</b> und wird in
      Abschnitt 7.2 der Arbeit als solche benannt.</div>
    <div class="raster r5">${d.branchen.map(b => `<div class="karte" style="padding:var(--s4)">
      <div class="k" style="font-size:12px;letter-spacing:.1em;text-transform:uppercase;
        color:var(--text-3);font-weight:600;margin-bottom:10px">${sicher(b.branche.slice(0, 14))}</div>
      <div style="font-size:26px;font-weight:600">${b.ohne_treffer}</div>
      <div class="hilfe" style="margin-top:8px">${b.beispiele_ohne.slice(0, 3).map(x =>
        sicher((x || '').slice(0, 30))).join('<br>') || '—'}</div></div>`).join('')}</div>`;
}

/* -------------------------------------------------------------- Unternehmen */
async function zeigeUnternehmen() {
  const p = new URLSearchParams({
    such: $('#f_such').value, branche: $('#f_branche').value, klasse: $('#f_klasse').value,
    seite: S.u.seite, sort: S.u.sort, richtung: S.u.richtung
  });
  const d = await hole('/api/unternehmen?' + p);
  $('#u_zahl').textContent = `${g(d.gesamt)} Treffer`;
  const sp = [['name', 'Firmenwortlaut', ''], ['branche', 'Branche', ''], ['sitz', 'Sitz', ''],
  ['klasse', 'Größe', ''], ['jahre', 'Jahre', 'z'], ['bilanzsumme', 'Bilanzsumme', 'z'],
  ['ekq', 'EK-Quote', 'z'], ['liq', 'Liquidität II', 'z'], ['auffaellig', 'auffällig', 'z']];
  $('#t_untern').innerHTML = html`
    <thead><tr>${sp.map(([k, n, c]) => `<th class="${c} sortbar" data-s="${k}">${n}${
    S.u.sort === k ? `<span class="pfeil">${S.u.richtung === 'auf' ? '↑' : '↓'}</span>` : ''}</th>`).join('')}</tr></thead>
    <tbody>${d.zeilen.map(r => `<tr class="klick" data-fnr="${r.fnr}">
      <td><div class="haupt">${sicher(r.name)}</div><div class="leise num">${sicher(r.fnr)}</div></td>
      <td><span class="reihe" style="gap:6px">${bp(r.branche)}${sicher(r.branche)}</span></td>
      <td class="leise">${sicher(r.sitz || '–')}</td>
      <td>${r.klasse ? `<span class="merk"><i style="background:${D.GROESSE[r.klasse]}"></i>${KLASSE[r.klasse]}</span>` : '–'}</td>
      <td class="z num">${r.jahre}</td>
      <td class="z num">${eur(r.bilanzsumme)}</td>
      <td class="z num" style="${r.ekq !== null && r.ekq < 20 ? 'color:var(--kritisch)' : ''}">${pz(r.ekq)}</td>
      <td class="z num" style="${r.liq !== null && r.liq < 100 ? 'color:var(--kritisch)' : ''}">${pz(r.liq, 0)}</td>
      <td class="z">${r.auffaellig ? `<span class="merk kritisch"><i></i>${r.auffaellig}</span>` : '<span class="leise">–</span>'}</td>
      </tr>`).join('') || '<tr><td colspan="9" class="leise" style="padding:var(--s7);text-align:center">Keine Treffer</td></tr>'}</tbody>`;

  $$('#t_untern th.sortbar').forEach(t => t.onclick = () => {
    const k = t.dataset.s;
    S.u.richtung = S.u.sort === k && S.u.richtung === 'auf' ? 'ab' : 'auf';
    S.u.sort = k; S.u.seite = 1; zeigeUnternehmen();
  });
  $$('#t_untern tr.klick').forEach(t => t.onclick = () => detail(t.dataset.fnr));
  $('#u_blaettern').innerHTML = html`
    <span>Seite ${d.seite} von ${d.seiten} · ${g(d.gesamt)} Gesellschaften</span>
    <div class="rechts">
      <button class="knopf klein" id="bl_z" ${d.seite <= 1 ? 'disabled' : ''}>Zurück</button>
      <button class="knopf klein" id="bl_v" ${d.seite >= d.seiten ? 'disabled' : ''}>Weiter</button>
    </div>`;
  $('#bl_z').onclick = () => { S.u.seite--; zeigeUnternehmen(); };
  $('#bl_v').onclick = () => { S.u.seite++; zeigeUnternehmen(); };
}

let suchTakt;
$('#f_such').oninput = () => { clearTimeout(suchTakt); suchTakt = setTimeout(() => { S.u.seite = 1; zeigeUnternehmen(); }, 220); };
$('#f_branche').onchange = $('#f_klasse').onchange = () => { S.u.seite = 1; zeigeUnternehmen(); };

/* ----------------------------------------------------------------- Detail */
async function detail(fnr) {
  $('#schleier').classList.add('an');
  $('#schublade').classList.add('an');
  $('#sch_leib').innerHTML = '<div class="lade"><div class="kreisel"></div>wird geladen</div>';
  const d = await hole('/api/unternehmen/' + fnr);
  const s = d.stamm;
  $('#sch_titel').textContent = s.name;
  $('#sch_unter').innerHTML = `${sicher(s.fnr)} · ${sicher(s.rechtsform || 'GmbH')} · ${sicher(s.sitz || '–')} · ${sicher(s.branche || '')}`;
  const pos = [['bilanzsumme', 'Bilanzsumme'], ['eigenkapital', 'Eigenkapital'],
  ['anlagevermoegen', 'Anlagevermögen'], ['umlaufvermoegen', 'Umlaufvermögen'],
  ['vorraete', 'Vorräte'], ['forderungen', 'Forderungen'], ['liquide_mittel', 'Liquide Mittel'],
  ['rueckstellungen', 'Rückstellungen'], ['kfr_verbindlichkeiten', 'Verbindlichkeiten kurzfristig'],
  ['lfr_verbindlichkeiten', 'Verbindlichkeiten langfristig'], ['umsatzerloese', 'Umsatzerlöse'],
  ['jahresueberschuss', 'Jahresüberschuss']];
  const kzs = [['eigenkapitalquote', 'Eigenkapitalquote'], ['verschuldungsgrad', 'Verschuldungsgrad'],
  ['liquiditaet_2', 'Liquidität 2. Grades'], ['liquiditaet_3', 'Liquidität 3. Grades'],
  ['anlagendeckung_2', 'Anlagendeckung II'], ['anlagenintensitaet', 'Anlagenintensität'],
  ['umsatzrentabilitaet', 'Umsatzrentabilität'], ['altman_z', "Altman Z''"]];
  const J = d.jahre;
  $('#sch_leib').innerHTML = html`
    <div class="raster r4" style="margin-bottom:var(--s5)">
      <div><div class="titel" style="font-size:11px;color:var(--text-3);text-transform:uppercase;letter-spacing:.05em">Größenklasse</div>
        <div style="font-weight:560;margin-top:4px">${d.klasse ? KLASSE[d.klasse] : '–'}</div></div>
      <div><div class="titel" style="font-size:11px;color:var(--text-3);text-transform:uppercase;letter-spacing:.05em">Firmenjahre</div>
        <div style="font-weight:560;margin-top:4px">${J.length} (${J[0]?.gj}–${J.at(-1)?.gj})</div></div>
      <div><div class="titel" style="font-size:11px;color:var(--text-3);text-transform:uppercase;letter-spacing:.05em">GuV offengelegt</div>
        <div style="font-weight:560;margin-top:4px">${J.filter(x => x.guv).length} von ${J.length}</div></div>
      <div><div class="titel" style="font-size:11px;color:var(--text-3);text-transform:uppercase;letter-spacing:.05em">Auffällig</div>
        <div style="font-weight:560;margin-top:4px">${J.filter(x => x.auff.auffaellig).length} Jahre</div></div>
    </div>

    <div class="reiter" id="sch_reiter">
      <button class="an" data-r="kz">Kennzahlen</button>
      <button data-r="bilanz">Bilanz</button>
      <button data-r="verlauf">Verlauf</button>
      <button data-r="herkunft">Herkunft (${g(d.herkunft.length)})</button>
    </div>

    <div id="r_kz">
      <table class="tab"><thead><tr><th>Kennzahl</th>
        ${J.map(j => `<th class="z">${j.gj}</th>`).join('')}</tr></thead>
        <tbody>${kzs.map(([k, n]) => `<tr><td>${n}</td>${J.map(j => {
    const v = j.kz[k];
    const rot = (k === 'eigenkapitalquote' && v !== null && v < 20) ||
      (k === 'liquiditaet_2' && v !== null && v < 100) ||
      (k === 'umsatzrentabilitaet' && v !== null && v < 0);
    return `<td class="z num" style="${rot ? 'color:var(--kritisch);font-weight:600' : ''}">${
      k === 'altman_z' ? z(v, 2) : pz(v)}</td>`;
  }).join('')}</tr>`).join('')}
        <tr style="border-top:2px solid var(--rand)"><td class="haupt">Einstufung</td>
        ${J.map(j => `<td class="z">${j.auff.auffaellig
      ? `<span class="merk kritisch"><i></i>${j.auff.anzahl}</span>`
      : `<span class="merk gut"><i></i>${j.auff.anzahl}</span>`}</td>`).join('')}</tr>
        </tbody></table>
      <p class="hilfe">Rot markiert sind Werte unterhalb der Schwelle der jeweiligen Dimension.
        Die Einstufung zählt die kritischen Dimensionen, ab zwei gilt das Firmenjahr als auffällig.</p>
    </div>

    <div id="r_bilanz" style="display:none">
      <table class="tab"><thead><tr><th>Position</th>
        ${J.map(j => `<th class="z">${j.gj}</th>`).join('')}</tr></thead>
        <tbody>${pos.map(([k, n]) => `<tr><td>${n}</td>${J.map(j =>
    `<td class="z num">${j.bilanz[k] === null || j.bilanz[k] === undefined ? '<span class="leise">–</span>' : g(j.bilanz[k])}</td>`).join('')}</tr>`).join('')}
        </tbody></table>
      <p class="hilfe">Beträge in Euro. Leere Felder bedeuten, dass die Position im offengelegten
        Abschluss nicht enthalten war.</p>
    </div>

    <div id="r_verlauf" style="display:none">
      <div id="d_dverlauf"></div>
      <div style="margin-top:var(--s5)"><h3 style="font-size:12.5px;font-weight:600;margin-bottom:var(--s3);color:var(--text-2)">Bilanzsumme</h3>
      <div id="d_dbs"></div></div>
    </div>

    <div id="r_herkunft" style="display:none">
      <div class="rollen" style="max-height:520px"><table class="tab">
        <thead><tr><th>Jahr</th><th>Feld</th><th>Rohbezeichnung</th><th class="z">Rohwert</th><th>Abruf</th></tr></thead>
        <tbody>${d.herkunft.map(h => `<tr><td class="num">${h.gj}</td><td>${sicher(h.feld)}</td>
          <td class="leise" style="font-family:var(--zahl);font-size:11.5px">${sicher(h.rohbezeichnung)}</td>
          <td class="z num">${sicher(h.rohwert)}</td>
          <td class="leise num" style="font-size:11px">${sicher((h.abrufzeitpunkt || '').replace('T', ' ').slice(0, 16))}</td></tr>`).join('')}</tbody>
      </table></div>
    </div>

    <div class="trenn"></div>
    <a href="${sicher(s.quelle_url || '#')}" target="_blank" rel="noopener" class="knopf klein">
      Eintrag in der Quelle öffnen</a>`;

  $$('#sch_reiter button').forEach(b => b.onclick = () => {
    $$('#sch_reiter button').forEach(x => x.classList.toggle('an', x === b));
    ['kz', 'bilanz', 'verlauf', 'herkunft'].forEach(r =>
      $('#r_' + r).style.display = r === b.dataset.r ? '' : 'none');
    if (b.dataset.r === 'verlauf') zeichneDetail(J, s.name);
  });
}
function zeichneDetail(J, name) {
  const x = J.map(j => String(j.gj));
  D.linie($('#d_dverlauf'), x, [
    { name: 'Eigenkapitalquote', werte: J.map(j => j.kz.eigenkapitalquote), farbe: '#4F9CF9' },
    { name: 'Liquidität 2. Grades', werte: J.map(j => j.kz.liquiditaet_2), farbe: '#3ECF8E' },
    { name: 'Anlagendeckung II', werte: J.map(j => j.kz.anlagendeckung_2), farbe: '#F5B544' },
  ], {
    titel: 'Kennzahlen im Zeitverlauf', unter: name,
    datei: 'abbildung-verlauf-' + (name || 'gesellschaft'),
    hoehe: 340, breite: 700, einheit: ' %', yLabel: 'Prozent'
  });
  D.balken($('#d_dbs'), J.map(j => ({ name: String(j.gj), wert: j.bilanz.bilanzsumme || 0, farbe: D.T.logit })), {
    titel: 'Bilanzsumme', unter: name, datei: 'abbildung-bilanzsumme-' + (name || 'gesellschaft'),
    hoehe: 320, breite: 700, format: eur, achsformat: eur, yLabel: 'Euro'
  });
}
$('#sch_zu').onclick = $('#schleier').onclick = () => {
  $('#schublade').classList.remove('an'); $('#schleier').classList.remove('an');
};
addEventListener('keydown', e => { if (e.key === 'Escape') $('#sch_zu').click(); });

/* ----------------------------------------------------------------- Kennzahlen */
async function zeigeKennzahlen() {
  const kz = $('#f_kz').value || 'eigenkapitalquote';
  const jahr = $('#f_kzjahr').value;
  const [d, K] = await Promise.all([
    hole(`/api/kennzahl?kz=${kz}${jahr ? '&jahr=' + jahr : ''}`),
    hole('/api/korrelation')
  ]);
  const eh = KZ_LISTE.find(x => x[0] === kz)?.[2] || '';
  const fmt = kz === 'altman_z' ? (v => z(v, 2)) : (v => z(v, 1));
  const n = d.zeilen.reduce((a, x) => a + x.n, 0);
  $('#kz_n').textContent = `${g(n)} Firmenjahre`;

  const jahrZusatz = jahr ? `Geschäftsjahr ${jahr}` : 'alle Geschäftsjahre';
  /* Abbildung im Stil von Abbildung 5: Median je Branche mit Vertrauensbereich */
  D.balken($('#d_median'), d.zeilen.map(r => ({
    name: r.branche, wert: r.median, n: r.n, ki: r.ki
  })), {
    titel: `${KZ_MED[kz] || 'Median ' + d.name} je Branche`,
    unter: `Fehlerbalken: 95-%-Vertrauensbereich des Medians · ${jahrZusatz}`,
    datei: `abbildung-median-${kz}`, hoehe: 380, format: fmt, einheit: eh,
    yLabel: d.name, band: BAND[kz], zweitzeile: true
  });
  const deckel = { verschuldungsgrad: 520, liquiditaet_2: 600, liquiditaet_3: 600,
    anlagendeckung_2: 900 }[kz] ?? null;
  D.kasten($('#d_kasten'), d.zeilen, {
    titel: `Verteilung ${KZ_GEN[kz] || 'der Kennzahl'} je Branche`,
    unter: 'Kasten: 1. bis 3. Quartil mit Median · Antennen: 10. bis 90. Perzentil'
      + (deckel ? ` · Achse bei ${z(deckel, 0)}${eh} gekappt (▲)` : ''),
    datei: `abbildung-verteilung-${kz}`, hoehe: 400, format: fmt, einheit: eh,
    yLabel: `${d.name}${eh ? ' in ' + eh : ''}`, kappen: deckel
  });
  const marke = { eigenkapitalquote: 20, liquiditaet_2: 100, umsatzrentabilitaet: 0 }[kz];
  D.histogramm($('#d_hist'), d.verteilung, {
    titel: `Häufigkeitsverteilung: ${d.name}`,
    unter: '1. bis 99. Perzentil' + (marke !== undefined
      ? ` · gestrichelt die Schwelle von ${z(marke, 0)}${eh}, ab der die Dimension als kritisch gilt` : ''),
    datei: `abbildung-haeufigkeit-${kz}`, hoehe: 400, marke,
    markeText: marke !== undefined ? 'Schwelle' : '', yLabel: 'Firmenjahre'
  });
  $('#t_kzbranche').innerHTML = html`
    <thead><tr><th>Branche</th><th class="z">n</th><th class="z">Median</th>
      <th class="z">95-%-Bereich</th><th class="z">Quartile</th></tr></thead>
    <tbody>${d.zeilen.map(r => `<tr>
      <td><span class="reihe" style="gap:6px">${bp(r.branche)}<span class="haupt">${sicher(r.branche)}</span></span></td>
      <td class="z num leise">${g(r.n)}</td>
      <td class="z num" style="font-weight:600">${fmt(r.median)}${eh}</td>
      <td class="z num leise">${r.ki ? `${fmt(r.ki.unten)} – ${fmt(r.ki.oben)}` : '–'}</td>
      <td class="z num leise">${fmt(r.q1)} – ${fmt(r.q3)}</td></tr>`).join('')}</tbody>`;

  const k = d.kruskal;
  $('#d_kruskal').innerHTML = k ? html`
    <dl class="paare">
      <dt>Prüfgröße H</dt><dd>${z(k.H, 2)}</dd>
      <dt>Freiheitsgrade</dt><dd>${k.df}</dd>
      <dt>p-Wert</dt><dd>${k.p < 0.001 ? '&lt; 0,001' : z(k.p, 4)}</dd>
      <dt>Fälle</dt><dd>${g(k.n)}</dd>
    </dl>
    <div class="meldung ${k.p < 0.05 ? 'gut' : 'warn'}" style="margin-top:var(--s4)">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 16v-5M12 8h.01"/></svg>
      <div>${k.p < 0.05
      ? 'Die Verteilungen unterscheiden sich zwischen den Branchen bedeutsam. Welche Branchen sich unterscheiden, zeigen die paarweisen Vergleiche.'
      : 'Ein bedeutsamer Unterschied zwischen den Branchen lässt sich nicht feststellen.'}</div>
    </div>
    <p class="hilfe">Der Kruskal-Wallis-Test vergleicht mehrere unabhängige Gruppen anhand ihrer
      Rangplätze. Er setzt keine Normalverteilung voraus und eignet sich deshalb für
      Bilanzkennzahlen, deren Verteilung meist deutlich schief ist. Das Signifikanzniveau
      liegt durchgehend bei 5 Prozent.</p>` : '<div class="leer">Zu wenige Fälle</div>';

  D.linie($('#d_verlauf'), d.verlauf.map(v => String(v.gj)),
    D.BRANCHEN.map(b => ({ name: b, werte: d.verlauf.map(v => v[b]) })), {
    titel: `Zeitliche Entwicklung: ${d.name}`,
    unter: 'Median je Branche und Geschäftsjahr',
    datei: `abbildung-verlauf-${kz}`, hoehe: 380, format: fmt, einheit: eh,
    yLabel: `${d.name}${eh ? ' in ' + eh : ''}`
  });
  D.matrix($('#d_korr'), K.felder, K.werte, {
    titel: 'Rangkorrelation der bilanzbasierten Kennzahlen',
    unter: 'Spearman über alle Firmenjahre · blau gleichläufig, rot gegenläufig',
    datei: 'abbildung-rangkorrelation'
  });

  $('#t_paare').innerHTML = html`
    <thead><tr><th>Vergleich</th><th class="z">z</th><th class="z">r</th>
      <th class="z">p korrigiert</th><th></th></tr></thead>
    <tbody>${(d.paare || []).sort((a, b) => a.p_korr - b.p_korr).map(p => `<tr>
      <td style="font-size:12.5px">${sicher(p.a)} ↔ ${sicher(p.b)}</td>
      <td class="z num">${z(p.z, 2)}</td>
      <td class="z num">${z(p.r, 3)}</td>
      <td class="z num">${p.p_korr < 0.001 ? '&lt; 0,001' : z(p.p_korr, 3)}</td>
      <td class="z">${p.signifikant ? '<span class="merk gut"><i></i>bedeutsam</span>' : '<span class="leise">–</span>'}</td>
      </tr>`).join('')}</tbody>`;
}
$('#f_kz').onchange = $('#f_kzjahr').onchange = zeigeKennzahlen;

/* -------------------------------------------------------------- Größenklassen */
async function zeigeGroessen() {
  const d = await hole('/api/groessen');
  const summe = d.gesamt.reduce((a, x) => a + x.anzahl, 0) || 1;
  $('#d_gkpi').innerHTML = d.gesamt.map(x => html`
    <div class="karte kpi">
      <div class="titel"><i style="width:7px;height:7px;border-radius:2px;background:${D.GROESSE[x.klasse]}"></i>${KLASSE[x.klasse]}</div>
      <div class="wert">${g(x.anzahl)}</div>
      <div class="hinweis">${pz(x.anzahl / summe * 100)} der Gesellschaften</div>
      <div class="balken"><i style="width:${x.anzahl / summe * 100}%;background:${D.GROESSE[x.klasse]}"></i></div>
    </div>`).join('');

  const sl = ['Kleinst', 'Klein', 'Mittelgross', 'Gross'].map(k => ({ k, n: KLASSE[k], farbe: D.GROESSE[k] }));
  D.stapel($('#d_gbranche'), d.je_branche.map(b => ({ ...b, name: b.branche })), sl, {
    titel: 'Größenklassen je Branche',
    unter: 'Näherung über die Bilanzsumme · Anteile an den Unternehmen der jeweiligen Branche',
    datei: 'abbildung-groessenklassen-je-branche',
    prozent: true, xLabel: 'Anteil der Unternehmen', links: 148
  });
  D.stapelV($('#d_gjahr'), d.je_jahr.map(j => ({ ...j, name: String(j.gj) })), sl, {
    titel: 'Größenklassen im Zeitverlauf',
    unter: 'Einstufung je Firmenjahr, nicht je Unternehmen',
    datei: 'abbildung-groessenklassen-je-jahr', hoehe: 380, yLabel: 'Firmenjahre'
  });

  $('#t_gkz').innerHTML = html`
    <thead><tr><th>Klasse</th><th class="z">Firmenjahre</th><th class="z">Bilanzsumme</th>
      <th class="z">EK-Quote</th><th class="z">Liquidität II</th><th class="z">auffällig</th></tr></thead>
    <tbody>${Object.entries(d.kennzahlen).map(([k, v]) => `<tr>
      <td><span class="merk"><i style="background:${D.GROESSE[k]}"></i>${KLASSE[k]}</span></td>
      <td class="z num leise">${g(v.n)}</td><td class="z num">${eur(v.bilanzsumme)}</td>
      <td class="z num">${pz(v.eigenkapitalquote)}</td><td class="z num">${pz(v.liquiditaet_2, 0)}</td>
      <td class="z num">${pz(v.auffaellig * 100)}</td></tr>`).join('')}</tbody>`;

  $('#t_grenzen').innerHTML = html`
    <thead><tr><th>Klasse</th><th class="z">bis 2023</th><th class="z">ab 2024</th></tr></thead>
    <tbody>
      <tr><td>Kleinst</td><td class="z num">≤ ${g(d.grenzen.alt.kleinst)}</td><td class="z num">≤ ${g(d.grenzen.neu.kleinst)}</td></tr>
      <tr><td>Klein</td><td class="z num">≤ ${g(d.grenzen.alt.klein)}</td><td class="z num">≤ ${g(d.grenzen.neu.klein)}</td></tr>
      <tr><td>Mittelgroß</td><td class="z num">≤ ${g(d.grenzen.alt.mittel)}</td><td class="z num">≤ ${g(d.grenzen.neu.mittel)}</td></tr>
      <tr><td>Groß</td><td class="z num">darüber</td><td class="z num">darüber</td></tr>
    </tbody>`;
}

/* ------------------------------------------------------------- Auffälligkeiten */
async function zeigeAuffaellig() {
  const d = await hole('/api/auffaellig');
  const N = d.verteilung.reduce((a, x) => a + x.faelle, 0) || 1;
  $('#d_regel').innerHTML = html`
    <div class="stapel" style="gap:var(--s3)">
      ${[['Kapitalstruktur', `Eigenkapitalquote unter ${z(d.schwellen.eigenkapitalquote, 0)} %`, d.je_dimension.kapitalstruktur],
      ['Liquidität', `Liquidität 2. Grades unter ${z(d.schwellen.liquiditaet_2, 0)} %`, d.je_dimension.liquiditaet],
      ['Rentabilität', 'Umsatzrentabilität negativ', d.je_dimension.rentabilitaet]].map(([n, b, v]) => `
        <div>
          <div class="reihe" style="justify-content:space-between">
            <b style="font-size:13px">${n}</b><span class="num" style="font-size:12.5px">${g(v)}</span>
          </div>
          <div class="hilfe" style="margin:2px 0 6px">${b}</div>
          <div class="spur" style="height:5px;background:var(--flaeche);border-radius:3px;overflow:hidden">
            <i style="display:block;height:100%;width:${v / N * 100}%;background:var(--kritisch);border-radius:3px"></i></div>
        </div>`).join('')}
      <div class="meldung info" style="margin-top:var(--s2)">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 16v-5M12 8h.01"/></svg>
        <div>Als auffällig gilt ein Firmenjahr, sobald <b>mindestens zwei</b> Dimensionen zugleich
          kritisch sind. Eine einzelne Schwächephase führt damit noch nicht zur Einstufung.</div>
      </div>
    </div>`;

  D.balken($('#d_dim'), d.verteilung.map(x => ({
    name: String(x.anzahl), wert: x.faelle,
    farbe: x.anzahl >= 2 ? '#F2545B' : x.anzahl === 1 ? '#F5B544' : '#3ECF8E'
  })), {
    titel: 'Kritische Dimensionen je Firmenjahr',
    unter: 'Ab zwei zugleich kritischen Dimensionen gilt ein Firmenjahr als auffällig',
    datei: 'abbildung-kritische-dimensionen', breite: 560, hoehe: 340,
    format: g, yLabel: 'Firmenjahre'
  });
  D.linie($('#d_ajahr'), d.je_jahr.map(x => String(x.gj)),
    [{ name: 'Anteil', werte: d.je_jahr.map(x => x.quote * 100), farbe: '#F2545B' }], {
    titel: 'Auffällige Firmenjahre im Zeitverlauf',
    unter: 'Anteil an allen Firmenjahren des Geschäftsjahres',
    datei: 'abbildung-auffaellig-im-zeitverlauf', breite: 560, hoehe: 340,
    nullBasis: true, einheit: ' %', yLabel: 'Anteil in %'
  });
  D.balken($('#d_abranche'), d.je_branche.map(b => ({
    name: b.branche, wert: b.quote * 100, n: b.n
  })), {
    titel: 'Anteil regelbasiert auffälliger Firmenjahre je Branche',
    unter: 'Mindestens zwei kritische Dimensionen im selben Geschäftsjahr',
    datei: 'abbildung-auffaellig-je-branche', hoehe: 380, einheit: ' %',
    format: v => z(v, 1), yLabel: 'Anteil in %', zweitzeile: true
  });

  $('#t_abranche').innerHTML = html`
    <thead><tr><th>Branche</th><th class="z">Firmenjahre</th><th class="z">Kapitalstruktur</th>
      <th class="z">Liquidität</th><th class="z">Rentabilität</th><th class="z">auffällig</th></tr></thead>
    <tbody>${d.je_branche.map(b => `<tr>
      <td><span class="reihe" style="gap:6px">${bp(b.branche)}${sicher(b.branche)}</span></td>
      <td class="z num leise">${g(b.n)}</td>
      <td class="z num">${pz(b.kapitalstruktur * 100)}</td>
      <td class="z num">${pz(b.liquiditaet * 100)}</td>
      <td class="z num">${pz(b.rentabilitaet * 100)}</td>
      <td class="z num" style="font-weight:600">${pz(b.quote * 100)}</td></tr>`).join('')}</tbody>`;

  $('#t_auff').innerHTML = html`
    <thead><tr><th>Gesellschaft</th><th>Branche</th><th class="z">Jahr</th><th class="z">Bilanzsumme</th>
      <th class="z">EK-Quote</th><th class="z">Liquidität II</th><th class="z">Dim.</th></tr></thead>
    <tbody>${d.liste.map(r => `<tr class="klick" data-fnr="${r.fnr}">
      <td><div class="haupt">${sicher(r.name)}</div><div class="leise num">${sicher(r.fnr)}</div></td>
      <td><span class="reihe" style="gap:6px">${bp(r.branche)}${sicher(r.branche)}</span></td>
      <td class="z num">${r.gj}</td><td class="z num">${eur(r.bs)}</td>
      <td class="z num" style="color:var(--kritisch)">${pz(r.ekq)}</td>
      <td class="z num" style="${r.liq < 100 ? 'color:var(--kritisch)' : ''}">${pz(r.liq, 0)}</td>
      <td class="z"><span class="merk kritisch"><i></i>${r.dim}</span></td></tr>`).join('')}</tbody>`;
  $$('#t_auff tr.klick').forEach(t => t.onclick = () => detail(t.dataset.fnr));
}

/* ----------------------------------------------------------------- Prognose */
async function zeigePrognose() {
  const d = await hole('/api/prognose');
  malePrognose(d);
  if (d.zustand?.status === 'laeuft') taktPrognose();
}
$('#b_prognose').onclick = async () => {
  $('#b_prognose').disabled = true;
  await senden('/api/prognose/start');
  taktPrognose();
};
function taktPrognose() {
  const meins = ++S.ptakt;
  const tick = async () => {
    if (meins !== S.ptakt) return;
    let d;
    try {
      d = await hole('/api/prognose');
    } catch {
      if (meins === S.ptakt) setTimeout(tick, 900);
      return;
    }
    if (meins !== S.ptakt) return;
    malePrognose(d);
    if (d.zustand?.status === 'laeuft') setTimeout(tick, 450);
    else $('#b_prognose').disabled = false;
  };
  tick();
}
function malePrognose(d) {
  const zt = d.zustand;
  const m = $('#p_merk');
  if (!zt) { m.className = 'merk'; m.innerHTML = '<i></i>nicht berechnet'; }
  else if (zt.status === 'laeuft') { m.className = 'merk akzent'; m.innerHTML = '<i></i>läuft'; }
  else if (zt.status === 'fertig') { m.className = 'merk gut'; m.innerHTML = '<i></i>fertig'; }
  else { m.className = 'merk kritisch'; m.innerHTML = '<i></i>Fehler'; }

  if (zt && zt.status === 'laeuft') {
    const st = ['Merkmale bilden', 'Zeitliche Aufteilung', 'Naive Fortschreibung',
      'Logistische Regression', 'Zufallswald'];
    $('#d_pstatus').innerHTML = html`
      <div class="balken" style="height:4px;border-radius:2px;background:var(--rand);margin-bottom:var(--s5);overflow:hidden">
        <i style="display:block;height:100%;width:${(zt.anteil || 0) * 100}%;background:var(--akzent);border-radius:2px;transition:width .3s"></i></div>
      <div class="schritte">${st.map((s, i) => `
        <div class="schritt ${i < zt.schritt ? 'fertig' : i === zt.schritt ? 'an' : 'aus'}">
          <div class="kreis">${i < zt.schritt ? '✓' : i + 1}</div>
          <div class="txt"><b>${s}</b></div></div>`).join('')}</div>
      <p class="hilfe" style="margin-top:var(--s4)">${sicher(zt.text || '')}</p>`;
    return;
  }
  if (zt && zt.status === 'fehler') {
    $('#d_pstatus').innerHTML = `<div class="meldung gefahr"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16h.01"/></svg><div>${sicher(zt.text)}</div></div>`;
    return;
  }
  if (!d.ergebnis) return;
  const e = d.ergebnis;
  $('#d_pstatus').innerHTML = html`
    <div class="raster r4">
      <div><div class="titel" style="font-size:11px;color:var(--text-3);text-transform:uppercase;letter-spacing:.05em">Anlernen</div>
        <div class="num" style="font-size:20px;margin-top:4px">${g(e.n_train)}</div>
        <div class="hilfe">Zieljahre bis 2023 · Ereignisrate ${pz(e.rate_train * 100)}</div></div>
      <div><div class="titel" style="font-size:11px;color:var(--text-3);text-transform:uppercase;letter-spacing:.05em">Prüfen</div>
        <div class="num" style="font-size:20px;margin-top:4px">${g(e.n_test)}</div>
        <div class="hilfe">Zieljahre 2024 und 2025 · Ereignisrate ${pz(e.rate_test * 100)}</div></div>
      <div><div class="titel" style="font-size:11px;color:var(--text-3);text-transform:uppercase;letter-spacing:.05em">Merkmale</div>
        <div class="num" style="font-size:20px;margin-top:4px">${e.merkmale.length}</div>
        <div class="hilfe">ausschließlich aus dem Vorjahr</div></div>
      <div><div class="titel" style="font-size:11px;color:var(--text-3);text-transform:uppercase;letter-spacing:.05em">Aufteilung</div>
        <div class="num" style="font-size:20px;margin-top:4px">zeitlich</div>
        <div class="hilfe">Prüfzeitraum beim Anlernen unbekannt</div></div>
    </div>`;

  const gm = e.modelle;
  $('#d_pergebnis').innerHTML = html`
    <div class="raster r3" style="margin-bottom:var(--s4)">
      ${gm.map(m => `<div class="karte">
        <header><div><h3>${sicher(m.name)}</h3><p>${m.auc !== null ? 'Fläche unter der Kurve' : 'Regelbasiert, ohne Anpassung'}</p></div></header>
        <div class="leib">
          <div class="reihe" style="align-items:baseline;gap:var(--s4)">
            <div><div class="num" style="font-size:30px;font-weight:560;letter-spacing:-.03em">${
      m.auc !== null ? z(m.auc, 3) : z(m.ausgeglichen, 3)}</div>
              <div class="hilfe">${m.auc !== null ? 'AUC' : 'ausgeglichene Trefferrate'}</div></div>
            <div style="margin-left:auto;text-align:right">
              <div class="num" style="font-size:13px">${z(m.ausgeglichen, 3)}</div>
              <div class="hilfe">ausgeglichen</div></div>
          </div>
          <div class="trenn" style="margin:var(--s4) 0"></div>
          <dl class="paare" style="font-size:12.5px">
            <dt>Sensitivität</dt><dd>${z(m.sensitivitaet, 3)}</dd>
            <dt>Spezifität</dt><dd>${z(m.spezifitaet, 3)}</dd>
            <dt>Präzision</dt><dd>${z(m.praezision, 3)}</dd>
            <dt>Trefferquote</dt><dd>${z(m.treffergenauigkeit, 3)}</dd>
          </dl>
          <p class="hilfe" style="margin-top:var(--s3)">${sicher(m.erlaeuterung)}</p>
        </div></div>`).join('')}
    </div>

    <div class="raster r21" style="margin-bottom:var(--s4)">
      <div class="karte">
        <header><div><h3>Vergleich der Verfahren</h3>
          <p>Berechnet im Werkzeug, daneben der in der Arbeit ausgewiesene Wert</p></div></header>
        <div class="leib ohne"><table class="tab">
          <thead><tr><th>Verfahren</th><th class="z">berechnet</th><th class="z">in der Arbeit</th>
            <th class="z">richtig positiv</th><th class="z">falsch positiv</th><th class="z">verpasst</th></tr></thead>
          <tbody>${gm.map(m => `<tr>
            <td class="haupt">${sicher(m.name)}</td>
            <td class="z num" style="font-weight:600">${m.auc !== null ? z(m.auc, 3) : z(m.ausgeglichen, 3)}</td>
            <td class="z num leise">${z(e.ausgewiesen[m.kurz], 3)}</td>
            <td class="z num">${g(m.richtig_positiv)}</td>
            <td class="z num">${g(m.falsch_positiv)}</td>
            <td class="z num">${g(m.falsch_negativ)}</td></tr>`).join('')}</tbody></table></div>
        <div class="leib" style="border-top:1px solid var(--rand)">
          <div class="meldung ${gm[0].ausgeglichen > (gm[1].auc || 0) ? 'warn' : 'info'}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 16v-5M12 8h.01"/></svg>
            <div>Die naive Fortschreibung übernimmt schlicht die Einstufung des Vorjahres.
              Sie erreicht ${z(gm[0].ausgeglichen, 3)} und liegt damit
              ${gm[0].ausgeglichen > (gm[1].auc || 0) ? '<b>über</b>' : 'unter'} der logistischen Regression.
              Der eigenständige Beitrag eines Modells ist der Abstand zu diesem Wert, nicht der Abstand zum Zufall.
              Der Vergleich benachteiligt die Fortschreibung sogar, weil eine Ja-Nein-Regel keine
              Schwellenwerte abwägen kann.</div>
          </div>
        </div>
      </div>
      <div class="karte"><div class="leib abb-leib"><div id="d_roc"></div></div></div>
    </div>

    <div class="raster r2">
      <div class="karte"><div class="leib abb-leib"><div id="d_bedeutung"></div></div></div>
      <div class="karte"><div class="leib abb-leib"><div id="d_gewichte"></div></div></div>
    </div>`;

  const bez = {
    eigenkapitalquote: 'Eigenkapitalquote', verschuldungsgrad: 'Verschuldungsgrad',
    liquiditaet_2: 'Liquidität 2. Grades', liquiditaet_3: 'Liquidität 3. Grades',
    anlagendeckung_2: 'Anlagendeckung II', anlagenintensitaet: 'Anlagenintensität',
    vorratsquote: 'Vorratsquote', log_bilanzsumme: 'Bilanzsumme (log.)',
    d_eigenkapitalquote: 'Δ Eigenkapitalquote', d_liquiditaet_2: 'Δ Liquidität II'
  };
  D.rocKurve($('#d_roc'), gm.filter(m => m.roc).map((m, i) => ({
    punkte: m.roc, farbe: i ? D.T.wald : D.T.logit,
    name: `${m.name} (AUC ${z(m.auc, 3)})`
  })), {
    titel: 'ROC-Kurve der Distress-Prognose',
    unter: 'Out-of-Time-Test, Zieljahre 2024 und 2025',
    quelle: `Quelle: eigene Erhebung (openfirmenbuch), N = ${g(S.ueber?.unternehmen)} GmbH, ${g(S.ueber?.firmenjahre)} Firmenjahre.`,
    datei: 'abbildung-roc-kurve', breite: 560, hoehe: 560
  });
  const rf = gm.find(m => m.bedeutung);
  if (rf) D.hbalken($('#d_bedeutung'), Object.entries(rf.bedeutung).slice(0, 10)
    .map(([k, v]) => ({ name: bez[k] || k, wert: v * 100, farbe: D.T.logit })), {
    titel: 'Einflussstärke der Kennzahlen',
    unter: 'Zufallswald, gewichtet nach Position im Baum',
    datei: 'abbildung-einflussstaerke', einheit: ' %', links: 230, breite: 620
  });
  const lr = gm.find(m => m.gewichte);
  if (lr) D.hbalken($('#d_gewichte'), Object.entries(lr.gewichte)
    .map(([k, v]) => ({ name: bez[k] || k, wert: Math.abs(v), farbe: v < 0 ? '#3ECF8E' : '#F2545B' })), {
    titel: 'Gewichte der logistischen Regression',
    unter: 'Auf standardisierten Merkmalen · grün senkt, rot erhöht die geschätzte Wahrscheinlichkeit',
    datei: 'abbildung-regressionsgewichte', links: 230, breite: 620, format: v => z(v, 2)
  });
}

/* ----------------------------------------------------------------- Erhebung */
const SCHRITTE = [
  ['Anfordern', 'Datensatz der Gesellschaft über die Firmenbuchnummer abrufen'],
  ['Zerlegen', 'Verschachtelte Antwort in flache Feld-Wert-Paare auflösen'],
  ['Zuordnen', 'Rohbezeichnung der Quelle auf das Feld im Datenmodell abbilden'],
  ['Prüfen', 'Rohwert in eine Zahl überführen, Geschäftsjahr bestimmen'],
  ['Speichern', 'Firmenjahr ablegen und jeden Einzelwert im Herkunftsnachweis belegen'],
  ['Berechnen', 'Kennzahlen entstehen bei jedem Aufruf neu aus den Rohwerten']
];
function zeigeErhebung() {
  $('#d_schritte').innerHTML = SCHRITTE.map(([n, b], i) => html`
    <div class="schritt aus" data-i="${i}">
      <div class="kreis">${i + 1}</div>
      <div class="txt"><b>${n}</b><span>${b}</span></div></div>`).join('');
  taktErhebung();
}
$$('#g_modus button').forEach(b => b.onclick = () => {
  $$('#g_modus button').forEach(x => x.classList.toggle('an', x === b));
  const t = {
    probe: 'Der gespeicherte Bestand läuft erneut durch dieselbe Verarbeitungskette. Ohne Netzzugriff, für Vorführungen geeignet.',
    live:  'Ruft die Schnittstelle für die bereits erfassten Gesellschaften ab und aktualisiert deren Werte.',
    neu:   'Sucht über den Suchendpunkt bisher unbekannte Gesellschaften der gewählten Branche und ruft deren Jahresabschlüsse ab. Der Bestand wächst dadurch.'
  };
  $('#modus_hilfe').textContent = t[b.dataset.m];
  $('#f_branche_e').title = b.dataset.m === 'neu'
    ? 'Optional. Ohne Stichwörter werden die hinterlegten Begriffe dieser Branche verwendet.' : '';
});
$$('#f_umfang ~ .gruppe button, .gruppe button[data-n]').forEach(b => b.onclick = () => {
  $('#f_umfang').value = b.dataset.n;
  $('#umfang_hilfe').textContent = b.dataset.n
    ? `${b.dataset.n} Gesellschaften werden abgerufen.`
    : 'Alle vorgemerkten Gesellschaften werden abgerufen.';
});
$('#f_umfang').oninput = () => {
  const n = parseInt($('#f_umfang').value);
  $('#umfang_hilfe').textContent = n > 0
    ? `${g(n)} Gesellschaften werden abgerufen.`
    : 'Leer lassen heißt: alle vorgemerkten Gesellschaften.';
};
$('#b_start').onclick = async () => {
  const modus = $('#g_modus button.an').dataset.m;
  const stich = ($('#f_stich') ? $('#f_stich').value : '')
    .split(',').map(x => x.trim()).filter(Boolean);
  try {
    S.log = 0;
    $('#e_log').innerHTML = '';
    const r = await senden('/api/erhebung/start', {
      modus, grenze: $('#f_umfang').value || null, branche: $('#f_branche_e').value || null,
      stichwoerter: stich.length ? stich : null
    });
    if (r.gefunden) $('#e_log').innerHTML =
      `<div class="z"><span class="s s-info">Suche</span><span class="x">` +
      `${g(r.gefunden)} neue Gesellschaften der Branche ${sicher($('#f_branche_e').value)} gefunden.</span></div>`;
    $('#b_start').disabled = true; $('#b_stopp').disabled = false;
    taktErhebung();
  } catch (e) {
    $('#e_log').innerHTML = `<div class="z"><span class="s s-fehler">Fehler</span><span class="x">${sicher(e.message)}</span></div>`;
  }
};
$('#b_stopp').onclick = () => senden('/api/erhebung/stop');

/* Der Abfragetakt plant sich nach jedem Durchgang selbst neu, statt an einem
   festen Intervall zu haengen. Damit koennen sich zwei Abfragen nie ueberholen,
   und ein langsamer Aufruf legt den Takt nicht still. Die Kennung sorgt dafuer,
   dass immer nur der juengste Takt weiterlaeuft. */
let taktNr = 0;
function taktErhebung() {
  const meins = ++taktNr;
  const tick = async () => {
    if (meins !== taktNr) return;
    let d;
    try {
      d = await hole('/api/erhebung?ab=' + S.log);
    } catch {
      if (meins === taktNr) setTimeout(tick, 800);
      return;
    }
    const zt = d.zustand;
    if (meins !== taktNr) return;
    if (!zt) { setTimeout(tick, 400); return; }
    S.log = d.gesamt_log;
    $('#e_fort').innerHTML = `${g(zt.erledigt)}<small> / ${g(zt.ziel)}</small>`;
    $('#e_jahre').textContent = g(zt.jahre);
    $('#e_werte').textContent = g(zt.werte);
    $('#e_fehler').textContent = g(zt.fehler);
    $('#e_balken').style.width = (zt.erledigt / Math.max(1, zt.ziel) * 100) + '%';
    /* 'bereit' ist der Zustand unmittelbar nach dem Anlegen des Laufs, bevor
       der Verarbeitungsfaden anlaeuft. Er zaehlt als offen, sonst bricht der
       Takt gleich im ersten Durchgang ab. */
    const offen = zt.status === 'laeuft' || zt.status === 'bereit';
    const lauft = zt.status === 'laeuft';
    $('#e_status').textContent = offen
      ? `${zt.modus === 'live' ? 'Live-Abruf' : 'Wiedergabe'} läuft · ${zt.aktuell || ''}`
      : { fertig: 'Abgeschlossen', angehalten: 'Angehalten', fehler: 'Mit Fehler beendet' }[zt.status] || 'Bereit';
    const m = $('#e_merk');
    m.className = 'merk ' + (offen ? 'akzent' : zt.status === 'fertig' ? 'gut' : 'warn');
    m.innerHTML = `<i></i>${offen ? 'läuft' : zt.status}`;
    $('#ampel').className = 'punkt ' + (offen ? 'laeuft' : '');
    $('#ampel_text').textContent = offen ? 'Erhebung läuft' : 'verbunden';
    $('#b_start').disabled = offen; $('#b_stopp').disabled = !offen;

    if (d.log?.length) {
      const f = document.createDocumentFragment();
      d.log.forEach(l => {
        const div = document.createElement('div');
        div.className = 'z';
        div.innerHTML = `<span class="t">${sicher(l.ts)}</span><span class="s s-${sicher(l.stufe)}">${sicher(l.stufe)}</span>` +
          `<span class="f">${sicher(l.fnr || '')}</span><span class="x">${sicher(l.text)}</span>`;
        f.appendChild(div);
      });
      const p = $('#e_log');
      p.appendChild(f);
      while (p.children.length > 900) p.removeChild(p.firstChild);
      p.scrollTop = p.scrollHeight;
    }
    if (offen) {
      const i = lauft ? zt.erledigt % SCHRITTE.length : 0;
      $$('#d_schritte .schritt').forEach((s, j) =>
        s.className = 'schritt ' + (j < i ? 'fertig' : j === i ? 'an' : 'aus'));
      setTimeout(tick, 400);
    } else {
      $$('#d_schritte .schritt').forEach(s => s.className = 'schritt ' + (zt.status === 'fertig' ? 'fertig' : 'aus'));
      if (zt.status === 'fertig' && !S.nachgeladen) {
        S.nachgeladen = true;
        await senden('/api/leeren');
        await laden();
        S.nachgeladen = false;
      }
    }
  };
  tick();
}

/* ----------------------------------------------------------------- Herkunft */
const BEZUG = [
  ['bilanzSumme', 'bilanzsumme', 'Bilanzsumme'], ['eigenkapital', 'eigenkapital', 'Eigenkapital'],
  ['anlageVermoegen', 'anlagevermoegen', 'Anlagevermögen'], ['umlaufvermoegen', 'umlaufvermoegen', 'Umlaufvermögen'],
  ['sachanlagen', 'sachanlagen', 'Sachanlagen'], ['finanzanlagen', 'finanzanlagen', 'Finanzanlagen'],
  ['immaterielleVermoegensgegenstaende', 'immaterielle_vermoegenswerte', 'Immaterielle Vermögensgegenstände'],
  ['vorraete', 'vorraete', 'Vorräte'], ['forderungen', 'forderungen', 'Forderungen'],
  ['liquidesVermoegen', 'liquide_mittel', 'Liquide Mittel'], ['rueckstellungen', 'rueckstellungen', 'Rückstellungen'],
  ['verbindlichkeiten', 'verbindlichkeiten', 'Verbindlichkeiten'],
  ['kurzfristigeVerbindlichkeiten', 'kfr_verbindlichkeiten', 'davon kurzfristig'],
  ['langfristigeVerbindlichkeiten', 'lfr_verbindlichkeiten', 'davon langfristig'],
  ['gewinnruecklagen', 'gewinnruecklagen', 'Gewinnrücklagen'],
  ['rechnungsabgrenzungen', 'aktive_rap', 'Aktive Rechnungsabgrenzung'],
  ['passiveRechnungsabgrenzungen', 'passive_rap', 'Passive Rechnungsabgrenzung'],
  ['umsatzerloese', 'umsatzerloese', 'Umsatzerlöse'], ['betriebsErfolg', 'ebit', 'Betriebserfolg'],
  ['ergebnisVorSteuern', 'ergebnis_vor_steuern', 'Ergebnis vor Steuern'],
  ['jahresueberschuss', 'jahresueberschuss', 'Jahresüberschuss'],
  ['personalaufwand', 'personalaufwand', 'Personalaufwand'],
  ['warenUndMaterialeinkauf', 'materialaufwand', 'Materialaufwand'],
  ['abschreibungen', 'abschreibungen', 'Abschreibungen'],
  ['zinsenUndAehnlicheAufwendungen', 'zinsaufwand', 'Zinsaufwand'],
  ['finanzerfolg', 'finanzergebnis', 'Finanzergebnis'],
  ['sonstigeBetrieblicheErtraege', 'sonstige_betriebliche_ertraege', 'Sonstige betriebliche Erträge'],
  ['sonstigeBetrieblicheAufwendungen', 'sonstige_betriebliche_aufwendungen', 'Sonstige betriebliche Aufwendungen'],
  ['bestandsveraenderung', 'bestandsveraenderung', 'Bestandsveränderung']
];
async function zeigeHerkunft() {
  $('#t_bezug').innerHTML = html`
    <thead><tr><th>Rohbezeichnung der Quelle</th><th>Feld im Datenmodell</th><th>Position</th></tr></thead>
    <tbody>${BEZUG.map(([r, f, n]) => `<tr>
      <td style="font-family:var(--zahl);font-size:11.5px">${sicher(r)}</td>
      <td style="font-family:var(--zahl);font-size:11.5px;color:var(--akzent)">${sicher(f)}</td>
      <td class="leise">${sicher(n)}</td></tr>`).join('')}</tbody>`;
  const u = S.ueber;
  $('#t_belegung').innerHTML = html`
    <thead><tr><th>Kenngröße</th><th class="z">Anzahl</th><th class="z">Anteil</th></tr></thead>
    <tbody>
      <tr><td>Firmenjahre gesamt</td><td class="z num">${g(u.firmenjahre)}</td><td class="z num">100,0 %</td></tr>
      <tr><td>davon mit offengelegter GuV</td><td class="z num">${g(u.guv)}</td>
        <td class="z num">${pz(u.guv / u.firmenjahre * 100)}</td></tr>
      <tr><td>Unternehmen mit ÖNACE-Kennung</td><td class="z num">${g(u.oenace)}</td>
        <td class="z num">${pz(u.oenace / u.unternehmen * 100)}</td></tr>
      <tr><td>Belegte Einzelwerte</td><td class="z num">${g(u.einzelwerte)}</td>
        <td class="z num leise">${z(u.einzelwerte / u.firmenjahre, 1)} je Firmenjahr</td></tr>
    </tbody>`;
}

/* ------------------------------------------------------------- Einstellungen */
async function zeigeEinstellungen() {
  const e = await hole('/api/einstellungen');
  $('#e_basis').value = e.api_basis || '';
  $('#e_pfad').value = e.api_pfad || '';
  $('#e_schluessel').value = e.api_schluessel || '';
  $('#e_art').value = e.auth_art || 'header';
  $('#e_feld').value = e.auth_feld || 'X-API-Key';
  $('#e_pause').value = e.pause_ms || 350;
  const u = S.ueber;
  $('#d_bestand').innerHTML = html`
    <dt>Unternehmen</dt><dd>${g(u.unternehmen)}</dd>
    <dt>Firmenjahre</dt><dd>${g(u.firmenjahre)}</dd>
    <dt>Einzelwerte</dt><dd>${g(u.einzelwerte)}</dd>
    <dt>Mit GuV</dt><dd>${g(u.guv)}</dd>
    <dt>Erhebungsläufe</dt><dd>${g(u.laeufe.length)}</dd>
    <dt>Letzter Lauf</dt><dd>${sicher((u.letzter_lauf?.gestartet || '–').replace('T', ' ').slice(0, 16))}</dd>`;
}
$('#b_speichern').onclick = async () => {
  await senden('/api/einstellungen', {
    api_basis: $('#e_basis').value, api_pfad: $('#e_pfad').value,
    api_schluessel: $('#e_schluessel').value, auth_art: $('#e_art').value,
    auth_feld: $('#e_feld').value, pause_ms: $('#e_pause').value
  });
  $('#d_pruef').innerHTML = '<div class="meldung gut"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6 9 17l-5-5"/></svg><div>Gespeichert.</div></div>';
  zeigeEinstellungen();
};
$('#b_suchen').onclick = async () => {
  $('#d_pruef').innerHTML = '<div class="lade"><div class="kreisel"></div>Endpunkte werden der Reihe nach abgefragt</div>';
  try {
    const r = await hole('/api/endpunkt-suche');
    const t = r.treffer;
    if (t) $('#e_pfad').value = t.pfad;   // der Dienst hat ihn bereits hinterlegt
    $('#d_pruef').innerHTML = html`
      <div class="meldung ${t ? 'gut' : 'warn'}">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">${t
        ? '<path d="M20 6 9 17l-5-5"/>' : '<circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16h.01"/>'}</svg>
        <div>${t
        ? `<b>Gefunden:</b> <code>${sicher(t.pfad)}</code> antwortet mit ${t.felder} Bilanzfeldern. Der Endpunkt ist gespeichert.`
        : `<b>Kein Endpunkt gefunden.</b> Keiner der ${r.versuche.length} geprüften Pfade liefert Daten.
           Der richtige lässt sich im Browser ablesen: openfirmenbuch.at öffnen, eine Gesellschaft aufrufen,
           mit <code>F12</code> die Entwicklerwerkzeuge öffnen, Reiter <em>Netzwerk</em>, Filter <em>Fetch/XHR</em>.
           Der Pfad der Anfrage gehört dann oben in das Feld Endpunkt.`}</div></div>
      <div class="rollen" style="max-height:230px;margin-top:var(--s3)">
        <table class="tab"><thead><tr><th>Pfad</th><th class="z">Kennung</th><th class="z">Felder</th><th></th></tr></thead>
        <tbody>${r.versuche.map(v => `<tr>
          <td style="font-family:var(--zahl);font-size:11.5px">${sicher(v.pfad)}</td>
          <td class="z num leise">${v.code ?? '–'}</td>
          <td class="z num">${v.felder || '–'}</td>
          <td class="leise" style="font-size:11.5px">${sicher((v.meldung || '').slice(0, 64))}</td>
        </tr>`).join('')}</tbody></table></div>`;
  } catch (e) {
    $('#d_pruef').innerHTML = `<div class="meldung gefahr"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/></svg><div>${sicher(e.message)}</div></div>`;
  }
};
$('#b_alle').onclick = async () => {
  $('#d_pruef').innerHTML = '<div class="lade"><div class="kreisel"></div>Alle vier Endpunkte werden abgefragt</div>';
  try {
    const r = await hole('/api/alle-endpunkte');
    $('#d_pruef').innerHTML = r.proben.map(p => html`
      <div class="karte" style="margin-bottom:var(--s3)">
        <div class="leib eng">
          <div class="reihe" style="justify-content:space-between;margin-bottom:var(--s2)">
            <b style="font-size:14px">${sicher(p.titel)}</b>
            <span class="merk ${p.ok ? 'gut' : 'kritisch'}"><i></i>${p.ok ? 'antwortet' : 'Kennung ' + (p.code ?? '–')}</span>
          </div>
          <div class="cap" style="font-family:var(--zahl);font-size:11.5px;margin-bottom:8px">
            POST ${sicher((p.basis || '') + p.pfad)}<br>
            Rumpf: ${sicher(JSON.stringify(p.rumpf || {}))}</div>
          ${p.erkannt?.length ? `<div class="hilfe">Erkannte Felder: ${p.erkannt.slice(0,10).map(sicher).join(', ')}</div>` : ''}
          <pre class="protokoll" style="height:120px;margin-top:8px;white-space:pre-wrap">${sicher((p.auszug || p.meldung || '').slice(0, 700))}</pre>
        </div>
      </div>`).join('');
  } catch (e) {
    $('#d_pruef').innerHTML = `<div class="meldung gefahr"><div>${sicher(e.message)}</div></div>`;
  }
};
$('#b_pruefen').onclick = async () => {
  $('#d_pruef').innerHTML = '<div class="lade"><div class="kreisel"></div>Verbindung wird geprüft</div>';
  try {
    const r = await hole('/api/verbindung');
    $('#d_pruef').innerHTML = html`
      <div class="meldung ${r.ok ? 'gut' : 'gefahr'}">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">${r.ok
        ? '<path d="M20 6 9 17l-5-5"/>' : '<circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16h.01"/>'}</svg>
        <div><b>${sicher(r.meldung)}</b>${r.ms ? ` · ${r.ms} ms` : ''}
          ${r.seitenhuelle ? '<br>Mit <em>Endpunkt suchen</em> lassen sich gebräuchliche Pfade automatisch durchprobieren.' : ''}
          ${r.erkannt?.length ? `<br>Bilanzfelder: ${r.erkannt.slice(0, 12).map(sicher).join(', ')}${r.erkannt.length > 12 ? ' …' : ''}` : ''}
          ${r.kennung?.length ? `<br>Ordnungsmerkmale: ${r.kennung.map(sicher).join(', ')}` : ''}
          ${r.unbekannt?.length ? `<br>Nicht zugeordnet: ${r.unbekannt.slice(0, 10).map(sicher).join(', ')}` : ''}
        </div></div>
      ${r.auszug ? `<pre class="protokoll" style="margin-top:var(--s3);height:200px;white-space:pre-wrap">${sicher(r.auszug)}</pre>` : ''}`;
  } catch (e) {
    $('#d_pruef').innerHTML = `<div class="meldung gefahr"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/></svg><div>${sicher(e.message)}</div></div>`;
  }
};

/* --------------------------------------------------------------------- Start */
$('#neu_laden').onclick = async () => {
  await senden('/api/leeren'); await laden(); wechsel(S.seite);
};
(async () => {
  try {
    await laden();
    wechsel(location.hash.slice(1) || 'uebersicht');
  } catch (e) {
    document.querySelector('main').innerHTML =
      `<div class="meldung gefahr"><div>Der Dienst antwortet nicht: ${sicher(e.message)}</div></div>`;
  }
})();
