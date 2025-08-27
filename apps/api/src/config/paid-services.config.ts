import { registerAs } from '@nestjs/config';

export default registerAs('paidServices', () => ({
  scraperapi: {
    apiKey: process.env.SCRAPERAPI_KEY,
    baseUrl: 'https://api.scraperapi.com',
    enabled: process.env.ENABLE_PAID_SCRAPING !== 'false' && !!process.env.SCRAPERAPI_KEY,
    
    // Credit system
    freeMonthlyLimit: 1000, // Free tier limit
    creditsPerRequest: {
      'jobs.bg': 10, // DataDome protected sites
      'default': 1,  // Regular sites
    },
    
    // Request configuration
    timeout: 180000, // 3 minutes for DataDome challenges
    retries: 3,
    
    // Parameters for DataDome bypass
    requestParams: {
      render: true,
      format: 'html',
      country_code: 'bg', // Bulgaria for jobs.bg
      premium: true,      // Use premium proxies
      session_number: 1,  // Maintain session
    }
  },
  
  scrapingdog: {
    apiKey: process.env.SCRAPINGDOG_KEY || '',
    baseUrl: 'https://api.scrapingdog.com',
    enabled: false, // Disabled by default, only as backup
    freeTrialLimit: 1000,
  },
  
  // Credit tracking configuration
  creditTracking: {
    persistToDb: true,
    alertThresholds: {
      warning: 0.8,   // 80% of limit
      critical: 0.95, // 95% of limit
    },
    resetDay: 1, // First day of month
  },
  
  // Retry configuration
  retry: {
    maxAttempts: 3,
    baseDelayMs: 10000,  // 10 seconds
    exponentialBase: 3,   // 10s, 30s, 90s
    jitterMs: 2000,      // Add random 0-2s
  },
  
  // Caching configuration
  cache: {
    successfulResponseTtl: 24 * 60 * 60 * 1000, // 24 hours
    failedResponseTtl: 30 * 60 * 1000,          // 30 minutes
  }
}));