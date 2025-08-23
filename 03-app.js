// 03-app.js — Logique AVANT l'étape 6 (aucune barre d’outils/panneau latéral)
// ---------------------------------------------------------------------------
// Contenu :
//  - initMap()           : Leaflet + fond OSM + zoom custom + échelle
//  - initCoordsPanel()   : affichage lat/lon WGS84 sous la souris
//  - initSearchBAN()     : autocomplétion BAN + recentrage + marqueur
//  - initSupabaseAuth()  : connexion/déconnexion (UI login), sans rien d’autre
//  - bootstrap()         : lance le tout dans l’ordre

(function bootstrap(){
  const cfg = (window.APP_CONFIG || {});

  // ========= 1) Carte Leaflet =========
  function initMap(){
    // Instance Leaflet (zoom natif masqué, on utilise nos boutons custom)
    const map = L.map('map', { zoomControl: false, preferCanvas: true });
    const center = Array.isArray(cfg.MAP_CENTER) ? cfg.MAP_CENTER : [50.969, 2.436];
    const zoom   = Number.isFinite(cfg.MAP_ZOOM) ? cfg.MAP_ZOOM : 13;
    map.setView(center, zoom);

    // Fond OSM
    const osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map);

    // Barre d’échelle (bas droite)
    L.control.scale({ position: 'bottomright', metric: true, imperial: false }).addTo(map);

    // Boutons de zoom custom (droite, centré)
    (function customZoom(){
      const btnIn  = document.getElementById('btn-zoom-in');
      const btnOut = document.getElementById('btn-zoom-out');
      if (!btnIn || !btnOut) { console.warn('[Zoom] Boutons manquants'); return; }
      const upd = ()=>{ const z=map.getZoom(); btnIn.disabled = (z>=map.getMaxZoom()); btnOut.disabled = (z<=map.getMinZoom()); };
      btnIn.addEventListener('click', ()=> map.zoomIn());
      btnOut.addEventListener('click',()=> map.zoomOut());
      const key = (ev,fn)=>{ if (ev.key==='Enter'||ev.key===' '){ ev.preventDefault(); fn(); } };
      btnIn.addEventListener('keydown',  e=> key(e, ()=> map.zoomIn()));
      btnOut.addEventListener('keydown', e=> key(e, ()=> map.zoomOut()));
      map.on('zoomend', upd); upd();
    })();

    // Resize
    window.addEventListener('resize', ()=> map.invalidateSize());

    console.info('[Carte] Leaflet initialisée');
    return { map, osm };
  }

  // ========= 2) Coordonnées =========
  function initCoordsPanel(map){
    const panel = document.getElementById('panel-coords');
    const label = document.getElementById('coords-text');
    if (!panel || !label) { console.warn('[Coordonnées] DOM manquant'); return; }
    const fmt = (n)=> n.toFixed(6);
    const setToCenter = ()=>{ const c=map.getCenter(); label.textContent = `Lat: ${fmt(c.lat)} | Lon: ${fmt(c.lng)} (WGS84)`; };
    setToCenter();
    map.on('mousemove', e=>{ label.textContent = `Lat: ${fmt(e.latlng.lat)} | Lon: ${fmt(e.latlng.lng)} (WGS84)`; });
    map.on('mouseout', setToCenter);
    map.getContainer().addEventListener('mouseleave', setToCenter);
    console.info('[Coordonnées] Actif');
  }

  // ========= 3) Recherche BAN =========
  function initSearchBAN(map){
    const form  = document.getElementById('search-form');
    const input = document.getElementById('search-input');
    const clear = document.getElementById('search-clear');
    const list  = document.getElementById('search-results');
    if (!form || !input || !clear || !list) { console.warn('[BAN] DOM manquant'); return; }

    let geocodeMarker = null, lastFeatures = [], selectedIndex = -1, currentAbort = null;
    const BAN_URL = 'https://api-adresse.data.gouv.fr/search/?limit=8&q=';
    const fmt = (s)=> String(s||'').trim();
    const debounce = (fn, delay=250)=>{ let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a), delay); }; };

    const setResultsVisible = (show)=>{ list.classList.toggle('show', !!show); input.setAttribute('aria-expanded', show?'true':'false'); };
    const clearResults = ()=>{ list.innerHTML=''; lastFeatures=[]; selectedIndex=-1; setResultsVisible(false); };
    const renderResults = (features)=>{
      list.innerHTML=''; lastFeatures = features||[]; selectedIndex=-1;
      if (!lastFeatures.length) return setResultsVisible(false);
      lastFeatures.forEach((f,idx)=>{ const li=document.createElement('li'); li.setAttribute('role','option'); li.id=`addr-opt-${idx}`; li.textContent=(f.properties&&f.properties.label)||'Adresse'; li.addEventListener('click',()=> selectFeatureIdx(idx)); list.appendChild(li); });
      setResultsVisible(true);
    };
    const fitOrCenter = (feat)=>{
      const bbox = feat && (feat.bbox || (feat.properties && feat.properties.bbox));
      if (bbox && Array.isArray(bbox) && bbox.length===4){ const sw=[bbox[1],bbox[0]], ne=[bbox[3],bbox[2]]; map.fitBounds([sw,ne], { maxZoom: 18, padding: [20,20] }); return; }
      const [lon,lat] = feat.geometry&&feat.geometry.coordinates ? feat.geometry.coordinates : [2.436,50.969];
      const type = (feat.properties&&feat.properties.type)||'street'; const zByType={housenumber:18,street:16,locality:15,municipality:13}; map.setView([lat,lon], zByType[type]||16);
    };
    const putMarker = (feat)=>{
      const [lon,lat] = feat.geometry&&feat.geometry.coordinates ? feat.geometry.coordinates : [2.436,50.969];
      const latlng=[lat,lon];
      if (geocodeMarker) geocodeMarker.setLatLng(latlng); else { geocodeMarker = L.marker(latlng,{draggable:false}).addTo(map); }
    };
    const selectFeatureIdx = (idx)=>{ const f=lastFeatures[idx]; if(!f) return; input.value=(f.properties&&f.properties.label)||input.value; putMarker(f); fitOrCenter(f); clearResults(); };
    const doSearch = async (q)=>{
      const query = fmt(q); if (!query || query.length<3) return clearResults();
      try { if (currentAbort) currentAbort.abort(); currentAbort = new AbortController(); const resp = await fetch(BAN_URL+encodeURIComponent(query), { signal: currentAbort.signal }); if (!resp.ok) throw new Error('HTTP '+resp.status); const json = await resp.json(); renderResults((json&&json.features)||[]); }
      catch(err){ console.warn('[BAN] Erreur', err); }
    };
    const debouncedSearch = debounce(doSearch, 250);

    input.addEventListener('input', e=> debouncedSearch(e.target.value));
    input.addEventListener('keydown', (e)=>{
      if (!lastFeatures.length) return; if (e.key==='ArrowDown'){ e.preventDefault(); selectedIndex=Math.min(lastFeatures.length-1, selectedIndex+1); }
      else if (e.key==='ArrowUp'){ e.preventDefault(); selectedIndex=Math.max(0, selectedIndex-1); }
      else if (e.key==='Enter'){ e.preventDefault(); selectFeatureIdx(selectedIndex>=0?selectedIndex:0); return; }
      else if (e.key==='Escape'){ clearResults(); return; } else { return; }
      Array.from(list.children).forEach((li,i)=>{ if(i===selectedIndex){ li.setAttribute('aria-selected','true'); li.scrollIntoView({block:'nearest'}); } else { li.removeAttribute('aria-selected'); } });
    });
    form.addEventListener('submit', e=>{ e.preventDefault(); if (lastFeatures.length) selectFeatureIdx(0); else doSearch(input.value); });
    clear.addEventListener('click', ()=>{ input.value=''; clearResults(); input.focus(); });
    document.addEventListener('click', (e)=>{ if (!form.contains(e.target)) clearResults(); });

    console.info('[BAN] Initialisée');
  }

  // ========= 4) Auth Supabase =========
