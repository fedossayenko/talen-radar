import { registerAs } from '@nestjs/config';

export default registerAs('scraper', () => ({
  // Global scraper settings
  enabled: process.env.SCRAPER_ENABLED !== 'false',
  enabledSites: process.env.SCRAPER_ENABLED_SITES ? 
    process.env.SCRAPER_ENABLED_SITES.split(',') : ['dev.bg', 'jobs.bg'],
  
  // Enhanced browser configuration for DataDome bypass
  browser: {
    headless: process.env.SCRAPER_BROWSER_HEADLESS !== 'false',
    loadImages: process.env.SCRAPER_BROWSER_LOAD_IMAGES === 'true',
    stealth: process.env.SCRAPER_BROWSER_STEALTH !== 'false',
    // DataDome-specific browser settings
    dataDomeBypass: {
      enabled: true,
      useRealisticUserAgent: true,
      simulateHumanTiming: true,
      randomizeFingerprint: true,
      enableJavaScript: true,
      enableCookies: true,
      respectCacheHeaders: true,
    },
  },
  
  // Session management
  sessionDir: process.env.SCRAPER_SESSION_DIR || './scraper-sessions',

  // Site-specific configurations
  sites: {
    devBg: {
      enabled: process.env.DEV_BG_ENABLED !== 'false',
      baseUrl: process.env.DEV_BG_BASE_URL || 'https://dev.bg',
      apiUrl: process.env.DEV_BG_API_URL || 'https://dev.bg/company/jobs/java/',
      requestTimeout: parseInt(process.env.DEV_BG_REQUEST_TIMEOUT || '30000', 10),
      requestDelay: parseInt(process.env.DEV_BG_REQUEST_DELAY || '2000', 10),
      maxPages: parseInt(process.env.DEV_BG_MAX_PAGES || '10', 10),
      maxRetries: parseInt(process.env.DEV_BG_MAX_RETRIES || '3', 10),
      userAgent: process.env.DEV_BG_USER_AGENT || 'TalentRadar/1.0 (Job Aggregator)',
    },
    
    jobsBg: {
      enabled: process.env.JOBS_BG_ENABLED !== 'false',
      baseUrl: process.env.JOBS_BG_BASE_URL || 'https://www.jobs.bg',
      searchUrl: process.env.JOBS_BG_SEARCH_URL || 'https://www.jobs.bg/en/front_job_search.php',
      requestTimeout: parseInt(process.env.JOBS_BG_REQUEST_TIMEOUT || '45000', 10), // Increased for complex JS sites
      requestDelay: parseInt(process.env.JOBS_BG_REQUEST_DELAY || '4000', 10), // Increased for DataDome bypass
      maxPages: parseInt(process.env.JOBS_BG_MAX_PAGES || '5', 10), // Reduced to avoid detection
      maxRetries: parseInt(process.env.JOBS_BG_MAX_RETRIES || '2', 10), // Reduced to avoid spam detection
      userAgent: process.env.JOBS_BG_USER_AGENT || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
      useHttpFallback: false, // Always use browser for DataDome sites
      // DataDome-specific bypass configuration
      dataDomeBypass: {
        enabled: true,
        minSessionDuration: 30000, // Keep session alive for at least 30s
        maxRequestsPerSession: 5,   // Limit requests per session
        userBehaviorSimulation: {
          mouseMovements: true,
          randomScrolling: true,
          readingPauses: true,
          humanTyping: true,
        },
        browserFingerprint: {
          spoofWebGL: true,
          spoofCanvas: true,
          spoofWebRTC: true,
          randomizeViewport: true,
          realisticPlugins: true,
        },
      },
      // Enhanced stealth configuration for DataDome
      stealth: {
        enabled: true,
        hideWebdriver: true,
        spoofUserAgent: true,
        spoofWebGL: true,
        spoofCanvas: true,
        spoofPlugins: true,
        spoofLanguages: true,
        spoofGeolocation: true,
        spoofTimezone: true,
        randomizeViewport: true,
        realisticTiming: true,
        addMouseMovements: true,
        simulateHumanBehavior: true,
        fingerprintRotation: true,
        behaviorSimulation: true,
        warmupNavigation: 0.3,  // 30% chance
        sessionDuration: 45000,  // 45 seconds min
        requestsPerSession: 4,
      },
      // Human-like timing configuration
      timing: {
        betweenRequests: [4000, 10000],  // 4-10 seconds random
        scrollDelay: [1000, 3000],       // 1-3 seconds
        readingTime: [2000, 7000],       // 2-7 seconds
        mouseMovement: [500, 1500],      // 0.5-1.5 seconds
        navigationDelay: [2000, 5000],   // 2-5 seconds
      },
      // Conservative evasion settings
      evasion: {
        minDelay: 3000,
        maxDelay: 8000,
        scrollPage: true,
        mouseMovements: true,
        maxSessionRequests: 5,     // Very conservative
        sessionRotationInterval: 10, // Rotate frequently
        respectRobotsTxt: true,
        conservativeMode: true,
      },
    },
  },

  // Duplicate detection settings
  duplicateDetection: {
    enabled: process.env.DUPLICATE_DETECTION_ENABLED !== 'false',
    fuzzyMatchThreshold: parseFloat(process.env.FUZZY_MATCH_THRESHOLD || '0.8'),
    exactMatchThreshold: parseFloat(process.env.EXACT_MATCH_THRESHOLD || '0.95'),
    companyMatchThreshold: parseFloat(process.env.COMPANY_MATCH_THRESHOLD || '0.8'),
    enableCrossSiteDeduplication: process.env.CROSS_SITE_DEDUPLICATION !== 'false',
  },
  // Technology detection patterns - can be extended via environment variables
  techPatterns: {
    // Core patterns are handled by TechPatternService
    // Additional custom patterns can be added here
    customPatterns: process.env.CUSTOM_TECH_PATTERNS ? 
      JSON.parse(process.env.CUSTOM_TECH_PATTERNS) : {},
  },
  // Translation mappings - for extending built-in translations
  translations: {
    // Core translations are handled by TranslationService  
    // Additional translations can be added here
    customTranslations: process.env.CUSTOM_TRANSLATIONS ?
      JSON.parse(process.env.CUSTOM_TRANSLATIONS) : {},
  },
  // Rate limiting and performance settings
  performance: {
    maxConcurrentRequests: parseInt(process.env.SCRAPER_MAX_CONCURRENT || '5', 10),
    retryAttempts: parseInt(process.env.SCRAPER_RETRY_ATTEMPTS || '3', 10),
    retryDelay: parseInt(process.env.SCRAPER_RETRY_DELAY || '1000', 10),
    cacheTtl: parseInt(process.env.SCRAPER_CACHE_TTL || '3600', 10), // 1 hour
  },
  // Job processing settings
  jobProcessing: {
    batchSize: parseInt(process.env.SCRAPER_BATCH_SIZE || '50', 10),
    maxVacancies: parseInt(process.env.SCRAPER_MAX_VACANCIES || '0', 10), // 0 means no limit
    includeJobDetails: process.env.SCRAPER_INCLUDE_DETAILS !== 'false',
    enableTranslation: process.env.SCRAPER_ENABLE_TRANSLATION !== 'false',
    enableTechDetection: process.env.SCRAPER_ENABLE_TECH_DETECTION !== 'false',
  },
}));