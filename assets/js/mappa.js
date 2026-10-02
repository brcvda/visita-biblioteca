// Mappa/elenco delle tappe. L'elenco completo (anche le tappe non ancora
// pubblicate, mostrate come "in arrivo") viene dall'indice del foglio
// Google — non e' piu' scritto a mano qui: aggiungere una tappa nel foglio
// la fa comparire automaticamente anche in questa pagina.
(function () {
  var root = document.getElementById('mappa-root');

  function el(tag, opts) {
    var node = document.createElement(tag);
    opts = opts || {};
    if (opts.className) node.className = opts.className;
    if (opts.text) node.textContent = opts.text;
    return node;
  }

  function pathDaNumero(n) {
    return n < 10 ? '0' + n : String(n);
  }

  function renderElenco(indice) {
    var list = el('ul', { className: 'stop-list' });

    indice.forEach(function (t) {
      var li = document.createElement('li');
      var numeroTxt = String(t.numero).padStart(2, '0');

      if (t.pubblicata) {
        var a = document.createElement('a');
        a.href = '../q/' + pathDaNumero(t.numero) + '/';
        a.innerHTML = '<span class="stop-number">' + numeroTxt + '</span> ' + t.titolo;
        li.appendChild(a);
      } else {
        li.className = 'stop-muted';
        li.innerHTML = '<span class="stop-number">' + numeroTxt + '</span> ' +
          (t.titolo || 'Tappa ' + t.numero) + ' — in arrivo';
      }
      list.appendChild(li);
    });

    root.innerHTML = '';
    root.appendChild(list);
  }

  root.innerHTML = '<p class="state-message">Caricamento della mappa…</p>';

  window.VisitaAPI.get()
    .then(function (data) {
      renderElenco((data && data.indice) || []);
    })
    .catch(function () {
      // Errore di rete: meglio un messaggio chiaro che una pagina vuota (NFR-03).
      root.innerHTML = '';
      root.appendChild(el('p', { className: 'state-message',
        text: 'Non riusciamo a caricare la mappa. Controlla la connessione e riprova.' }));
    });
})();