// --- NOUVELLE VERSION ROBUSTE ---
function initSupabaseAuth(){
  // ❗️Mode robuste : on ne bloque plus entièrement le formulaire si la config est absente.
  // On affiche un message clair et on désactive *seulement* le bouton de connexion.
  
  const hasSupabaseLib = !!(window.supabase && window.supabase.createClient);
  const cfg = (window.APP_CONFIG || {});

  const panel     = document.getElementById('panel-login');
  const form      = document.getElementById('login-form');
  const emailIn   = document.getElementById('login-email');
  const passIn    = document.getElementById('login-password');
  const btnLogin  = document.getElementById('btn-login');
  const btnLogout = document.getElementById('btn-logout');
  const errBox    = document.getElementById('login-error');
  const statusBox = document.getElementById('login-status');
  

  const setButtonsDisabled = (d)=>{ if(btnLogin) btnLogin.disabled=!!d; if(btnLogout) btnLogout.disabled=!!d; };
  const showError  = (msg)=>{ if(!errBox) return; errBox.style.display='block'; errBox.textContent=msg||'Erreur.'; };
  const clearError = ()=>{ if(!errBox) return; errBox.style.display='none'; errBox.textContent=''; };
  const setStatus  = (msg)=>{ if(statusBox) statusBox.textContent = msg; };
  //rajout d'une ligne pour action des boutons de fonctionnalité selon authentification
  const appRoot = document.getElementById('app');
  if (appRoot) appRoot.classList.remove('auth-on'); // masqué par défaut au chargement
  //rajout d'une ligne pour action des boutons de fonctionnalité selon authentification

  // 1) Librairie Supabase chargée ?
  if (!hasSupabaseLib){
    setButtonsDisabled(true); // on laisse les champs éditables, mais on empêche la soumission
    setStatus('⚠️ Librairie Supabase non chargée (réseau/CDN).');
    if (form) form.addEventListener('submit', (e)=>{ e.preventDefault(); showError('Supabase JS introuvable — vérifiez votre connexion internet / CDN.'); });
    console.warn('[Auth] Librairie Supabase non chargée.');
    return;
  }

  // 2) Configuration présente ? (on ne teste plus la longueur de la clé : juste non-vide)
  const SUPABASE_URL = String(cfg.SUPABASE_URL || '');
  const SUPABASE_ANON_KEY = String(cfg.SUPABASE_ANON_KEY || '');
  const isConfigured = (
    SUPABASE_URL.startsWith('https://') && SUPABASE_URL.includes('.supabase.co') && SUPABASE_ANON_KEY.trim().length > 0
  );

  if (!isConfigured){
    setButtonsDisabled(true); // pas de login possible mais champs éditables
    setStatus('⚠️ Supabase non configuré. Renseignez 03-config.js (URL + clé anon).');
    if (form) form.addEventListener('submit', (e)=>{ e.preventDefault(); showError('Configuration Supabase manquante — complétez 03-config.js.'); });
    console.warn('[Auth] APP_CONFIG absent ou incomplet.', window.APP_CONFIG);
    return;
  }

  // 3) Client Supabase
  const { createClient } = supabase;
//rajout de cette partie pour forcer l'appel au bon schema dans le base de données
 const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
   db: { schema: 'projet_carto_amelie' }   // <<< important : Accept-Profile = projet_carto_amelie
 });
