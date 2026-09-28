(function () {
  var STORAGE_KEY = 'vmb_modalita';
  var params = new URLSearchParams(window.location.search);

  var modalitaFacile;
  if (params.has('facile')) {
    modalitaFacile = params.get('facile') === '1';
  } else {
    var salvata = null;
    try { salvata = localStorage.getItem(STORAGE_KEY); } catch (e) {}
    modalitaFacile = salvata === 'facile';
  }
  document.body.classList.toggle('facile', modalitaFacile);

  var azioniRoot = document.getElementById('azioni-root');
  var formRoot = document.getElementById('valutazione-root');

  function el(tag, opts) {
    var node = document.createElement(tag);
    opts = opts || {};
    if (opts.className) node.className = opts.className;
    if (opts.text) node.textContent = opts.text;
    return node;
  }

  // -- Tre azioni (Scopri un libro / Consulta gli eventi / Esplora altri servizi) --

  var AZIONI = [
    { categoria: 'catalogo', label: 'Scopri un libro' },
    { categoria: 'eventi', label: 'Consulta gli eventi' },
    { categoria: 'servizi', label: 'Esplora altri servizi' },
  ];

  function renderAzioni(links) {
    azioniRoot.innerHTML = '';
    AZIONI.forEach(function (azione) {
      var voce = links.filter(function (l) { return l.categoria === azione.categoria; })[0];
      if (voce && voce.url) {
        var a = document.createElement('a');
        a.className = 'button button--secondary';
        a.href = voce.url;
        a.textContent = azione.label;
        a.target = '_blank';
        a.rel = 'noopener';
        azioniRoot.appendChild(a);
      } else {
        var muto = el('p', { className: 'nav-status', text: azione.label + ' — collegamento in arrivo.' });
        azioniRoot.appendChild(muto);
      }
    });
  }

  window.VisitaAPI.get()
    .then(function (data) { renderAzioni((data && data.link) || []); })
    .catch(function () { renderAzioni([]); });

  // -- Modulo di valutazione (facoltativo, anonimo, FR-010) --

  function radioGroup(name, legendText, opzioni) {
    var fs = document.createElement('fieldset');
    fs.className = 'valutazione-domanda';
    var legend = document.createElement('legend');
    legend.textContent = legendText;
    fs.appendChild(legend);

    var wrap = el('div', { className: 'opzioni-risposta' });
    opzioni.forEach(function (opz, i) {
      var id = name + '-' + i;
      var label = document.createElement('label');
      label.className = 'opzione-risposta';
      var input = document.createElement('input');
      input.type = 'radio';
      input.name = name;
      input.value = opz;
      input.id = id;
      label.setAttribute('for', id);
      label.appendChild(input);
      label.appendChild(document.createTextNode(' ' + opz));
      wrap.appendChild(label);
    });
    fs.appendChild(wrap);
    return fs;
  }

  function costruisciForm() {
    var form = document.createElement('form');
    form.setAttribute('novalidate', 'novalidate');

    if (modalitaFacile) {
      form.appendChild(radioGroup(
        'domanda_facile_utile',
        'La visita ti è stata utile?',
        ['Sì', 'In parte', 'No']
      ));
    } else {
      form.appendChild(radioGroup(
        'domanda1_scoperto',
        'Hai scoperto qualcosa che non conoscevi?',
        ['Sì', 'In parte', 'No']
      ));
      form.appendChild(radioGroup(
        'domanda2_orientato',
        'Dopo la visita ti senti più orientato?',
        ['Sì', 'In parte', 'No']
      ));
      form.appendChild(radioGroup(
        'domanda3_semplicita',
        'Quanto è stato semplice seguire il percorso?',
        ['Semplice', 'Abbastanza semplice', 'Difficile']
      ));

      var commentoWrap = document.createElement('div');
      commentoWrap.className = 'valutazione-domanda';
      var commentoLabel = document.createElement('label');
      commentoLabel.setAttribute('for', 'commento');
      commentoLabel.textContent = 'Vuoi aggiungere altro? (facoltativo)';
      var commentoHint = el('p', {
        className: 'nav-status',
        text: 'Non inserire dati personali: il campo è anonimo.',
      });
      var textarea = document.createElement('textarea');
      textarea.id = 'commento';
      textarea.name = 'commento';
      textarea.maxLength = 500;
      textarea.rows = 3;
      commentoWrap.appendChild(commentoLabel);
      commentoWrap.appendChild(commentoHint);
      commentoWrap.appendChild(textarea);
      form.appendChild(commentoWrap);
    }

    var azioniForm = el('div', { className: 'nav-tappa' });
    var submitBtn = el('button', { className: 'button', text: 'Invia la valutazione' });
    submitBtn.type = 'submit';
    var skipBtn = el('button', { className: 'button button--secondary', text: 'Salta, non voglio valutare' });
    skipBtn.type = 'button';
    skipBtn.addEventListener('click', function () { nascondiForm_(); });

    azioniForm.appendChild(submitBtn);
    azioniForm.appendChild(skipBtn);
    form.appendChild(azioniForm);

    var esito = el('p', { className: 'nav-status' });
    form.appendChild(esito);

    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      inviaValutazione_(form, submitBtn, esito);
    });

    return form;
  }

  function nascondiForm_() {
    formRoot.innerHTML = '';
    formRoot.appendChild(el('p', { className: 'state-message', text: 'Va bene, nessuna valutazione inviata. Grazie per la visita!' }));
  }

  function inviaValutazione_(form, submitBtn, esito) {
    var formData = new FormData(form);
    var payload = { modalita: modalitaFacile ? 'facile' : 'standard' };
    formData.forEach(function (value, key) { payload[key] = value; });

    var domandeRichieste = modalitaFacile
      ? ['domanda_facile_utile']
      : ['domanda1_scoperto', 'domanda2_orientato', 'domanda3_semplicita'];
    var mancanti = domandeRichieste.some(function (k) { return !payload[k]; });
    if (mancanti) {
      esito.textContent = 'Rispondi a tutte le domande, oppure usa "Salta, non voglio valutare".';
      return;
    }

    submitBtn.disabled = true;
    esito.textContent = 'Invio in corso…';

    // text/plain evita la preflight CORS non gestita da Apps Script.
    fetch(window.APP_CONFIG.API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload),
    })
      .then(function (res) { return res.json(); })
      .then(function (data) {
        if (data && data.ok) {
          formRoot.innerHTML = '';
          formRoot.appendChild(el('h2', { text: 'Grazie!' }));
          formRoot.appendChild(el('p', { text: 'La tua valutazione anonima ci aiuta a migliorare la visita.' }));
        } else {
          submitBtn.disabled = false;
          esito.textContent = 'Non siamo riusciti a inviare la valutazione. Riprova.';
        }
      })
      .catch(function () {
        submitBtn.disabled = false;
        esito.textContent = 'Controlla la connessione e riprova.';
      });
  }

  formRoot.appendChild(costruisciForm());
})();
