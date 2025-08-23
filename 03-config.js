// 03-config.js — Configuration isolée (pour ne PLUS jamais perdre les valeurs)
// ---------------------------------------------------------------------------
// ⚠️ Renseigne SUPABASE_URL et SUPABASE_ANON_KEY ci-dessous. Ne mets JAMAIS la clé service_role ici.
//    Ces valeurs sont lues par 03-app.js ; aucun autre fichier n’a besoin de les connaître.

window.APP_CONFIG = {
  // Exemple d’URL : https://abcd1234.supabase.co
  SUPABASE_URL: "https://dbrbowweldvxjtvohyvl.supabase.co", // TODO: remplacez par l’URL de votre projet
  SUPABASE_ANON_KEY : "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRicmJvd3dlbGR2eGp0dm9oeXZsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTU4NjgzODAsImV4cCI6MjA3MTQ0NDM4MH0.UhdefKy2kJnk79oDttlyw4GYTTi6T0yfNLVlcBrVaPA",             // TODO: remplacez par votre clé anon


  // Carte (centre/zoom par défaut)
  MAP_CENTER: [50.969, 2.436],
  MAP_ZOOM: 13,
};