//rajout de cette partie pour forcer l'appel au bon schema dans le base de données

  const updateUI = (user)=>{
    const logged = !!(user && user.email);
	
	// Affiche/masque la barre d’outils en fonction de l’authentification
	if (appRoot){
		if (logged) appRoot.classList.add('auth-on');
		else appRoot.classList.remove('auth-on');
	}
	//chargement des données quand l'utilisateur est connecté
	// [DATA HOOK] chargement/vidage des couches (branche les cases à cocher aux données)
	if (logged) {
	// L’utilisateur vient d’être (ou est) connecté → on charge tout
		loadAllFromSupabase().catch(err => console.warn('[loadAll]', err));
	} else {
	// Déconnecté → on vide proprement la carte
	clearAllLayers();
	}
	//chargement des données quand l'utilisateur est connecté
	// Affiche/masque la barre d’outils en fonction de l’authentification
    if (logged){
      if(btnLogout) btnLogout.style.display='inline-block';
      if(btnLogin)  btnLogin.style.display='none';
      if(panel) panel.classList.add('is-auth');
      setStatus('Vous êtes connecté');
      clearError();

    } else {
      if(btnLogout) btnLogout.style.display='none';
      if(btnLogin)  btnLogin.style.display='inline-block';
      if(panel) panel.classList.remove('is-auth');
      setStatus('Connectez vous pour accéder aux données');
//rajout ppur vider la carte lors de la déconnxion et faire en sorte que les couches ne soient plus visibles
	  clearAllLayers();                                // vide tout immédiatement
      document.getElementById('app')?.classList.remove('auth-on');  // cache la toolbar
      document.getElementById('sidepanel')?.classList.remove('show'); // ferme le panneau
//rajout ppur vider la carte lors de la déconnxion et faire en sorte que les couches ne soient plus visibles
    }
  };

  // 4) Session initiale + écoute
  sb.auth.getSession().then(({ data:{ session } })=> updateUI(session && session.user ? session.user : null));
