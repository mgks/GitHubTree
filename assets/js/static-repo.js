// This script is loaded on statically-generated repository pages
// It completely prevents API calls to GitHub for static pages

// Execute immediately to block API calls before any other scripts run
(function() {
  // Create a flag to mark this as a static page 
  window.preventRepoFetch = true;
  
  // Override the fetch function to intercept GitHub API calls
  const originalFetch = window.fetch;
  
  window.fetch = function(url, options) {
    // If URL is a string and contains api.github.com, block the request
    if (typeof url === 'string' && url.includes('api.github.com')) {
      console.log("Static page: Blocking GitHub API request to:", url);
      
      // Return a mock successful response to prevent errors
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ mock: true, message: "Static page - API call intercepted" })
      });
    }
    
    // Pass through all other fetch requests
    return originalFetch.apply(this, arguments);
  };
  
  // Signal that this script has loaded by creating a meta tag
  document.addEventListener('DOMContentLoaded', function() {
    const meta = document.createElement('meta');
    meta.name = 'static-page';
    meta.content = 'true';
    document.head.appendChild(meta);
    
    // Also ensure the tree is hidden since we won't be fetching
    setTimeout(function() {
      // Hide loading indicators
      const loadingElement = document.getElementById('loading');
      if (loadingElement) loadingElement.style.display = 'none';
      
      // Hide error container
      const errorElement = document.getElementById('error');
      if (errorElement) errorElement.style.display = 'none';
    }, 100);
  });
})(); 