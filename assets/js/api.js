// Wrapper minimale per leggere il feed pubblicato da Apps Script.
// Nessun dato scritto da qui: solo GET (NFR-05, privacy per progettazione).
window.VisitaAPI = (function () {
  var BASE = window.APP_CONFIG.API_URL;

  function get(params) {
    var url = BASE;
    var query = params
      ? Object.keys(params)
          .map(function (k) { return encodeURIComponent(k) + '=' + encodeURIComponent(params[k]); })
          .join('&')
      : '';
    if (query) url += '?' + query;

    return fetch(url)
      .then(function (res) {
        if (!res.ok) throw new Error('Errore di rete (' + res.status + ')');
        return res.json();
      });
  }

  function getTappaBySlug(slug) {
    return get({ action: 'tappa', slug: slug }).then(function (data) {
      if (data && data._status === 404) return null;
      if (data && data.error) return null;
      return data;
    });
  }

  return { get: get, getTappaBySlug: getTappaBySlug };
})();