//modification du code pour nettoyer la carte lors de la déconnexion
  sb.auth.onAuthStateChange((_event, session)=>{
  const user = session?.user || null;
  updateUI(user);                          // met à jour l’UI (boutons/panneau, etc.)
  if (!user){
    clearAllLayers();                      // vide toutes les couches immédiatement
    document.getElementById('sidepanel')?.classList.remove('show'); // ferme le panneau
    document.getElementById('app')?.classList.remove('auth-on');    // cache la toolbar
    }
  });

//modification du code pour nettoyer la carte lors de la déconnexion
  // 5) Soumission du formulaire
  if (form){
    form.addEventListener('submit', async (e)=>{
      e.preventDefault(); clearError(); setButtonsDisabled(true);
      try {
        const email=(emailIn&&emailIn.value||'').trim();
        const password=(passIn&&passIn.value||'');
        if(!email||!password){ setButtonsDisabled(false); return showError('Veuillez renseigner email et mot de passe.'); }
        const { error } = await sb.auth.signInWithPassword({ email, password });
        if (error) throw error; // l’UI sera mise à jour par onAuthStateChange
      } catch(err){
        console.warn('[Auth] Échec de connexion', err);
        showError('Identifiants inconnus ou non autorisé.');
      } finally {
        setButtonsDisabled(false);
      }
    });
  }

  // 6) Déconnexion
  if (btnLogout){ btnLogout.addEventListener('click', async ()=>{ try { await sb.auth.signOut(); } catch(err){ console.warn('[Auth] Échec déconnexion', err); } }); }
//rajout pour nettoyer la carte après la déconnexion
btnLogout.addEventListener('click', async ()=>{
  const { error } = await sb.auth.signOut();
  if (error){ setError(error.message); return; }
  clearAllLayers();                               // enlève toutes les couches sans rechargement
});
//rajout pour nettoyer la carte après la déconnexion


  // 7) Expose client (futures étapes)
  window.__APP__ = Object.assign(window.__APP__||{}, { sb });
  console.info('[Auth] Supabase initialisée');
}

//initialisation du bouton gestionnaire de couches
function initLayersButton(){
  const btn    = document.getElementById('tool-layers');
  const panel  = document.getElementById('sidepanel');
  const close  = document.getElementById('panel-close');
  const toolbar= document.getElementById('toolbar-left');

  if (!btn || !panel) { console.warn('[Étape 6] UI layers manquante'); return; }
//rajout pour peuplement du gestionnaire de couche
  const open = ()=>{
   renderLayerManager(); // Remplit le panneau à chaque ouverture
   panel.classList.add('show');
   panel.setAttribute('aria-hidden','false');
   btn.setAttribute('aria-pressed','true');
  };
//rajout pour peuplement du gestionnaire de couche
  const closeP = ()=>{
    panel.classList.remove('show');
    panel.setAttribute('aria-hidden','true');
    btn.setAttribute('aria-pressed','false');
  };

  btn.addEventListener('click', ()=>{
    const isOpen = panel.classList.contains('show') && btn.getAttribute('aria-pressed')==='true';
    if (isOpen) closeP(); else open();
  });

  if (close) close.addEventListener('click', closeP);

  document.addEventListener('click', (e)=>{
    if (panel.classList.contains('show') && !panel.contains(e.target) && !toolbar.contains(e.target)) {
      closeP();
    }
  });
}
//initialisation du bouton gestionnaire de couches
//charger vider les couches depuis la base de données
// Helpers de style
function triangleIcon(fill = '#000', stroke = 'none', strokeWidth = 3){
  const svg = `
  <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M12 4 L20 20 L4 20 Z"
      fill="${fill}"
      stroke="${stroke}"
      stroke-width="${stroke === 'none' ? 0 : strokeWidth}"/>
  </svg>`;
  return L.divIcon({ html: svg, className: 'triangle-ic', iconSize: [24,24], iconAnchor: [12,20] });
}

//modification de la fonction triangleIcon pour prendre en compte le comportement beneficiaire/intervenants

