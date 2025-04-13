// This script is loaded on statically-generated repository pages
// It prevents the automatic API fetch that would normally happen

document.addEventListener('DOMContentLoaded', function() {
  // Override the fetchRepoTree function to prevent API calls on static pages
  window.preventRepoFetch = true;
  
  // Add a meta indicator that this is a pre-generated page (for debugging)
  const meta = document.createElement('meta');
  meta.name = 'static-page';
  meta.content = 'true';
  document.head.appendChild(meta);
}); 