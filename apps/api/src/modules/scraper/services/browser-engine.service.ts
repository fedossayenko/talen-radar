import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Browser, BrowserContext, Page, chromium } from 'playwright';
import * as crypto from 'crypto';

import {
  IBrowserEngine,
  IBrowserSession,
  BrowserSessionConfig,
  BrowserScrapingResponse,
} from '../interfaces/browser-scraper.interface';

// Enhanced browser configurations for stealth mode
interface BrowserConfig {
  viewport: { width: number; height: number };
  userAgent: string;
  platform: string;
  vendor: string;
}

@Injectable()
export class BrowserEngineService implements IBrowserEngine, OnModuleDestroy {
  protected readonly logger = new Logger(BrowserEngineService.name);
  
  protected browser: Browser | null = null;
  protected sessions = new Map<string, IBrowserSession>();
  protected readonly sessionDir: string;
  private readonly stats = {
    totalRequests: 0,
    totalLoadTime: 0,
    successfulRequests: 0,
  };
  
  // Pool of realistic browser configurations for stealth mode
  private readonly browserConfigs: BrowserConfig[] = [
    {
      viewport: { width: 1920, height: 1080 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
      platform: 'Win32',
      vendor: 'Google Inc.',
    },
    {
      viewport: { width: 1366, height: 768 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      platform: 'Win32',
      vendor: 'Google Inc.',
    },
    {
      viewport: { width: 1440, height: 900 },
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
      platform: 'MacIntel',
      vendor: 'Apple Computer, Inc.',
    },
    {
      viewport: { width: 1536, height: 864 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:122.0) Gecko/20100101 Firefox/122.0',
      platform: 'Win32',
      vendor: '',
    },
  ];

  private readonly timezones = ['America/New_York', 'Europe/London', 'Europe/Paris', 'America/Los_Angeles'];
  private readonly languages = [['en-US', 'en'], ['en-GB', 'en'], ['en-CA', 'en', 'fr']];

  constructor(private readonly configService: ConfigService) {
    this.sessionDir = this.configService.get<string>(
      'scraper.sessionDir',
      './scraper-sessions'
    );
    
    this.logger.log('BrowserEngineService initialized with unified browser engine');
  }

  async onModuleDestroy() {
    await this.closeAllSessions();
    if (this.browser) {
      await this.browser.close();
      this.logger.log('Browser instance closed');
    }
  }

  /**
   * Get or create a browser session for a site
   */
  async getSession(config: BrowserSessionConfig): Promise<IBrowserSession> {
    const sessionId = this.generateSessionId(config);
    
    // Check if we have an existing session
    if (this.sessions.has(sessionId)) {
      const session = this.sessions.get(sessionId)!;
      session.lastActivity = new Date();
      return session;
    }

    // Create new session
    return this.createNewSession(config, sessionId);
  }

  /**
   * Fetch a page using browser automation with optional stealth and infinite scroll
   */
  async fetchPage(url: string, session: IBrowserSession, options?: { infiniteScroll?: boolean; stealth?: boolean; warmup?: boolean }): Promise<BrowserScrapingResponse> {
    // If stealth mode is enabled, perform enhanced behavior
    if (options?.stealth) {
      try {
        // Skip warm-up navigation (causes detection) but simulate realistic referrer chain
        if (!options.warmup) {
          // Simulate coming from Google search
          await session.page.setExtraHTTPHeaders({
            'Referer': 'https://www.google.com/search?q=java+jobs+bulgaria',
            'Sec-Fetch-Site': 'cross-site'
          });
        }
        
        // Pre-navigation behavior simulation with longer delays
        await this.simulateHumanBehavior(session.page);
        
        // Add longer random delay before navigation (DataDome bypass)
        await session.page.waitForTimeout(Math.random() * 8000 + 5000);
      } catch (error) {
        this.logger.debug('Stealth behavior simulation error (non-critical):', error.message);
      }
    }
    const startTime = Date.now();
    
    try {
      this.logger.debug(`Fetching page: ${url} with session ${session.id}`);
      
      // Update session activity
      session.lastActivity = new Date();
      session.requestCount++;

      // Add random delay before navigation (human-like behavior) - longer for DataDome
      await session.page.waitForTimeout(Math.random() * 5000 + 3000);
      
      // Navigate to page with realistic timing and enhanced stealth
      const response = await session.page.goto(url, {
        waitUntil: 'networkidle',  // Wait for network to be idle
        timeout: session.config.timeout || 45000,  // Longer timeout for stealth
      });

      if (!response) {
        throw new Error('No response received from page navigation');
      }

      // Wait for network to be idle with human-like timing
      await session.page.waitForLoadState('networkidle');
      
      // Simulate human-like mouse movement
      await session.page.mouse.move(
        Math.random() * 200 + 100,
        Math.random() * 200 + 100
      );

      // For jobs.bg, wait for content to load
      if (session.config.siteName === 'jobs.bg') {
        try {
          // Wait for either job listings to appear or timeout after 10 seconds
          await session.page.waitForSelector('li .mdc-card, .job-item, .mdc-card', { timeout: 10000 });
          this.logger.debug('Job content detected, proceeding with scraping');
        } catch {
          this.logger.warn('No job content detected after waiting, proceeding anyway');
        }
      }

      // Handle infinite scroll if requested
      if (options?.infiniteScroll) {
        await this.performInfiniteScroll(session.page);
      }

      // Get page content and metadata
      const html = await session.page.content();
      const finalUrl = session.page.url();
      const cookies = await session.context.cookies();

      const loadTime = Date.now() - startTime;

      // Update statistics
      this.stats.totalRequests++;
      this.stats.totalLoadTime += loadTime;
      this.stats.successfulRequests++;

      this.logger.debug(`Successfully fetched ${url} in ${loadTime}ms`);

      return {
        html,
        finalUrl,
        status: response.status(),
        headers: response.headers(),
        success: true,
        loadTime,
        cookies: cookies.map(cookie => ({
          name: cookie.name,
          value: cookie.value,
          domain: cookie.domain,
          path: cookie.path,
          expires: cookie.expires,
          httpOnly: cookie.httpOnly,
          secure: cookie.secure,
        })),
      };

    } catch (_error) {
      const loadTime = Date.now() - startTime;
      
      // Update statistics in finally block to ensure proper cleanup
      this.stats.totalRequests++;
      this.stats.totalLoadTime += loadTime;

      this.logger.error(`Failed to fetch ${url}:`, _error.message);

      return {
        html: '',
        finalUrl: url,
        status: 0,
        headers: {},
        success: false,
        error: _error.message,
        loadTime,
        cookies: [],
      };
    } finally {
      // Ensure session is properly updated even on error
      if (session) {
        session.lastActivity = new Date();
      }
    }
  }

  /**
   * Close a specific session
   */
  async closeSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (session) {
      try {
        await session.context.close();
        this.sessions.delete(sessionId);
        this.logger.debug(`Session ${sessionId} closed`);
      } catch (error) {
        this.logger.warn(`Error closing session ${sessionId}:`, error.message);
      }
    }
  }

  /**
   * Close all sessions
   */
  async closeAllSessions(): Promise<void> {
    const sessionIds = Array.from(this.sessions.keys());
    await Promise.all(sessionIds.map(id => this.closeSession(id)));
    this.logger.log(`Closed ${sessionIds.length} sessions`);
  }

  /**
   * Get session statistics
   */
  getStats() {
    const averageLoadTime = this.stats.totalRequests > 0 
      ? this.stats.totalLoadTime / this.stats.totalRequests 
      : 0;
    
    const successRate = this.stats.totalRequests > 0 
      ? this.stats.successfulRequests / this.stats.totalRequests 
      : 0;

    return {
      activeSessions: this.sessions.size,
      totalRequests: this.stats.totalRequests,
      averageLoadTime: Math.round(averageLoadTime),
      successRate: Math.round(successRate * 100) / 100,
    };
  }

  /**
   * Create a new browser session
   */
  protected async createNewSession(config: BrowserSessionConfig, sessionId?: string): Promise<IBrowserSession> {
    const id = sessionId || this.generateSessionId(config);
    
    // Ensure browser is available
    if (!this.browser) {
      try {
        this.browser = await this.launchBrowser(config);
        
        this.logger.log(`Browser instance created with ${config.stealth ? 'enhanced stealth' : 'standard'} capabilities`);
      } catch (error) {
        this.logger.error('Failed to launch browser instance:', error.message);
        throw new Error(`Browser initialization failed for ${config.siteName}: ${error.message}. Browser automation is not available.`);
      }
    }

    // Create browser context with optional stealth enhancements
    const browserConfig = config.stealth ? this.getRandomBrowserConfig() : null;
    const context = await this.createBrowserContext(config, browserConfig);
    const page = await this.createBrowserPage(context, config);


    // Block unnecessary resources for better performance and stealth
    if (config.loadImages === false) {
      await page.route('**/*', (route) => {
        const resourceType = route.request().resourceType();
        if (['image', 'stylesheet', 'font', 'media'].includes(resourceType)) {
          route.abort();
        } else {
          route.continue();
        }
      });
    }

    const session: IBrowserSession = {
      context,
      page,
      config,
      createdAt: new Date(),
      lastActivity: new Date(),
      requestCount: 0,
      id,
    };

    this.sessions.set(id, session);
    
    this.logger.log(`Created new browser session: ${id} for ${config.siteName} ${config.stealth ? '(stealth mode)' : '(standard mode)'}`);
    
    return session;
  }

  /**
   * Save session (simplified - no disk persistence)
   */
  async saveSession(session: IBrowserSession): Promise<void> {
    // In simplified implementation, sessions are already managed in memory
    this.logger.debug(`Session ${session.id} state maintained in memory`);
  }

  /**
   * Load session (simplified - returns null since we don't persist to disk)
   */
  async loadSession(_config: BrowserSessionConfig): Promise<IBrowserSession | null> {
    // In simplified implementation, we don't persist sessions to disk
    return null;
  }

  /**
   * Rotate session (close current and create new)
   */
  async rotateSession(sessionId: string): Promise<IBrowserSession> {
    const currentSession = this.sessions.get(sessionId);
    if (!currentSession) {
      throw new Error(`Session ${sessionId} not found`);
    }

    const config = currentSession.config;
    await this.closeSession(sessionId);
    
    // Create new session with same config but new ID
    const newSessionId = this.generateSessionId(config, true);
    return this.createNewSession(config, newSessionId);
  }

  /**
   * Enhanced infinite scroll with human-like behavior
   */
  /* eslint-disable no-undef */
  private async performInfiniteScroll(page: Page): Promise<void> {
    this.logger.debug('Starting enhanced infinite scroll to load all jobs');
    
    let previousHeight = 0;
    let currentHeight = await page.evaluate(() => document.body.scrollHeight);
    let attempts = 0;
    const maxAttempts = 15; // Reduced to prevent detection
    const scrollStep = 0.8; // Scroll to 80% instead of bottom
    
    while (previousHeight !== currentHeight && attempts < maxAttempts) {
      previousHeight = currentHeight;
      
      // Human-like scroll behavior - scroll gradually
      const targetHeight = currentHeight * scrollStep;
      await page.evaluate((target) => {
        const currentScroll = window.pageYOffset;
        const step = (target - currentScroll) / 10;
        let scrolls = 0;
        
        const smoothScroll = () => {
          if (scrolls < 10) {
            window.scrollBy(0, step);
            scrolls++;
            setTimeout(smoothScroll, 50 + Math.random() * 50);
          }
        };
        smoothScroll();
      }, targetHeight);
      
      // Random wait time to simulate human reading
      const waitTime = 2000 + Math.random() * 3000;
      await page.waitForTimeout(waitTime);
      
      // Scroll to actual bottom
      await page.evaluate(() => {
        window.scrollTo(0, document.body.scrollHeight);
      });
      
      // Wait for new content with jitter
      await page.waitForTimeout(1500 + Math.random() * 1000);
      
      // Check new height
      currentHeight = await page.evaluate(() => document.body.scrollHeight);
      attempts++;
      
      this.logger.debug(`Enhanced scroll attempt ${attempts}: height ${previousHeight} -> ${currentHeight}`);
      
      // Add small mouse movements to simulate engagement
      if (attempts % 3 === 0) {
        await page.mouse.move(
          Math.random() * 300 + 100,
          Math.random() * 300 + 100
        );
      }
    }
    
    if (attempts >= maxAttempts) {
      this.logger.warn('Enhanced infinite scroll stopped due to max attempts reached');
    } else {
      this.logger.debug(`Enhanced infinite scroll completed in ${attempts} attempts`);
    }
    
    // Gradually scroll back to top with human-like behavior
    await page.evaluate(() => {
      const scrollToTop = () => {
        const currentScroll = window.pageYOffset;
        if (currentScroll > 0) {
          window.scrollTo(0, currentScroll - currentScroll * 0.1);
          setTimeout(scrollToTop, 50);
        }
      };
      scrollToTop();
    });
    
    await page.waitForTimeout(1000 + Math.random() * 500);
  }
  /* eslint-enable no-undef */

  /**
   * Generate session ID based on configuration
   */
  protected generateSessionId(config: BrowserSessionConfig, forceNew = false): string {
    const baseStr = `${config.siteName}-${config.userAgent || 'default'}-${config.headless}-${config.stealth || false}`;
    
    if (forceNew) {
      return crypto.createHash('md5').update(`${baseStr}-${Date.now()}-${Math.random()}`).digest('hex').substring(0, 8);
    }
    
    return crypto.createHash('md5').update(baseStr).digest('hex').substring(0, 8);
  }

  /**
   * Launch browser with optional stealth capabilities and undetected mode for jobs.bg
   */
  private async launchBrowser(config: BrowserSessionConfig) {
    const baseArgs = [
      '--no-sandbox',
      '--disable-setuid-sandbox', 
      '--disable-dev-shm-usage',
      '--disable-blink-features=AutomationControlled',
      '--disable-web-security',
      '--disable-features=VizDisplayCompositor',
    ];

    const stealthArgs = [
      '--disable-extensions-except=/path/to/extension',
      '--disable-extensions',
      '--disable-plugins-discovery', 
      '--disable-default-apps',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding',
    ];
    
    // EXTREME UNDETECTED ARGS for jobs.bg DataDome bypass
    const undetectedArgs = [
      '--disable-blink-features=AutomationControlled',
      '--exclude-switches=enable-automation',
      '--disable-extensions',
      '--no-sandbox',
      '--disable-infobars',
      '--disable-dev-shm-usage',
      '--disable-browser-side-navigation',
      '--disable-gpu',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-features=ScriptStreaming',
      '--disable-features=VizDisplayCompositor,VizHitTestSurfaceLayer',
      '--disable-features=TranslateUI',
      '--disable-ipc-flooding-protection',
      '--disable-hang-monitor',
      '--disable-client-side-phishing-detection',
      '--disable-popup-blocking',
      '--disable-prompt-on-repost',
      '--disable-sync',
      '--disable-component-extensions-with-background-pages',
      '--disable-background-networking',
      '--disable-component-update',
      '--disable-domain-reliability'
    ];

    const finalArgs = config.siteName === 'jobs.bg' && config.stealth 
      ? [...baseArgs, ...undetectedArgs]
      : (config.stealth ? [...baseArgs, ...stealthArgs] : baseArgs);

    const launchOptions = {
      headless: config.headless !== false,
      args: finalArgs,
      ignoreDefaultArgs: config.stealth ? ['--enable-automation', '--enable-blink-features=IdleDetection'] : undefined,
      devtools: false,
    };
    
    // Special handling for jobs.bg headful mode
    if (config.siteName === 'jobs.bg' && !config.headless) {
      this.logger.log('🚀 Launching HEADFUL browser for jobs.bg DataDome bypass');
      launchOptions.headless = false;
      launchOptions.devtools = false;
    }

    return await chromium.launch(launchOptions);
  }

  /**
   * Create browser context with optional stealth enhancements
   */
  private async createBrowserContext(config: BrowserSessionConfig, browserConfig?: BrowserConfig) {
    const randomTimezone = this.timezones[Math.floor(Math.random() * this.timezones.length)];
    const randomLanguages = this.languages[Math.floor(Math.random() * this.languages.length)];

    return await this.browser!.newContext({
      userAgent: config.stealth && browserConfig 
        ? browserConfig.userAgent 
        : (config.userAgent || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36'),
      viewport: config.stealth && browserConfig 
        ? browserConfig.viewport 
        : (config.viewport || { width: 1920, height: 1080 }),
      ignoreHTTPSErrors: true,
      // Enhanced fingerprint spoofing
      locale: config.stealth ? randomLanguages[0] : 'en-US',
      timezoneId: config.stealth ? randomTimezone : 'America/New_York',
      permissions: config.stealth 
        ? ['geolocation', 'notifications', 'microphone', 'camera'] 
        : ['geolocation'],
      colorScheme: 'light',
      reducedMotion: 'no-preference',
      forcedColors: 'none',
      // Add realistic browser features
      extraHTTPHeaders: config.stealth ? {
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Encoding': 'gzip, deflate, br',
        'Accept-Language': randomLanguages.join(',') + ';q=0.9',
        'Cache-Control': 'max-age=0',
        'DNT': '1',
        'Sec-CH-UA': this.generateSecChUa(),
        'Sec-CH-UA-Mobile': '?0',
        'Sec-CH-UA-Platform': `"${browserConfig?.platform || 'Windows'}"`,
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
        'Upgrade-Insecure-Requests': '1',
      } : {
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
        'Accept-Encoding': 'gzip, deflate, br',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cache-Control': 'max-age=0',
        'Sec-Ch-Ua': '"Not_A Brand";v="8", "Chromium";v="121", "Google Chrome";v="121"',
        'Sec-Ch-Ua-Mobile': '?0',
        'Sec-Ch-Ua-Platform': '"Windows"',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
        'Upgrade-Insecure-Requests': '1',
      },
    });
  }

  /**
   * Create browser page with optional stealth scripts
   */
  private async createBrowserPage(context: BrowserContext, config: BrowserSessionConfig) {
    const page = await context.newPage();

    // Stealth script injection
    if (config.stealth) {
      await this.injectStealthScripts(page);
    } else {
      await this.injectBasicScripts(page);
    }

    // Block unnecessary resources for better performance
    if (config.loadImages === false) {
      await page.route('**/*', (route) => {
        const resourceType = route.request().resourceType();
        if (['image', 'stylesheet', 'font', 'media'].includes(resourceType)) {
          route.abort();
        } else {
          route.continue();
        }
      });
    }

    return page;
  }

  /**
   * Inject enhanced stealth scripts with advanced DataDome bypass techniques
   */
  /* eslint-disable no-undef */
  private async injectStealthScripts(page: Page) {
    await page.addInitScript(() => {
      // Override webdriver property completely
      Object.defineProperty(navigator, 'webdriver', {
        get: () => undefined,
      });
      
      // Remove automation control flags
      delete (window as any).__nightmare;
      delete (window as any).__webdriver_evaluate;
      delete (window as any).__webdriver_script_func;
      delete (window as any).__webdriver_script_fn;
      delete (window as any).__fxdriver_evaluate;
      delete (window as any).__driver_unwrapped;
      delete (window as any).__webdriver_unwrapped;
      delete (window as any).__driver_evaluate;
      delete (window as any).__selenium_evaluate;
      delete (window as any).__fxdriver_unwrapped;
      delete (window as any).__selenium_unwrapped;

      // Enhanced plugin spoofing with realistic plugins
      Object.defineProperty(navigator, 'plugins', {
        get: () => [
          { 
            name: 'Chrome PDF Plugin', 
            description: 'Portable Document Format', 
            filename: 'internal-pdf-viewer',
            length: 1,
            item: () => null,
            namedItem: () => null
          },
          { 
            name: 'Chrome PDF Viewer', 
            description: 'PDF Viewer', 
            filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai',
            length: 1,
            item: () => null,
            namedItem: () => null
          },
          { 
            name: 'Native Client', 
            description: 'Native Client Executable', 
            filename: 'internal-nacl-plugin',
            length: 2,
            item: () => null,
            namedItem: () => null
          },
          {
            name: 'Microsoft Edge PDF Viewer',
            description: 'PDF Viewer',
            filename: 'pdf',
            length: 1,
            item: () => null,
            namedItem: () => null
          }
        ],
      });

      // Randomized language spoofing
      const languages = [['en-US', 'en'], ['en-GB', 'en'], ['en-CA', 'en', 'fr']];
      const randomLang = languages[Math.floor(Math.random() * languages.length)];
      Object.defineProperty(navigator, 'languages', {
        get: () => randomLang,
      });
      Object.defineProperty(navigator, 'language', {
        get: () => randomLang[0],
      });

      // Enhanced screen properties with randomization
      const screenConfigs = [
        { width: 1920, height: 1080, availWidth: 1920, availHeight: 1040 },
        { width: 1366, height: 768, availWidth: 1366, availHeight: 728 },
        { width: 1440, height: 900, availWidth: 1440, availHeight: 860 },
        { width: 1536, height: 864, availWidth: 1536, availHeight: 824 }
      ];
      const randomScreen = screenConfigs[Math.floor(Math.random() * screenConfigs.length)];
      
      Object.defineProperty(screen, 'width', { get: () => randomScreen.width });
      Object.defineProperty(screen, 'height', { get: () => randomScreen.height });
      Object.defineProperty(screen, 'availHeight', { get: () => randomScreen.availHeight });
      Object.defineProperty(screen, 'availWidth', { get: () => randomScreen.availWidth });
      Object.defineProperty(screen, 'colorDepth', { get: () => 24 });
      Object.defineProperty(screen, 'pixelDepth', { get: () => 24 });
      Object.defineProperty(screen, 'orientation', {
        get: () => ({ type: 'landscape-primary', angle: 0 })
      });

      // Enhanced Chrome runtime spoofing
      (window as any).chrome = {
        runtime: {
          onConnect: null,
          onMessage: null,
          sendMessage: () => {},
          connect: () => ({})
        },
        loadTimes: () => ({
          commitLoadTime: Date.now() / 1000 - Math.random() * 0.1,
          connectionInfo: 'h2',
          finishDocumentLoadTime: Date.now() / 1000 - Math.random() * 0.05,
          finishLoadTime: Date.now() / 1000 - Math.random() * 0.05,
          firstPaintAfterLoadTime: Date.now() / 1000 - Math.random() * 0.05,
          firstPaintTime: Date.now() / 1000 - Math.random() * 0.1,
          navigationType: 'Other',
          npnNegotiatedProtocol: 'h2',
          requestTime: Date.now() / 1000 - Math.random() * 0.2,
          startLoadTime: Date.now() / 1000 - Math.random() * 0.2,
          wasAlternateProtocolAvailable: false,
          wasFetchedViaSpdy: true,
          wasNpnNegotiated: true,
        }),
        csi: () => ({
          onloadT: Date.now(),
          pageT: Date.now(),
          tran: Math.floor(Math.random() * 20) + 1
        }),
        app: {
          isInstalled: false,
          InstallState: 'not_installed',
          RunningState: 'cannot_run'
        }
      };

      // Battery API spoofing with realistic values
      (navigator as any).getBattery = () => Promise.resolve({
        charging: Math.random() > 0.5,
        chargingTime: Math.random() > 0.5 ? Infinity : Math.random() * 3600,
        dischargingTime: Math.random() * 18000 + 3600,
        level: 0.1 + Math.random() * 0.9,
      });

      // Enhanced connection spoofing
      (navigator as any).connection = {
        downlink: Math.random() * 10 + 5,
        effectiveType: ['slow-2g', '2g', '3g', '4g'][Math.floor(Math.random() * 4)],
        onchange: null,
        rtt: Math.floor(Math.random() * 100) + 50,
        saveData: false,
        type: 'wifi'
      };

      // Canvas fingerprint randomization
      const getImageData = HTMLCanvasElement.prototype.toDataURL;
      HTMLCanvasElement.prototype.toDataURL = function(format) {
        if (format === 'image/png') {
          const context = this.getContext('2d');
          const imageData = context.getImageData(0, 0, this.width, this.height);
          for (let i = 0; i < imageData.data.length; i += 4) {
            imageData.data[i + 0] = imageData.data[i + 0] + Math.floor(Math.random() * 10) - 5;
            imageData.data[i + 1] = imageData.data[i + 1] + Math.floor(Math.random() * 10) - 5;
            imageData.data[i + 2] = imageData.data[i + 2] + Math.floor(Math.random() * 10) - 5;
          }
          context.putImageData(imageData, 0, 0);
        }
        return getImageData.apply(this, arguments);
      };

      // WebGL fingerprint spoofing
      const getContext = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function(type) {
        const context = getContext.apply(this, arguments);
        if (type === 'webgl' || type === 'experimental-webgl') {
          const getParameter = context.getParameter;
          context.getParameter = function(parameter) {
            if (parameter === 37445) {
              return 'Intel Inc.'; // UNMASKED_VENDOR_WEBGL
            }
            if (parameter === 37446) {
              return 'Intel(R) Iris(TM) Graphics 6100'; // UNMASKED_RENDERER_WEBGL
            }
            return getParameter.apply(this, arguments);
          };
        }
        return context;
      };

      // Audio context spoofing
      const audioContexts = ['AudioContext', 'webkitAudioContext'];
      audioContexts.forEach(contextName => {
        if (window[contextName]) {
          const OriginalAudioContext = window[contextName];
          window[contextName] = function() {
            const context = new OriginalAudioContext();
            const originalCreateOscillator = context.createOscillator;
            context.createOscillator = function() {
              const oscillator = originalCreateOscillator.apply(this, arguments);
              const originalConnect = oscillator.connect;
              oscillator.connect = function() {
                const result = originalConnect.apply(this, arguments);
                return result;
              };
              return oscillator;
            };
            return context;
          };
        }
      });

      // Memory info spoofing
      if ('memory' in performance) {
        Object.defineProperty(performance, 'memory', {
          get: () => ({
            jsHeapSizeLimit: Math.floor(Math.random() * 1000000000) + 1000000000,
            totalJSHeapSize: Math.floor(Math.random() * 50000000) + 10000000,
            usedJSHeapSize: Math.floor(Math.random() * 30000000) + 5000000
          })
        });
      }

      // Remove automation indicators
      try {
        delete (window.navigator as any).__proto__.webdriver;
        delete window['__webdriver_evaluate'];
        delete window['__selenium_evaluate'];
        delete window['__webdriver_script_function'];
        delete window['__webdriver_script_func'];
        delete window['__webdriver_script_fn'];
        delete window['__fxdriver_evaluate'];
        delete window['__driver_unwrapped'];
        delete window['__webdriver_unwrapped'];
        delete window['__driver_evaluate'];
        delete window['__selenium_unwrapped'];
        delete window['__fxdriver_unwrapped'];
      } catch {
        // Ignore
      }
    });
  }
  /* eslint-enable no-undef */

  /**
   * Inject basic stealth scripts
   */
  /* eslint-disable no-undef, @typescript-eslint/no-unused-vars */
  private async injectBasicScripts(page: Page) {
    await page.addInitScript(() => {
      // Override navigator.webdriver
      Object.defineProperty(navigator, 'webdriver', {
        get: () => undefined,
      });
      
      // Override navigator.plugins
      Object.defineProperty(navigator, 'plugins', {
        get: () => [1, 2, 3, 4, 5],
      });
      
      // Override navigator.languages
      Object.defineProperty(navigator, 'languages', {
        get: () => ['en-US', 'en'],
      });
      
      // Add realistic screen properties
      Object.defineProperty(screen, 'availHeight', {
        get: () => 1040,
      });
      Object.defineProperty(screen, 'availWidth', {
        get: () => 1920,
      });
      
      // Override chrome runtime
      (window as any).chrome = {
        runtime: {},
        loadTimes: function() {},
        csi: function() {},
      };
      
      // Remove automation indicators
      try {
        delete (window.navigator as any).__proto__.webdriver;
      } catch (_e) {
        // Ignore errors when trying to delete webdriver property
      }
    });
  }
  /* eslint-enable no-undef, @typescript-eslint/no-unused-vars */

  /**
   * Simulate human-like behavior for stealth mode
   */
  async simulateHumanBehavior(page: Page): Promise<void> {
    try {
      // Random mouse movements
      const randomX = Math.random() * 300 + 100;
      const randomY = Math.random() * 300 + 100;
      
      // Smooth mouse movement
      await page.mouse.move(randomX, randomY);
      await page.waitForTimeout(100 + Math.random() * 200);
      
      // Random scroll with realistic timing
      await page.mouse.wheel(0, Math.random() * 500 + 200);
      await page.waitForTimeout(1000 + Math.random() * 2000);
      
      // More realistic mouse movement
      const newX = Math.random() * 200 + 150;
      const newY = Math.random() * 200 + 150;
      await page.mouse.move(newX, newY);
      
      // Random click on empty area
      try {
        const bodyBox = await page.locator('body').boundingBox();
        if (bodyBox && bodyBox.width > 0 && bodyBox.height > 0) {
          const clickX = bodyBox.width * 0.8;
          const clickY = bodyBox.height * 0.1;
          await page.mouse.click(clickX, clickY);
          await page.waitForTimeout(200 + Math.random() * 300);
        }
      } catch {
        // Ignore click errors
      }
      
    } catch (error) {
      this.logger.debug('Human behavior simulation error (non-critical):', error.message);
    }
  }

  /**
   * Perform warm-up navigation to build session trust
   */
  private async performWarmupNavigation(session: IBrowserSession): Promise<void> {
    try {
      this.logger.debug('Performing warm-up navigation');
      
      // Navigate to homepage first
      const baseUrl = session.config.siteName === 'jobs.bg' ? 'https://www.jobs.bg' : 'https://dev.bg';
      await session.page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
      
      // Simulate reading
      await session.page.waitForTimeout(3000 + Math.random() * 4000);
      
      // Human-like interactions
      await this.simulateHumanBehavior(session.page);
      
      // Small delay before actual navigation
      await session.page.waitForTimeout(2000 + Math.random() * 3000);
      
    } catch (error) {
      this.logger.warn('Warm-up navigation failed (non-critical):', error.message);
    }
  }

  /**
   * Get random browser configuration for stealth mode
   */
  private getRandomBrowserConfig(): BrowserConfig {
    return this.browserConfigs[Math.floor(Math.random() * this.browserConfigs.length)];
  }

  /**
   * Generate realistic Sec-CH-UA header
   */
  private generateSecChUa(): string {
    const brands = [
      '"Not_A Brand";v="8", "Chromium";v="121", "Google Chrome";v="121"',
      '"Not A(Brand";v="99", "Google Chrome";v="121", "Chromium";v="121"',
      '"Not?A_Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
    ];
    return brands[Math.floor(Math.random() * brands.length)];
  }
}