//modification de la fonction toggleLayerVisibility pour prendre en compte l'affichage des entités de chaque couche dans le gstionnaire de couche
function toggleLayerVisibility(key, visible){
  const app = window.__APP__ || {};
  app.STATE.master[key] = !!visible;
  applyVisibility(key);
}
// Applique la visibilité réelle sur la carte en tenant compte des cases enfants
function applyVisibility(key){
  const { map, LAYERS, ENTITIES, STATE } = window.__APP__ || {};
  if (!map) return;

  if (key === 'beneficiaires'){          // cas simple : pas de sous-liste
    if (STATE.master.beneficiaires) LAYERS.beneficiaires.addTo(map);
    else map.removeLayer(LAYERS.beneficiaires);
    return;
  }

  const on = STATE.master[key];
//modification de cette partie pour prendre en compte les problème d'affichage de sdonnées lors de la gestion individuelle des entités dans le gestionnaire de couche

  const reg = ENTITIES[key]; if (!reg) return;
  reg.forEach((rec, id)=>{
    const childOn = STATE.entities[key][id];
    const show = on && (childOn !== false); // défaut = true
    if (show) rec.layer.addTo(map); else map.removeLayer(rec.layer);
  });
//modification de cette partie pour prendre en compte les problème d'affichage de sdonnées lors de la gestion individuelle des entités dans le gestionnaire de couche

}

//modification de la fonction toggleLayerVisibility pour prendre en compte l'affichage des entités de chaque couche dans le gstionnaire de couche
// Remet l’interface à blanc quand on se déconnecte
function clearAllLayers(){
  const app = window.__APP__ || {};
  const { map, LAYERS, ENTITIES, STATE } = app;
  if (!map) return;

  // 1) Bénéficiaires (group simple)
  if (LAYERS?.beneficiaires) LAYERS.beneficiaires.clearLayers();

  // 2) Groupes “par entité” (intervenants, secteurs…)
  ['intervenants','secteurs_intervenant','secteurs_equipe'].forEach(k=>{
    const reg = ENTITIES?.[k];
    if (reg && typeof reg.forEach === 'function'){
      reg.forEach(rec => { if (rec?.layer) map.removeLayer(rec.layer); });
      app.ENTITIES[k] = new Map();     // repart propre
    }
    if (STATE?.entities?.[k]) STATE.entities[k] = {};
  });

  // 3) Couper les masters (sinon un re-render peut les rallumer)
  if (STATE?.master){
    STATE.master.beneficiaires = false;
    STATE.master.intervenants = false;
    STATE.master.secteurs_intervenant = false;
    STATE.master.secteurs_equipe = false;
  }

  // 4) UI : fermer le panneau si ouvert
  document.getElementById('sidepanel')?.classList.remove('show');
}

// === CHARGEMENTS ===
// NOTE : ces fonctions lisent des *vues GeoJSON* (voir SQL optionnel ci-dessous).
async function loadBeneficiaires(){
  const sb = window.__APP__?.sb; if (!sb) return;
//modification de cette partie pour prendre en compte la couleur de l'intervenant
    const { data, error } = await sb.from('vw_beneficiaires_geo')
      .select('id_beneficiaire, adresse, geojson, n_intervenants, couleur1, couleur2');  
//modification de cette partie pour prendre en compte la couleur de l'intervenant
  if (error) { console.warn('[beneficiaires]', error); return; }
  const grp = window.__APP__.LAYERS.beneficiaires; grp.clearLayers();
  (data || []).forEach(row => {
    const g = row.geojson; if (!g || g.type !== 'Point') return;
    const latlng = [g.coordinates[1], g.coordinates[0]];
//rajout pour les règles de style
   // Règles de style demandées
     let fill = row.couleur1 || '#777';
     let stroke = (row.couleur2 || 'none');
     if ((row.n_intervenants || 0) > 2) { fill = '#000'; stroke = '#000'; }
//rajout pour les règles de style
//modification pour prendre en compte les triangle pour les bénéficiaires
    const m = L.marker(latlng, {
      icon: triangleIcon(fill, stroke, 3) // contour "none" si pas de 2e intervenant
    }).bindPopup(
      `<b>Bénéficiaire</b><br>${row.id_beneficiaire}<br>${row.adresse||''}`
    );	
//modification pour prendre en compte les triangle pour les bénéficiaires
    grp.addLayer(m);
  });
}

