// ============================================================
// store.js — State management with Firebase Realtime Database
// Falls back to localStorage + BroadcastChannel if Firebase unavailable
// ============================================================

const STORE_KEY = 'marketgame_state';
const FIREBASE_PATH = '/game/state';

class GameStore {
  constructor() {
    this.listeners = [];
    this._cache = null;
    this._useFirebase = false;
    this._dbRef = null;
    this._ready = false;
    this._readyCallbacks = [];
    this._writeTimer = null;
    this._pendingWrite = null;

    // Try to initialize Firebase
    if (typeof firebase !== 'undefined' && firebase.database) {
      try {
        this._dbRef = firebase.database().ref(FIREBASE_PATH);
        this._useFirebase = true;

        // Listen for remote changes
        this._dbRef.on('value', (snapshot) => {
          const val = snapshot.val();
          if (val) {
            this._cache = val;
            localStorage.setItem(STORE_KEY, JSON.stringify(val));
          } else if (!this._ready) {
            // First load, no data in Firebase — initialize
            const initial = createInitialState();
            this._dbRef.set(initial);
            this._cache = initial;
            localStorage.setItem(STORE_KEY, JSON.stringify(initial));
          }
          if (!this._ready) {
            this._ready = true;
            this._readyCallbacks.forEach(fn => fn());
            this._readyCallbacks = [];
          }
          this._notifyListeners();
        });

        console.log('[Store] Firebase connected');
      } catch (e) {
        console.warn('[Store] Firebase init failed, falling back to localStorage', e);
        this._useFirebase = false;
      }
    }

    // Fallback: BroadcastChannel for same-device sync
    if (!this._useFirebase) {
      console.log('[Store] Using localStorage + BroadcastChannel');
      this._channel = new BroadcastChannel('marketgame_sync');
      this._channel.onmessage = (e) => {
        if (e.data.type === 'stateUpdate') {
          this._cache = null;
          this._notifyListeners();
        }
      };
      this._ready = true;
    }
  }

  onReady(fn) {
    if (this._ready) { fn(); return; }
    this._readyCallbacks.push(fn);
  }

  getState() {
    if (this._cache) return this._cache;
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) {
      this._cache = JSON.parse(raw);
      return this._cache;
    }
    const initial = createInitialState();
    localStorage.setItem(STORE_KEY, JSON.stringify(initial));
    this._cache = initial;
    return initial;
  }

  // Partial update to Firebase with debounce — only writes changed fields,
  // so it won't overwrite concurrent writes from other devices (e.g. order submissions)
  _firebaseUpdate(updates) {
    // Merge pending updates
    if (!this._pendingUpdates) this._pendingUpdates = {};
    Object.assign(this._pendingUpdates, updates);

    if (!this._writeTimer) {
      this._writeTimer = setTimeout(() => {
        if (this._pendingUpdates && this._dbRef) {
          this._dbRef.update(this._pendingUpdates);
        }
        this._pendingUpdates = null;
        this._writeTimer = null;
      }, 200);
    }
  }

  setState(updates, immediate) {
    const current = this.getState();
    const next = { ...current, ...updates };
    this._cache = next;
    localStorage.setItem(STORE_KEY, JSON.stringify(next));

    if (this._useFirebase && this._dbRef) {
      // Always use update() to avoid overwriting concurrent changes from other devices.
      // update() merges at the top level, so only the changed keys are written.
      const clean = JSON.parse(JSON.stringify(updates));
      if (immediate) {
        // Cancel any pending debounced writes
        if (this._writeTimer) { clearTimeout(this._writeTimer); this._writeTimer = null; }
        this._pendingUpdates = null;
        this._dbRef.update(clean).catch(function(err) { console.error('[Store] Firebase update failed:', err); });
      } else {
        this._firebaseUpdate(clean);
      }
    } else {
      if (this._channel) this._channel.postMessage({ type: 'stateUpdate' });
    }
    // Always notify locally for immediate responsiveness
    this._notifyListeners();
  }

  mergeState(path, value) {
    const state = this.getState();
    const keys = path.split('.');
    let obj = state;
    for (let i = 0; i < keys.length - 1; i++) {
      if (!obj[keys[i]]) obj[keys[i]] = {};
      obj = obj[keys[i]];
    }
    obj[keys[keys.length - 1]] = value;
    this._cache = state;
    localStorage.setItem(STORE_KEY, JSON.stringify(state));

    if (this._useFirebase && this._dbRef) {
      // Order submissions: write the parent object that changed
      if (this._writeTimer) { clearTimeout(this._writeTimer); this._writeTimer = null; }
      this._pendingUpdates = null;
      // Build the top-level key to update (e.g., 'orders' for path 'orders.group1')
      const topKey = keys[0];
      const updateObj = {};
      updateObj[topKey] = JSON.parse(JSON.stringify(state[topKey]));
      this._dbRef.update(updateObj).catch(function(err) { console.error('[Store] Firebase merge failed:', err); });
    } else {
      if (this._channel) this._channel.postMessage({ type: 'stateUpdate' });
    }
    this._notifyListeners();
  }

  subscribe(fn) {
    this.listeners.push(fn);
    // Immediately call with current state so subscriber doesn't miss Firebase's first load
    try { fn(this.getState()); } catch(e) {}
    return () => { this.listeners = this.listeners.filter(l => l !== fn); };
  }

  _notifyListeners() {
    const state = this.getState();
    this.listeners.forEach(fn => {
      try { fn(state); } catch(e) { console.error('[Store] Listener error:', e); }
    });
  }

  resetGame() {
    const initial = createInitialState();
    this._cache = initial;
    localStorage.setItem(STORE_KEY, JSON.stringify(initial));

    if (this._useFirebase && this._dbRef) {
      if (this._writeTimer) { clearTimeout(this._writeTimer); this._writeTimer = null; }
      this._pendingUpdates = null;
      // Use set() for full reset — replaces entire state
      const clean = JSON.parse(JSON.stringify(initial));
      this._dbRef.set(clean).catch(function(err) { console.error('[Store] Firebase reset failed:', err); });
    } else {
      if (this._channel) this._channel.postMessage({ type: 'stateUpdate' });
    }
    this._notifyListeners();
  }
}

const store = new GameStore();
