// Mappa/elenco delle tappe. Le tappe pubblicate arrivano dal feed;
// quelle non ancora pubblicate sono mostrate come "in arrivo" per
// dare comunque un'anteprima del percorso completo (doc 02 §3).
(function () {
  var root = document.getElementById('mappa-root');

  var TUTTE_LE_TAPPE = [
    { numero: 1, titolo: 'Benvenuti in biblioteca', slug: 'benvenuti-in-biblioteca', path: '01' },
    { numero: 2, titolo: 'Il viaggio di un libro' },
    { numero: 3, titolo: 'Come trovare il libro che cerchi' },
    { numero: 4, titolo: 'La biblioteca cresce con i suoi lettori' },
    { numero: 5, titolo: 'La memoria del territorio' },
    { numero: 6, titolo: 'La biblioteca oltre i libri' },
  ];

  function el(tag, opts) {
    var node = document.createElement(tag);
    opts = opts || {};
    if (opts.className) node.className = opts.className;
    if (opts.text) node.textContent = opts.text;
    return node;
  }

  function renderElenco(pubblicate) {
    var pubblicateSlugs = pubblicate.map(function (t) { return t.slug; });
    var list = el('ul', { className: 'stop-list' });

    TUTTE_LE_TAPPE.forEach(function (t) {
      var li = document.createElement('li');
      var pubblicata = pubblicateSlugs.indexOf(t.slug) !== -1;

      if (pubblicata && t.path) {
        var a = document.createElement('a');
        a.href = '../q/' + t.path + '/';
        a.innerHTML = '<span class="stop-number">' + String(t.numero).padStart(2, '0') + '</span> ' + t.titolo;
        li.appendChild(a);
      } else {
        li.className = 'stop-muted';
        li.innerHTML = '<span class="stop-number">' + String(t.numero).padStart(2, '0') + '</span> ' +
          t.titolo + ' — in arrivo';
      }
      list.appendChild(li);
    });

    root.innerHTML = '';
    root.appendChild(list);
  }

  root.innerHTML = '<p class="state-message">Caricamento della mappa…</p>';

  window.VisitaAPI.get()
    .then(function (data) {
      renderElenco((data && data.tappe) || []);
    })
    .catch(function () {
      // Anche in errore di rete mostriamo l'elenco completo come "in arrivo":
      // meglio orientamento parziale che una pagina vuota (NFR-03).
      renderElenco([]);
    });
})();