async function loadIntervenants(){
  const sb = window.__APP__?.sb; if (!sb) return;
// recuperation de la donnée de la vue
  const { data, error } = await sb.from('vw_intervenants_geo')
                                  .select('id_intervenant, couleur, id_equipe, geojson');
  if (error) { console.warn('[intervenants]', error); return; }
//modification de cette partie pour charger les intervenants en sous groupe pour les afficher individuellemnt dans le gestionnaire de couche
  const app = window.__APP__;
  const prevState = { ...(app.STATE.entities.intervenants || {}) };
  // Retirer les anciens sous-groupes de la carte
  app.ENTITIES.intervenants.forEach(rec => {
    if (rec?.layer && app.map) app.map.removeLayer(rec.layer);
  });
  app.ENTITIES.intervenants = new Map();
 //remplissage par entité
  (data || []).forEach(row => {
    const g = row.geojson; if (!g || g.type !== 'Point') return;
    const id = row.id_intervenant;
//creation d'un record si absent
    let rec = app.ENTITIES.intervenants.get(id);
    if (!rec){
      rec = { layer: L.featureGroup(), couleur: row.couleur, label: id };
      app.ENTITIES.intervenants.set(id, rec);
      // Par défaut visible ; on restaure l’ancien état (coché) si existait
      if (prevState[id] === false) app.STATE.entities.intervenants[id] = false;
    }
    const latlng = [g.coordinates[1], g.coordinates[0]];
    rec.layer.addLayer(
	  L.circleMarker(latlng, {
        radius: 7,
		stroke: false,
		fillColor: row.couleur || '#666',
		fillOpacity: 1
    }).bindPopup(`<b>Intervenant</b><br>${id}`));
  });
//applique la visibilité 
  applyVisibility('intervenants');
//modification de cette partie pour charger les intervenants en sous groupe pour les afficher individuellemnt dans le gestionnaire de couche
//ajout de cette partie pour relancer le rendu quand un loader se termine
if (document.getElementById('sidepanel')?.classList.contains('show')) {
  renderLayerManager();  // rafraîchit la sous-liste visible
}
//ajout de cette partie pour relancer le rendu quand un loader se termine
}

async function loadSecteursIntervenant(){
  const sb = window.__APP__?.sb; if (!sb) return;
//modification de cette partie pour prendre en compte les couleurs des intervenants
  const { data, error } = await sb.from('vw_secteur_intervenant_geo')
    .select('id_intervenant, couleur, geojson');
//modification de cette partie pour prendre en compte les couleurs des intervenants
  if (error) { console.warn('[secteurs_intervenant]', error); return; }
//modification de cette partie pour prendre en compte la gestion individuel des secteur dans le gestionnaire de couche

  const app = window.__APP__;
  const prevState = { ...(app.STATE.entities.secteurs_intervenant || {}) };
//netttoyage des anciens groupes
  app.ENTITIES.secteurs_intervenant.forEach(rec => {
    if (rec?.layer && app.map) app.map.removeLayer(rec.layer);
  });  
  app.ENTITIES.secteurs_intervenant = new Map();
//remplissage par intervenant  
  (data || []).forEach(row => {
    const id = row.id_intervenant;
    const gj = row.geojson; if (!gj) return;
    const lyr = L.geoJSON(gj, {
      style: { stroke: false, fill: true, fillColor: row.couleur || '#888', fillOpacity: 0.30 }
    }).bindPopup(`<b>Secteur intervenant</b><br>${id}`);
    app.ENTITIES.secteurs_intervenant.set(id, { layer: lyr, couleur: row.couleur, label: id });
    if (prevState[id] === false) app.STATE.entities.secteurs_intervenant[id] = false;
  });
  
  applyVisibility('secteurs_intervenant');
//modification de cette partie pour prendre en compte la gestion individuel des secteur dans le gestionnaire de couche
//ajout de cette partie pour relancer le rendu quand un loader se termine
if (document.getElementById('sidepanel')?.classList.contains('show')) {
  renderLayerManager();  // rafraîchit la sous-liste visible
}
//ajout de cette partie pour relancer le rendu quand un loader se termine
}

async function loadSecteursEquipe(){
  const sb = window.__APP__?.sb; if (!sb) return;
//modification de cette partie pour prendre en compte les couleurs
  const { data, error } = await sb.from('vw_secteur_equipe_geo')
    .select('id_equipe, nom_equipe, couleur, geojson');
//modification de cette partie pour prendre en compte les couleurs
  if (error) { console.warn('[secteurs_equipe]', error); return; }
//modification de cette partie pour prendre en compte la gestion individuel des entités dans le gestionnaire de couche
   const app = window.__APP__;
   const prevState = { ...(app.STATE.entities.secteurs_equipe || {}) };
//nettoyage des anciens groupes
   app.ENTITIES.secteurs_equipe.forEach(rec => {
    if (rec?.layer && app.map) app.map.removeLayer(rec.layer);
  });
   app.ENTITIES.secteurs_equipe = new Map();
//remplissage par equipe  
   (data || []).forEach(row => {
     const id = row.id_equipe;
     const gj = row.geojson; if (!gj) return;
     const lyr = L.geoJSON(gj, {
       style: { fill: false, color: row.couleur || '#ff22cc', weight: 5, opacity: 1 }
     }).bindPopup(`<b>${row.nom_equipe || 'Équipe'}</b>`);
     app.ENTITIES.secteurs_equipe.set(id, { layer: lyr, couleur: row.couleur, label: row.nom_equipe || `Équipe ${id}` });
     if (prevState[id] === false) app.STATE.entities.secteurs_equipe[id] = false;
   });
  
   applyVisibility('secteurs_equipe');
//modification de cette partie pour prendre en compte la gestion individuel des entités dans le gestionnaire de couche
//ajout de cette partie pour relancer le rendu quand un loader se termine
if (document.getElementById('sidepanel')?.classList.contains('show')) {
  renderLayerManager();  // rafraîchit la sous-liste visible
}
//ajout de cette partie pour relancer le rendu quand un loader se termine
}
//rajout pour éviter que les couches restent afficher après la déconnexion
function setMastersOn(on = true){
  const m = window.__APP__?.STATE?.master; 
  if (!m) return;
  m.beneficiaires = m.intervenants = m.secteurs_intervenant = m.secteurs_equipe = !!on;
}
//rajout pour éviter que les couches restent afficher après la déconnexion

