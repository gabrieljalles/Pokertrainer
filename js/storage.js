/* RT.storage — wrapper de localStorage com fallback em memória (funciona mesmo se
   localStorage estiver bloqueado, ex: navegação privada). */
window.RT = window.RT || {};

RT.storage = (function () {
  "use strict";
  var memoryStore = {};
  var hasLocalStorage = false;
  try {
    var t = '__rt_test__';
    localStorage.setItem(t, '1');
    localStorage.removeItem(t);
    hasLocalStorage = true;
  } catch (e) { hasLocalStorage = false; }

  function get(key) {
    if (hasLocalStorage) {
      try { return localStorage.getItem(key); } catch (e) { return memoryStore[key] || null; }
    }
    return memoryStore[key] !== undefined ? memoryStore[key] : null;
  }
  function set(key, value) {
    if (hasLocalStorage) {
      try { localStorage.setItem(key, value); return; } catch (e) {}
    }
    memoryStore[key] = value;
  }
  function remove(key) {
    if (hasLocalStorage) { try { localStorage.removeItem(key); } catch (e) {} }
    delete memoryStore[key];
  }

  return { get: get, set: set, remove: remove, hasLocalStorage: hasLocalStorage };
})();
