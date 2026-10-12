// Canale TV (doc VMB-TV-03).
// Legge il feed ?action=tv, ruota le schermate (TV-03, TV-07), rinnova i dati
// ogni 5 minuti (TV-04), conserva l'ultima sequenza valida nel browser (TV-05)
// e mostra sempre QR e URL nella fascia laterale (TV-02).
//
// Lo stesso file serve anche la pagina per lo schermo VERTICALE (solo
// locandine, senza QR). Le differenze si dichiarano sul <body> della pagina:
//   data-feed="tv_verticale"          -> quale feed leggere (predefinito: "tv")
//   data-fallback-titolo="..."        -> messaggio di emergenza neutro, senza
//                                        riferimenti a un QR che li' non c'e'
// e, se la pagina non ha gli elementi #qr e #url, QR e indirizzo non vengono
// generati.
(function () {
  var API = window.APP_CONFIG.API_URL;
  var FEED_ACTION = document.body.getAttribute('data-feed') || 'tv';
  var FALLBACK_TITOLO = document.body.getAttribute('data-fallback-titolo');
  var SCRIPT_SRC = document.currentScript && document.currentScript.src;

  // -- Impostazioni da ritoccare a mano ----------------------------------------
  // Pagina degli eventi: e' l'indirizzo del QR che accompagna le locandine, su
  // entrambi gli schermi. Per cambiarlo basta modificare questa riga.
  var EVENTI_URL = 'https://biblio.regione.vda.it/events/';
  // Scritta fissa che accompagna le locandine sullo schermo ORIZZONTALE. Sul
  // verticale la stessa scritta e' scritta direttamente in tv-verticale/index.html.
  var EVENTI_TITOLO = 'Eventi delle Biblioteche del SBV';
  // Orizzontale: scritta e QR compaiono di fianco a ogni locandina (e solo
  // quando va in onda una locandina). Verticale: sono fissi nella pagina.
  var EVENTI_ACCANTO_ALLA_LOCANDINA = (FEED_ACTION === 'tv');
  // La cache dello schermo orizzontale mantiene il nome storico; gli altri
  // schermi hanno una cache propria, cosi' non si scambiano mai i contenuti.
  var CACHE_KEY = 'vmb_tv_cache_v1' + (FEED_ACTION === 'tv' ? '' : '_' + FEED_ACTION);
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
  var FALLBACK = FALLBACK_TITOLO ? [{
    // Schermo senza QR (es. verticale): messaggio neutro, mai "inquadra il codice".
    id: 'fallback', tipo: 'messaggio',
    titolo: FALLBACK_TITOLO, sottotitolo: '',
    testo: '', ordine: 1, durata_s: INVITO_S, inizio_ms: null, fine_ms: null,
  }] : [{
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

  // Scritta accanto al QR secondario (vedi piu' sotto, dentro build()),
  // per tipo di contenuto. _default copre un tipo non elencato qui.
  var QR_SECONDARIO_ETICHETTE = {
    biblioteca_sonora: 'Ascolta subito',
    evento: 'Dettagli evento',
    libro: 'Scopri il libro',
    servizio: 'Scopri il servizio',
    _default: 'Scopri di più',
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

  // Pagine senza fascia QR (es. schermo verticale): niente QR, niente indirizzo.
  if (qrEl && urlEl) {
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
  }

  // -- QR degli eventi ----------------------------------------------------------

  // Orizzontale: lo stile del blocco scritta+QR sta in un foglio a parte,
  // caricato da qui (cosi' non occorre toccare tv/index.html ne' tv.css).
  if (EVENTI_ACCANTO_ALLA_LOCANDINA) {
    var linkStile = document.createElement('link');
    linkStile.rel = 'stylesheet';
    linkStile.href = SCRIPT_SRC ? new URL('../css/tv-locandine.css', SCRIPT_SRC).href
                                : '../assets/css/tv-locandine.css';
    document.head.appendChild(linkStile);
  }

  // Verticale: il QR e' un elemento fisso della pagina (#qr-eventi), che qui
  // viene solo disegnato.
  var qrEventiEl = document.getElementById('qr-eventi');
  if (qrEventiEl) qrEventiEl.innerHTML = qrSvg(EVENTI_URL);

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

    return fetch(API + '?action=' + FEED_ACTION, ctrl ? { signal: ctrl.signal } : {})
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
    // Locandina evento: layout a parte, l'immagine e' il contenuto stesso,
    // non un'illustrazione accanto a un testo (doc discusso in chat).
    if (c.tipo === 'locandina') {
      var wrap = h('div', 'locandina-wrap');
      var poster = document.createElement('img');
      poster.className = 'locandina-img';
      poster.alt = (c.immagine && c.immagine.alt) || 'Locandina evento';
      if (c.immagine && c.immagine.url) poster.src = c.immagine.url;
      wrap.appendChild(poster);

      if (EVENTI_ACCANTO_ALLA_LOCANDINA) {
        // Schermo orizzontale: locandina a sinistra, a destra la scritta con il
        // QR degli eventi (stile in assets/css/tv-locandine.css).
        wrap.className = 'locandina-wrap locandina-wrap--con-qr';
        var side = h('div', 'locandina-side');
        side.appendChild(h('p', 'locandina-caption', EVENTI_TITOLO));
        var qrBox = h('div', 'locandina-qr');
        qrBox.setAttribute('role', 'img');
        qrBox.setAttribute('aria-label', 'Codice QR per la pagina degli eventi');
        qrBox.innerHTML = qrSvg(EVENTI_URL);
        side.appendChild(qrBox);
        wrap.appendChild(side);
      }
      return { nodes: [wrap], conImmagine: false, poster: true };
    }

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

    // QR secondario: su qualunque tipo di contenuto (non solo biblioteca_sonora),
    // purche' richiesto in foglio (qr_facoltativo = si) e con un URL http(s)
    // valido nella stessa riga (doc 03 §11). La scritta accanto al QR cambia
    // in base al tipo, per restare pertinente al contenuto mostrato.
    if (c.qr_facoltativo && /^https?:\/\//.test(c.url || '')) {
      var box = h('div', 'qr-secondary');
      var qb = h('div', 'qr-box');
      qb.innerHTML = qrSvg(c.url);
      box.appendChild(qb);
      box.appendChild(h('span', null, QR_SECONDARIO_ETICHETTE[c.tipo] || QR_SECONDARIO_ETICHETTE._default));
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

  var areaEl = document.getElementById('area');

  function mostra(c) {
    slide.classList.add('is-out');
    setTimeout(function () {
      var built = build(c);
      slide.textContent = '';
      built.nodes.forEach(function (n) { slide.appendChild(n); });
      slide.className = 'slide' + (built.conImmagine ? ' with-image' : '') + ' is-out';
      areaEl.classList.toggle('area--poster', !!built.poster);
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