async function loadAllFromSupabase(){
  setMastersOn(true); // réautorise l’affichage des groupes après connexion
  await Promise.all([
    loadBeneficiaires(),
    loadIntervenants(),
    loadSecteursIntervenant(),
    loadSecteursEquipe()
  ]);
}
//charger vider les couches depuis la base de données
// Rendu du panneau "Gestionnaire de couches" (UI seule) => fonction renderLayerManager
function renderLayerManager(){
  const body  = document.getElementById('sidepanel-body');
  const title = document.getElementById('sidepanel-title');
  if (!body) { console.warn('[layers] #sidepanel-body introuvable'); return; }

  if (title) title.textContent = 'liste des couches';
  body.innerHTML = '';

  const ul = document.createElement('ul');
  ul.className = 'layer-list';

  // ⚠️ ORDRE EXACT DEMANDÉ
  const items = [
    { key:'beneficiaires',        label:'Bénéficiaires',        icon:'circle',     checked:true },
    { key:'intervenants',         label:'Intervenants',         icon:'triangle',   checked:true },
    { key:'secteurs_intervenant', label:'Secteurs intervenants',icon:'poly-blue',  checked:true },
    { key:'secteurs_equipe',      label:'Secteurs équipes',     icon:'poly-magenta',checked:true }
  ];

  items.forEach(({key,label,icon,checked})=>{
//modification de cette partie pour prendre en compte la gestion individuelle des entités dans le gestionnaire de couche
	const li  = document.createElement('li'); li.className='layer-item'; li.dataset.layerKey = key;
//modification de cette partie pour prendre en compte la gestion individuelle des entités dans le gestionnaire de couche
//rajout pour gérer le fait de déplier ou replier un élément de légende
// Ajout du twisty pour les couches qui ont une sous-liste
    const collapsible = (key === 'intervenants' || key === 'secteurs_intervenant' || key === 'secteurs_equipe');
    let twisty = null;
    if (collapsible){
      twisty = document.createElement('button');
      twisty.type = 'button';
      twisty.className = 'twisty';
      twisty.setAttribute('aria-expanded','true'); // ouvert par défaut
      twisty.title = 'Replier/déplier';
      twisty.addEventListener('click', ()=>{
        li.classList.toggle('collapsed');
        const expanded = !li.classList.contains('collapsed');
        twisty.setAttribute('aria-expanded', String(expanded));
      });
      li.appendChild(twisty); // la flèche se place AVANT la case à cocher
    }
//rajout pour gérer le fait de déplier ou replier un élément de légende
    const chk = document.createElement('input');
    chk.type = 'checkbox';
    chk.id   = `layer-${key}`;
    chk.checked = !!checked;
    chk.dataset.layerKey = key;

    const swatch = document.createElement('span');
    swatch.className =
      icon==='circle'      ? 'legend-swatch legend-circle'   :
      icon==='triangle'    ? 'legend-triangle'               :
      icon==='poly-blue'   ? 'legend-poly-blue'              :
      icon==='poly-magenta'? 'legend-poly-magenta'           :
                             'legend-swatch';

    const lab = document.createElement('label');
    lab.setAttribute('for', chk.id);
    lab.textContent = ' ' + label;

    li.append(chk, swatch, lab);
    ul.appendChild(li);

    // Placeholder : on branchera l’affichage Leaflet à l’étape suivante
	//branchement des données aux différents layers du gestionnaire de couche
	chk.addEventListener('change', (e)=>{
      toggleLayerVisibility(key, e.target.checked);
    });
	//branchement des données aux différents layers du gestionnaire de couche
  });

  body.appendChild(ul);
// ajout de l'appel des sous listes pour la gestion individuelle des entités dans le gestionnaire de couche
  ['intervenants','secteurs_intervenant','secteurs_equipe'].forEach((k)=>{
    // NOTE: on cible DANS la liste qu’on vient de créer (plus robuste qu’un querySelector global)
    const host = ul.querySelector(`li.layer-item[data-layer-key="${k}"]`);
    if (host) renderLayerSublist(k, host);
  });
// ajout de l'appel des sous listes pour la gestion individuelle des entités dans le gestionnaire de couche
  
}
//ajout de ce helper pour la gestion individuelle des entités dans le gestionnaire de couche
function renderLayerSublist(key, hostLi){
  const app = window.__APP__;
  const entries = app?.ENTITIES?.[key];
  if (!entries || !hostLi) return;

  const ul = document.createElement('ul');
  ul.className = 'layer-sublist';

  entries.forEach((info, id) => {
    const li = document.createElement('li'); li.className = 'layer-subitem';

    const chk = document.createElement('input');
    chk.type = 'checkbox';
    chk.id = `layer-${key}-${id}`;
    const cur = app.STATE.entities[key][id];
    chk.checked = (cur !== false); // défaut = true

    const sw = document.createElement('span');
    if (key === 'intervenants') {
  // ⬅️ Cercle plein (taille fournie par .legend-swatch)
      sw.className = 'legend-swatch legend-circle';
      sw.style.background = info.couleur || '#666';
    }
    else if (key === 'secteurs_intervenant') {
  // ⬅️ Aplat couleur
      sw.className = 'legend-swatch legend-poly-fill';
      sw.style.background = info.couleur || '#888';
    }
    else if (key === 'secteurs_equipe') {
  // ⬅️ Contour couleur
      sw.className = 'legend-swatch legend-poly-stroke';
      sw.style.borderColor = info.couleur || '#ff22cc';
    }

    const lab = document.createElement('label');
    lab.setAttribute('for', chk.id);
    lab.textContent = ' ' + (info.label || id);

    chk.addEventListener('change', (e)=>{
      app.STATE.entities[key][id] = e.target.checked;
      applyVisibility(key);
    });

    li.append(chk, sw, lab);
    ul.appendChild(li);
  });

  hostLi.appendChild(ul);
}
//ajout de ce helper pour la gestion individuelle des entités dans le gestionnaire de couche


