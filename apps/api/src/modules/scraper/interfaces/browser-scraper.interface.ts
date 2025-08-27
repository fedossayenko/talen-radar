import { BrowserContext, Page } from 'playwright';

/**
 * Browser session configuration for scraping
 */
export interface BrowserSessionConfig {
  /** Site-specific name (e.g., 'dev.bg', 'jobs.bg') */
  siteName: string;
  
  /** Whether to use headless mode */
  headless?: boolean;
  
  /** Custom viewport configuration */
  viewport?: {
    width: number;
    height: number;
  };
  
  /** Session persistence directory */
  sessionDir?: string;
  
  /** Whether to enable stealth mode */
  stealth?: boolean;
  
  /** Custom proxy configuration */
  proxy?: {
    server: string;
    username?: string;
    password?: string;
  };
  
  /** Request timeout in milliseconds */
  timeout?: number;
  
  /** Custom user agent */
  userAgent?: string;
  
  /** Whether to load images (false = faster) */
  loadImages?: boolean;
}

/**
 * Browser scraping response
 */
export interface BrowserScrapingResponse {
  /** HTML content */
  html: string;
  
  /** Final URL after redirects */
  finalUrl: string;
  
  /** HTTP status code */
  status: number;
  
  /** Response headers */
  headers: Record<string, string>;
  
  /** Whether the page loaded successfully */
  success: boolean;
  
  /** Error message if any */
  error?: string;
  
  /** Time taken to load page */
  loadTime: number;
  
  /** Cookies from the response */
  cookies: Array<{
    name: string;
    value: string;
    domain: string;
    path: string;
    expires?: number;
    httpOnly?: boolean;
    secure?: boolean;
  }>;
  
  /** Additional metadata (service name, credits used, etc.) */
  metadata?: Record<string, any>;
}

/**
 * Browser session management interface
 */
export interface IBrowserSession {
  /** Browser context for this session */
  context: BrowserContext;
  
  /** Current page */
  page: Page;
  
  /** Session configuration */
  config: BrowserSessionConfig;
  
  /** Session creation time */
  createdAt: Date;
  
  /** Last activity time */
  lastActivity: Date;
  
  /** Number of requests made with this session */
  requestCount: number;
  
  /** Session ID */
  id: string;
}

/**
 * Browser engine service interface
 */
export interface IBrowserEngine {
  /**
   * Get or create a browser session for a site
   */
  getSession(config: BrowserSessionConfig): Promise<IBrowserSession>;
  
  /**
   * Fetch a page using browser automation
   */
  fetchPage(url: string, session: IBrowserSession): Promise<BrowserScrapingResponse>;
  
  /**
   * Close a specific session
   */
  closeSession(sessionId: string): Promise<void>;
  
  /**
   * Close all sessions
   */
  closeAllSessions(): Promise<void>;
  
  /**
   * Save session cookies to disk
   */
  saveSession(session: IBrowserSession): Promise<void>;
  
  /**
   * Load session cookies from disk
   */
  loadSession(config: BrowserSessionConfig): Promise<IBrowserSession | null>;
  
  /**
   * Rotate session (close current and create new)
   */
  rotateSession(sessionId: string): Promise<IBrowserSession>;
  
  /**
   * Get session statistics
   */
  getStats(): {
    activeSessions: number;
    totalRequests: number;
    averageLoadTime: number;
    successRate: number;
  };
}

/**
 * Browser stealth configuration
 */
export interface StealthConfig {
  /** Hide webdriver property */
  hideWebdriver: boolean;
  
  /** Spoof user agent */
  spoofUserAgent: boolean;
  
  /** Spoof WebGL vendor */
  spoofWebGL: boolean;
  
  /** Spoof plugins */
  spoofPlugins: boolean;
  
  /** Spoof languages */
  spoofLanguages: boolean;
  
  /** Randomize viewport */
  randomizeViewport: boolean;
  
  /** Use realistic timing */
  realisticTiming: boolean;
  
  /** Add mouse movements */
  addMouseMovements: boolean;
}

/**
 * Session persistence data structure
 */
export interface SessionPersistenceData {
  /** Session cookies */
  cookies: Array<{
    name: string;
    value: string;
    domain: string;
    path: string;
    expires?: number;
    httpOnly?: boolean;
    secure?: boolean;
  }>;
  
  /** Local storage data */
  localStorage: Record<string, string>;
  
  /** Session storage data */
  sessionStorage: Record<string, string>;
  
  /** Session creation timestamp */
  createdAt: number;
  
  /** Last used timestamp */
  lastUsed: number;
  
  /** Site name this session belongs to */
  siteName: string;
  
  /** User agent used */
  userAgent: string;
}

/**
 * Browser detection evasion strategies
 */
export interface EvasionStrategy {
  /** Random delays between actions (min, max in ms) */
  randomDelay: {
    min: number;
    max: number;
  };
  
  /** Scroll page before extracting content */
  scrollPage: boolean;
  
  /** Add random mouse movements */
  mouseMovements: boolean;
  
  /** Wait for specific selectors */
  waitSelectors?: string[];
  
  /** Maximum session request count before rotation */
  maxSessionRequests: number;
  
  /** Session rotation interval in minutes */
  sessionRotationInterval: number;
}