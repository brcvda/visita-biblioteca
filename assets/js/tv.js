// Canale TV (doc VMB-TV-03).
// Legge il feed ?action=tv, ruota le schermate (TV-03, TV-07), rinnova i dati
// ogni 5 minuti (TV-04), conserva l'ultima sequenza valida nel browser (TV-05)
// e mostra sempre QR e URL nella fascia laterale (TV-02).
(function () {
  var API = window.APP_CONFIG.API_URL;
  var CACHE_KEY = 'vmb_tv_cache_v1';
  var REFRESH_MS = 5 * 60 * 1000;   // TV-04: aggiornamento entro 10 minuti
  var FETCH_TIMEOUT_MS = 20000;
  var DEFAULT_S = 15;               // durata predefinita (doc 03 §4)
  var INVITO_S = 20;
  var RELOAD_AFTER_MS = 12 * 60 * 60 * 1000; // ricarica pulita dopo 12 ore di esecuzione
  var FADE_MS = 450;

  var reduceMotion = window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var params = new URLSearchParams(window.location.search);

  var slide = document.getElementById('slide');
  var techEl = document.getElementById('tech');

  var state = {
    contenuti: [],
    tappe: [],
    fonte: 'nessuna',      // nessuna | cache | feed
    ricevutoIl: null,
    errore: null,
    idx: 0,
    corrente: 0,
    totale: 0,
  };

  // Schermata locale di emergenza: sempre disponibile, anche senza rete né cache.
  var FALLBACK = [{
    id: 'fallback', tipo: 'invito',
    titolo: 'Scopri la biblioteca in 15 minuti',
    sottotitolo: 'Sei tappe tra spazi, raccolte e servizi',
    testo: '', ordine: 1, durata_s: INVITO_S, inizio_ms: null, fine_ms: null,
  }];

  var ETICHETTE = {
    invito: 'Visita multimediale',
    tappe: 'Il percorso',
    evento: 'Appuntamento',
    libro: 'Il consiglio dei bibliotecari',
    servizio: 'Un servizio da scoprire',
    curiosita: 'Lo sapevi?',
    biblioteca_sonora: 'Da ascoltare',
  };

  // -- Utilità -----------------------------------------------------------------

  function h(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined && text !== null && text !== '') n.textContent = String(text);
    return n;
  }

  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  function oraLocale(ms) {
    if (!ms) return 'mai';
    var d = new Date(ms);
    return pad2(d.getHours()) + ':' + pad2(d.getMinutes()) + ':' + pad2(d.getSeconds());
  }

  function qrSvg(url) {
    try {
      var q = window.qrcode(0, 'M');
      q.addData(url);
      q.make();
      return q.createSvgTag({ cellSize: 4, margin: 0, scalable: true });
    } catch (e) {
      return '';
    }
  }

  // -- Fascia persistente: QR e URL della visita (TV-02) ------------------------

  // L'indirizzo viene dal foglio CONFIG (chiave "dominio"). In attesa della
  // prima risposta del foglio, o se il foglio non e' raggiungibile, si mostra
  // comunque l'indirizzo pubblico corretto — mai un percorso locale o di prova
  // (es. file:///... quando la pagina viene aperta da un PC per un controllo).
  var URL_PRODUZIONE = 'https://brcvda.github.io/visita-biblioteca/';
  var CONFIG_CACHE_KEY = 'vmb_tv_config_v1';
  var qrEl = document.getElementById('qr');
  var urlEl = document.getElementById('url');
  var urlMostrato = null;

  function mostraUrlVisita(url) {
    if (!url || url === urlMostrato) return;
    urlMostrato = url;
    qrEl.innerHTML = qrSvg(url);
    urlEl.textContent = url.replace(/^https?:\/\//, '').replace(/\/$/, '');
  }

  mostraUrlVisita(URL_PRODUZIONE); // visibile da subito, anche offline

  (function caricaDominioConfigurato() {
    try {
      var cached = window.localStorage.getItem(CONFIG_CACHE_KEY);
      if (cached) mostraUrlVisita(cached);
    } catch (e) {}

    fetch(API + '?action=config')
      .then(function (res) { return res.ok ? res.json() : null; })
      .then(function (cfg) {
        var dominio = cfg && cfg.dominio;
        if (!dominio) return;
        mostraUrlVisita(dominio);
        try { window.localStorage.setItem(CONFIG_CACHE_KEY, dominio); } catch (e) {}
      })
      .catch(function () { /* resta l'indirizzo di produzione gia' mostrato */ });
  })();

  // -- Dati: cache locale e feed --------------------------------------------------

  function loadCache() {
    try {
      var raw = window.localStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      var d = JSON.parse(raw);
      return d && Array.isArray(d.contenuti) ? d : null;
    } catch (e) { return null; }
  }

  function saveCache(d) {
    try { window.localStorage.setItem(CACHE_KEY, JSON.stringify(d)); } catch (e) {}
  }

  function applica(d, fonte) {
    state.contenuti = d.contenuti;
    state.tappe = d.tappe || [];
    state.fonte = fonte;
    state.ricevutoIl = d.ricevuto_il || d.generato_il || null;
  }

  function fetchFeed() {
    var ctrl = 'AbortController' in window ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, FETCH_TIMEOUT_MS);

    return fetch(API + '?action=tv', ctrl ? { signal: ctrl.signal } : {})
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(function (d) {
        clearTimeout(timer);
        if (!d || !Array.isArray(d.contenuti)) throw new Error('feed non valido');
        d.ricevuto_il = Date.now();
        saveCache(d);
        applica(d, 'feed');
        state.errore = null;
      })
      .catch(function (e) {
        clearTimeout(timer);
        // Nessuna interruzione: si continua con l'ultima sequenza valida (TV-05).
        state.errore = String((e && e.message) || e);
      })
      .then(updateTech);
  }

  // TV-03 / TV-07: il filtro per data/ora e' applicato a ogni schermata,
  // anche sui dati in cache, cosi' un contenuto scaduto non compare mai.
  function attivi(now) {
    var lista = state.contenuti
      .filter(function (c) {
        return (c.inizio_ms == null || c.inizio_ms <= now) &&
               (c.fine_ms == null || c.fine_ms >= now);
      })
      .sort(function (a, b) { return (a.ordine || 0) - (b.ordine || 0); });
    return lista.length ? lista : FALLBACK;
  }

  // -- Costruzione delle schermate ------------------------------------------------

  function build(c) {
    var col = h('div', 'slide-text');
    col.appendChild(h('p', 'label', ETICHETTE[c.tipo] || ''));
    col.appendChild(h('h1', 'title', c.titolo));
    if (c.sottotitolo) col.appendChild(h('p', 'subtitle', c.sottotitolo));

    var testo = c.testo;
    if (c.tipo === 'invito' && !testo) testo = 'Inquadra il codice a destra: puoi iniziare da qui.';
    if (testo) col.appendChild(h('p', 'text', testo));

    if (c.tipo === 'tappe' && state.tappe.length) {
      var ol = h('ol', 'tappe-list');
      state.tappe
        .slice()
        .sort(function (a, b) { return Number(a.numero) - Number(b.numero); })
        .forEach(function (t) {
          var li = h('li');
          li.appendChild(h('span', 'num', pad2(Number(t.numero))));
          li.appendChild(h('span', null, t.titolo));
          ol.appendChild(li);
        });
      col.appendChild(ol);
    }

    // QR secondario: solo se richiesto e con un URL http(s) valido (doc 03 §11).
    if (c.tipo === 'biblioteca_sonora' && c.qr_facoltativo && /^https?:\/\//.test(c.url || '')) {
      var box = h('div', 'qr-secondary');
      var qb = h('div', 'qr-box');
      qb.innerHTML = qrSvg(c.url);
      box.appendChild(qb);
      box.appendChild(h('span', null, 'Ascolta subito'));
      col.appendChild(box);
    }

    var nodes = [col];
    var conImmagine = false;
    if (c.immagine && c.immagine.url) {
      var img = document.createElement('img');
      img.className = 'slide-image';
      img.alt = c.immagine.alt || '';
      img.src = c.immagine.url;
      // Se l'immagine non si carica (rete assente) la schermata resta valida senza.
      img.onerror = function () {
        img.remove();
        slide.classList.remove('with-image');
      };
      nodes.push(img);
      conImmagine = true;
    }
    return { nodes: nodes, conImmagine: conImmagine };
  }

  function mostra(c) {
    slide.classList.add('is-out');
    setTimeout(function () {
      var built = build(c);
      slide.textContent = '';
      built.nodes.forEach(function (n) { slide.appendChild(n); });
      slide.className = 'slide' + (built.conImmagine ? ' with-image' : '') + ' is-out';
      void slide.offsetWidth; // forza il ricalcolo prima di riattivare la dissolvenza
      slide.classList.remove('is-out');
    }, reduceMotion ? 0 : FADE_MS);
  }

  // -- Ciclo di rotazione -----------------------------------------------------------

  function tick() {
    // Ricarica pulita dopo molte ore: l'ultima sequenza resta in cache locale.
    if (window.performance && performance.now() > RELOAD_AFTER_MS) {
      window.location.reload();
      return;
    }

    var lista = attivi(Date.now());
    var pos = state.idx % lista.length;
    var c = lista[pos];
    state.idx = pos + 1;
    state.corrente = pos + 1;
    state.totale = lista.length;

    mostra(c);
    updateTech();

    var secondi = c.durata_s > 0 ? c.durata_s : (c.tipo === 'invito' ? INVITO_S : DEFAULT_S);
    setTimeout(tick, secondi * 1000);
  }

  // -- Piè tecnico (solo personale) e scorciatoie -----------------------------------

  function updateTech() {
    if (techEl.hidden) return;
    var parti = [
      'Rete: ' + (navigator.onLine ? 'online' : 'assente'),
      'Dati: ' + state.fonte,
      'Ultimo aggiornamento: ' + oraLocale(state.ricevutoIl),
      'Schermata ' + state.corrente + ' di ' + state.totale,
    ];
    if (state.errore) parti.push('Ultimo errore: ' + state.errore);
    techEl.textContent = parti.join(' — ');
  }

  function toggleTech() {
    techEl.hidden = !techEl.hidden;
    updateTech();
  }

  document.addEventListener('keydown', function (ev) {
    if (ev.key === 'i' || ev.key === 'I') toggleTech();
    if (ev.key === 'f' || ev.key === 'F') {
      if (document.fullscreenElement) document.exitFullscreen();
      else if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen();
    }
  });

  if (params.get('staff') === '1') techEl.hidden = false;

  // Evita che lo schermo si spenga mentre la pagina e' visibile (dove supportato).
  function keepAwake() {
    if (!('wakeLock' in navigator)) return;
    navigator.wakeLock.request('screen').catch(function () {});
  }
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible') keepAwake();
  });
  keepAwake();

  window.addEventListener('online', function () { fetchFeed(); });
  window.addEventListener('offline', updateTech);

  // -- Avvio -----------------------------------------------------------------------

  var cached = loadCache();
  if (cached) applica(cached, 'cache');

  tick();          // parte subito con cache o schermata di emergenza
  fetchFeed();     // poi aggiorna i dati
  setInterval(fetchFeed, REFRESH_MS);
})();
