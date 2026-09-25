// Renderizza la tappa identificata da window.TAPPA_SLUG (impostato inline
// nella pagina /q/xx/index.html) leggendo il feed Apps Script.
(function () {
  var slug = window.TAPPA_SLUG;
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

  function el(tag, opts) {
    var node = document.createElement(tag);
    opts = opts || {};
    if (opts.className) node.className = opts.className;
    if (opts.text) node.textContent = opts.text;
    if (opts.html) node.innerHTML = opts.html;
    return node;
  }

  function renderErrore(messaggio) {
    root.innerHTML = '';
    var box = el('div', { className: 'state-message' });
    box.appendChild(el('h2', { text: 'Non riusciamo a mostrare questa tappa' }));
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
    document.title = t.titolo + ' — Visita in biblioteca';
    root.innerHTML = '';

    renderToggleModalita();

    root.appendChild(el('p', { className: 'eyebrow', text: 'Tappa ' + t.numero + ' di 6' }));
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
      var audioWrap = el('div', { className: 'divider' === null ? '' : '' });
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

  function renderNavigazione(t) {
    var nav = el('nav', { className: 'nav-tappa' });
    nav.setAttribute('aria-label', 'Navigazione della visita');

    var mappaLink = el('a', { className: 'button button--secondary', text: 'Mappa' });
    mappaLink.href = '../../mappa/';
    nav.appendChild(mappaLink);

    if (modalitaFacile) {
      // Navigazione ridotta: solo Mappa e Home (meno opzioni, doc 02 §2).
      var homeLink = el('a', { className: 'button button--secondary', text: 'Torna all\'inizio' });
      homeLink.href = '../../';
      nav.appendChild(homeLink);
    } else {
      var successivaBtn = el('button', { className: 'button button--muted', text: 'Tappa successiva' });
      var statusNext = el('p', { className: 'nav-status' });
      successivaBtn.addEventListener('click', function () {
        statusNext.textContent = 'La tappa successiva arriverà nel prossimo step del prototipo.';
      });
      nav.appendChild(successivaBtn);
      nav.appendChild(statusNext);

      var terminaBtn = el('button', { className: 'button button--muted', text: 'Termina la visita' });
      var statusEnd = el('p', { className: 'nav-status' });
      terminaBtn.addEventListener('click', function () {
        statusEnd.textContent = 'La pagina conclusiva arriverà in uno dei prossimi step.';
      });
      nav.appendChild(terminaBtn);
      nav.appendChild(statusEnd);
    }

    var infoLink = el('a', { className: 'footer-link', text: 'Informazioni (accessibilità, privacy, contatti)' });
    infoLink.href = '../../informazioni/';
    root.appendChild(nav);
    root.appendChild(infoLink);
  }

  root.innerHTML = '<p class="state-message">Caricamento della tappa…</p>';

  window.VisitaAPI.getTappaBySlug(slug)
    .then(function (t) {
      if (!t) {
        renderErrore('Questa tappa non è al momento pubblicata.');
        return;
      }
      renderTappa(t);
    })
    .catch(function () {
      renderErrore('Controlla la connessione e riprova. Se il problema continua, torna alla home.');
    });
})();