// ========= Lancer (différé quand le DOM est prêt) =========
function initAppOnce(){
  if (initAppOnce._done) return;         // anti double-initialisation
  initAppOnce._done = true;

  try{
    const { map } = initMap();

    // expose la carte
    window.__APP__ = Object.assign(window.__APP__ || {}, { map });

    // crée les 4 groupes (vides au départ)
    (function initDataLayers(){
      const { map } = window.__APP__ || {};
      if (!map) return;
      const LAYERS = {
        beneficiaires:        L.layerGroup().addTo(map),
        intervenants:         L.layerGroup().addTo(map),
        secteurs_intervenant: L.layerGroup().addTo(map),
        secteurs_equipe:      L.layerGroup().addTo(map),
      };
      window.__APP__.LAYERS = LAYERS;
    })();

    // REGISTRES & ÉTAT (si pas déjà posés plus haut)
    window.__APP__.ENTITIES = window.__APP__.ENTITIES || {
      intervenants: new Map(),
      secteurs_intervenant: new Map(),
      secteurs_equipe: new Map(),
    };
    window.__APP__.STATE = window.__APP__.STATE || {
      master: { beneficiaires:true, intervenants:true, secteurs_intervenant:true, secteurs_equipe:true },
      entities: { intervenants:{}, secteurs_intervenant:{}, secteurs_equipe:{} }
    };

    // init UI / features
    initCoordsPanel(map);
    initSearchBAN(map);
    initSupabaseAuth();
    initLayersButton();
  }catch(err){
    console.error('[initApp] échec d’initialisation', err);
    document.getElementById('login-status')?.replaceChildren(
      document.createTextNode('Erreur d’initialisation — détails dans la console.')
    );
  }
}

// Appel après chargement du DOM
if (document.readyState === 'loading'){
  document.addEventListener('DOMContentLoaded', initAppOnce);
} else {
  initAppOnce();
}
})();
