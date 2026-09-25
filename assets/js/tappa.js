// Renderizza la tappa identificata da window.TAPPA_SLUG (impostato inline
// nella pagina /q/xx/index.html) leggendo il feed Apps Script.
(function () {
  var slug = window.TAPPA_SLUG;
  var params = new URLSearchParams(window.location.search);
  var modalitaFacile = params.get('facile') === '1';
  if (modalitaFacile) document.body.classList.add('facile');

  var root = document.getElementById('tappa-root');

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

  function renderTappa(t) {
    document.title = t.titolo + ' — Visita in biblioteca';
    root.innerHTML = '';

    root.appendChild(el('p', { className: 'eyebrow', text: 'Tappa ' + t.numero + ' di 6' }));
    root.appendChild(el('h1', { text: t.titolo }));
    if (t.sottotitolo) root.appendChild(el('p', { className: 'subtitle', text: t.sottotitolo }));

    if (t.immagine && t.immagine.url) {
      var frame = el('div', { className: 'image-frame' });
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

    if (t.curiosita) {
      var curBox = el('div', { className: 'box' });
      curBox.appendChild(el('h2', { text: 'Lo sapevi?' }));
      curBox.appendChild(el('p', { text: t.curiosita }));
      root.appendChild(curBox);
    }

    if (t.attivita) {
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

    root.appendChild(nav);
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
