// Renderizza la tappa corrispondente a QUESTA pagina. Il numero di tappa si
// ricava dalla cartella in cui si trova la pagina stessa (/q/07/ -> 7): ogni
// pagina /q/0N/index.html e' quindi identica a tutte le altre, parola per
// parola. Aggiungere una tappa = duplicare una cartella esistente e
// rinominarla; non c'e' nessuno slug o numero da scrivere dentro il file.
(function () {
  var params = new URLSearchParams(window.location.search);

  // Modalità: priorità a ?facile= esplicito in URL, poi alla preferenza
  // salvata localmente (FR-008, consigliato), poi standard di default.
  var STORAGE_KEY = 'vmb_modalita';
  var modalitaFacile;
  if (params.has('facile')) {
    modalitaFacile = params.get('facile') === '1';
    try { localStorage.setItem(STORAGE_KEY, modalitaFacile ? 'facile' : 'standard'); } catch (e) {}
  } else {
    var salvata = null;
    try { salvata = localStorage.getItem(STORAGE_KEY); } catch (e) {}
    modalitaFacile = salvata === 'facile';
  }
  document.body.classList.toggle('facile', modalitaFacile);

  var root = document.getElementById('tappa-root');
  var currentTappa = null;
  var indiceTappe = []; // tutte le tappe del foglio (pubblicate o no): serve solo a sapere se esiste una "successiva"

  function numeroTappaDaUrl() {
    var parti = window.location.pathname.split('/').filter(Boolean);
    var i = parti.indexOf('q');
    if (i === -1 || !parti[i + 1]) return null;
    var n = parseInt(parti[i + 1], 10);
    return isNaN(n) ? null : n;
  }

  function el(tag, opts) {
    var node = document.createElement(tag);
    opts = opts || {};
    if (opts.className) node.className = opts.className;
    if (opts.text) node.textContent = opts.text;
    if (opts.html) node.innerHTML = opts.html;
    return node;
  }

  function renderErrore(titolo, messaggio) {
    root.innerHTML = '';
    var box = el('div', { className: 'state-message' });
    box.appendChild(el('h2', { text: titolo }));
    box.appendChild(el('p', { text: messaggio }));
    var link = el('a', { className: 'button', text: 'Torna alla home' });
    link.href = '../../';
    box.appendChild(link);
    root.appendChild(box);
  }

  function renderToggleModalita() {
    var wrap = el('div', { className: 'mode-toggle' });
    wrap.setAttribute('role', 'group');
    wrap.setAttribute('aria-label', 'Modalità di visualizzazione');

    var standardBtn = el('button', { className: 'mode-pill', text: 'Versione standard' });
    var facileBtn = el('button', { className: 'mode-pill', text: 'Versione facile' });
    standardBtn.setAttribute('aria-pressed', String(!modalitaFacile));
    facileBtn.setAttribute('aria-pressed', String(modalitaFacile));
    if (!modalitaFacile) standardBtn.classList.add('mode-pill--active');
    if (modalitaFacile) facileBtn.classList.add('mode-pill--active');

    standardBtn.addEventListener('click', function () { impostaModalita(false); });
    facileBtn.addEventListener('click', function () { impostaModalita(true); });

    wrap.appendChild(standardBtn);
    wrap.appendChild(facileBtn);
    root.appendChild(wrap);
  }

  function impostaModalita(facile) {
    modalitaFacile = facile;
    document.body.classList.toggle('facile', facile);
    try { localStorage.setItem(STORAGE_KEY, facile ? 'facile' : 'standard'); } catch (e) {}
    var url = new URL(window.location.href);
    url.searchParams.set('facile', facile ? '1' : '0');
    window.history.replaceState(null, '', url);
    if (currentTappa) renderTappa(currentTappa);
  }

  function renderTappa(t) {
    currentTappa = t;
    var totaleTappe = indiceTappe.length || Number(t.numero);
    document.title = t.titolo + ' — Visita in biblioteca';
    root.innerHTML = '';

    renderToggleModalita();

    root.appendChild(el('p', { className: 'eyebrow', text: 'Tappa ' + t.numero + ' di ' + totaleTappe }));
    root.appendChild(el('h1', { text: t.titolo }));
    if (t.sottotitolo) root.appendChild(el('p', { className: 'subtitle', text: t.sottotitolo }));

    if (t.immagine && t.immagine.url) {
      var frame = el('div', { className: 'image-frame' + (modalitaFacile ? ' image-frame--grande' : '') });
      var img = document.createElement('img');
      img.src = t.immagine.url;
      img.alt = t.immagine.alt || '';
      img.loading = 'lazy';
      frame.appendChild(img);
      root.appendChild(frame);
    }

    var testoPrincipale = modalitaFacile && t.testo_facile ? t.testo_facile : t.testo;
    root.appendChild(el('p', { text: testoPrincipale }));

    // Audio: nessun autoplay, avviato solo su azione esplicita (FR-004)
    if (t.audio && t.audio.url) {
      var playBtn = el('button', { className: 'button button--secondary', text: 'Ascolta l\'audio della tappa' });
      var audioEl = null;
      playBtn.addEventListener('click', function () {
        if (!audioEl) {
          audioEl = document.createElement('audio');
          audioEl.controls = true;
          audioEl.src = t.audio.url;
          audioEl.style.width = '100%';
          audioEl.style.marginTop = '0.5rem';
          playBtn.replaceWith(audioEl);
        }
        audioEl.play();
      });
      root.appendChild(playBtn);
    }

    // Trascrizione integrale, sempre disponibile nella stessa pagina (FR-005)
    if (t.trascrizione) {
      var details = document.createElement('details');
      var summary = document.createElement('summary');
      summary.textContent = 'Leggi la trascrizione completa';
      summary.style.cursor = 'pointer';
      summary.style.fontWeight = '700';
      summary.style.marginTop = '1rem';
      details.appendChild(summary);
      var tp = el('p', { text: t.trascrizione });
      tp.style.marginTop = '0.75rem';
      details.appendChild(tp);
      root.appendChild(details);
    }

    // "Lo sapevi?" e "Attività" sono contenuti facoltativi: nella versione
    // facile restano nascosti per ridurre le opzioni (doc 02 §2).
    if (t.curiosita && !modalitaFacile) {
      var curBox = el('div', { className: 'box' });
      curBox.appendChild(el('h2', { text: 'Lo sapevi?' }));
      curBox.appendChild(el('p', { text: t.curiosita }));
      root.appendChild(curBox);
    }

    if (t.attivita && !modalitaFacile) {
      var attBox = el('div', { className: 'box' });
      attBox.style.borderLeftColor = 'var(--color-accent)';
      attBox.style.background = 'var(--color-bg-alt)';
      attBox.appendChild(el('h2', { text: 'Attività' }));
      attBox.appendChild(el('p', { text: t.attivita }));
      root.appendChild(attBox);
    }

    if (t.indicazioni_prossima_tappa) {
      root.appendChild(el('h2', { text: 'Verso la prossima tappa' }));
      root.appendChild(el('p', { text: t.indicazioni_prossima_tappa }));
    }

    renderNavigazione(t);
  }

  function hrefTappa(n) {
    var nn = n < 10 ? '0' + n : String(n);
    return '../' + nn + '/' + (modalitaFacile ? '?facile=1' : '');
  }

  function renderNavigazione(t) {
    var n = Number(t.numero);
    // "Esiste una prossima tappa?" si ricava dall'indice del foglio (anche se
    // non ancora pubblicata), non da un numero fisso scritto nel codice.
    var esisteSuccessiva = indiceTappe.some(function (x) { return x.numero === n + 1; });

    var nav = el('nav', { className: 'nav-tappa' });
    nav.setAttribute('aria-label', 'Navigazione della visita');

    var principale;
    if (esisteSuccessiva) {
      principale = el('a', { className: 'button', text: 'Tappa successiva' });
      principale.href = hrefTappa(n + 1);
    } else {
      principale = el('a', { className: 'button', text: 'Termina la visita' });
      principale.href = '../../conclusione/' + (modalitaFacile ? '?facile=1' : '');
    }
    nav.appendChild(principale);

    if (!modalitaFacile && n > 1) {
      var prec = el('a', { className: 'button button--secondary', text: 'Tappa precedente' });
      prec.href = hrefTappa(n - 1);
      nav.appendChild(prec);
    }

    var mappaLink = el('a', { className: 'button button--secondary', text: 'Mappa' });
    mappaLink.href = '../../mappa/';
    nav.appendChild(mappaLink);

    if (!modalitaFacile && esisteSuccessiva) {
      var fine = el('a', { className: 'button button--secondary', text: 'Termina la visita' });
      fine.href = '../../conclusione/';
      nav.appendChild(fine);
    }

    var infoLink = el('a', { className: 'footer-link', text: 'Informazioni (accessibilità, privacy, contatti)' });
    infoLink.href = '../../informazioni/';
    root.appendChild(nav);
    root.appendChild(infoLink);
  }

  root.innerHTML = '<p class="state-message">Caricamento della tappa…</p>';

  var numero = numeroTappaDaUrl();
  if (numero === null) {
    renderErrore('Indirizzo non valido', 'Questa pagina non si trova nella cartella /q/NN/ prevista.');
    return;
  }

  window.VisitaAPI.get()
    .then(function (data) {
      indiceTappe = (data && data.indice) || [];
      var pubblicate = (data && data.tappe) || [];
      var t = pubblicate.filter(function (x) { return Number(x.numero) === numero; })[0];

      if (t) { renderTappa(t); return; }

      var vocePrevista = indiceTappe.filter(function (x) { return x.numero === numero; })[0];
      if (vocePrevista) {
        renderErrore('Tappa non ancora pubblicata', 'Questa tappa non è al momento pubblicata.');
      } else {
        renderErrore('Tappa non trovata', 'Non esiste una tappa numero ' + numero + ' nel foglio.');
      }
    })
    .catch(function () {
      renderErrore('Problema di connessione', 'Controlla la connessione e riprova. Se il problema continua, torna alla home.');
    });
})();
