import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BrowserEngineService } from './browser-engine.service';
import { IBrowserSession, BrowserScrapingResponse } from '../interfaces/browser-scraper.interface';

@Injectable()
export class AntiBypassService {
  private readonly logger = new Logger(AntiBypassService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly browserEngine: BrowserEngineService,
  ) {}

  /**
   * Execute sophisticated anti-bot bypass for jobs.bg
   */
  async executeJobsBgBypass(url: string, options?: { infiniteScroll?: boolean, warmup?: boolean }): Promise<BrowserScrapingResponse> {
    try {
      this.logger.log('🔥 JOBS.BG BYPASS MODE: Desktop + Headful + Optimized');
      
      // DataDome bypass: Desktop + Headful + optimized timing
      // Allow override via environment variable for Docker compatibility
      const forceHeadless = process.env.SCRAPER_FORCE_HEADLESS === 'true';
      const session = await this.browserEngine.getSession({
        siteName: 'jobs.bg',
        headless: forceHeadless ? true : false, // HEADFUL BROWSER - Most important change!
        stealth: true,
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36', // Desktop user agent
        viewport: { width: 1920, height: 1080 }, // Desktop viewport
        loadImages: true,
        timeout: 120000, // 2 minutes timeout
      });
      
      // MULTI-PHASE BYPASS STRATEGY
      await this.executeMultiPhaseBypass(session, url, options);
      
    } catch (error) {
      this.logger.error(`Anti-bypass execution failed: ${error.message}`);
      return {
        html: '',
        finalUrl: url,
        status: 0,
        headers: {},
        success: false,
        error: error.message,
        loadTime: 0,
        cookies: [],
      };
    }
  }

  /**
   * Multi-phase bypass strategy for DataDome
   */
  private async executeMultiPhaseBypass(
    session: IBrowserSession, 
    targetUrl: string, 
    options?: { infiniteScroll?: boolean, warmup?: boolean }
  ): Promise<BrowserScrapingResponse> {
    this.logger.log('🖥️ Phase 1: Desktop homepage visit (building trust)');
    
    // Phase 1: Visit homepage and simulate real desktop user
    await this.safePageOperation(session, async () => {
      await session.page.setExtraHTTPHeaders({
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'DNT': '1',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
      });
    }, 'setExtraHTTPHeaders-phase1');
    
    const homepageResponse = await this.browserEngine.fetchPage('https://www.jobs.bg', session, {
      stealth: true,
      warmup: false
    });
    
    if (!homepageResponse.success) {
      this.logger.warn('Homepage failed, but continuing...');
    }
    
    // Phase 2: Simulate real desktop user behavior - scroll, wait, interact
    this.logger.log('🖥️ Phase 2: Simulating desktop user interactions');
    await this.simulateDesktopBehavior(session);
    
    // ULTRA-LONG WAIT - DataDome bypass
    this.logger.log('⏰ Phase 3: ULTRA-LONG WAIT (10-20 seconds to build trust)');
    const ultraWait = 10000 + Math.random() * 10000; // 10-20 seconds
    this.logger.log(`Waiting ${Math.round(ultraWait/1000)} seconds...`);
    await this.safePageOperation(session, async () => {
      await session.page.waitForTimeout(ultraWait);
    }, 'waitForTimeout-ultraWait');
    
    // Phase 4: Navigate to job search with desktop headers  
    this.logger.log('🖥️ Phase 4: Desktop job search navigation');
    await this.setJobSearchHeaders(session);

    // Phase 5: Final navigation with desktop stealth
    this.logger.log('🖥️ Phase 5: Final search page navigation');
    return await this.browserEngine.fetchPage(targetUrl, session, {
      ...options,
      stealth: true,
      warmup: false
    });
  }

  /**
   * Simulate desktop user behavior
   */
  private async simulateDesktopBehavior(session: IBrowserSession): Promise<void> {
    await this.safePageOperation(session, async () => {
      await session.page.evaluate(() => {
        // Desktop-like scrolling
        // eslint-disable-next-line no-undef
        window.scrollTo(0, 200);
        // eslint-disable-next-line no-undef
        setTimeout(() => window.scrollTo(0, 400), 500);
        // eslint-disable-next-line no-undef
        setTimeout(() => window.scrollTo(0, 0), 1000);
      });
    }, 'evaluate-desktopScrolling');
  }

  /**
   * Set job search specific headers
   */
  private async setJobSearchHeaders(session: IBrowserSession): Promise<void> {
    await this.safePageOperation(session, async () => {
      await session.page.setExtraHTTPHeaders({
        'Referer': 'https://www.jobs.bg/',
        'Sec-Fetch-Site': 'same-origin',
        'Sec-Fetch-Mode': 'navigate', 
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-User': '?1',
        'Cache-Control': 'max-age=0',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      });
    }, 'setExtraHTTPHeaders-phase4');
  }

  /**
   * Enhanced DataDome and anti-bot protection detection
   */
  isContentBlocked(html: string): boolean {
    const htmlLower = html.toLowerCase();
    
    // Check for legitimate job content first
    const hasJobContent = htmlLower.includes('mdc-card') && 
      (htmlLower.includes('job') || htmlLower.includes('position') || htmlLower.includes('vacancy'));
    
    // If we have legitimate job content and substantial HTML, don't consider it blocked
    if (hasJobContent && html.length > 50000) {
      this.logger.debug(`Found legitimate job content: ${html.length} chars, has job cards`);
      return false;
    }
    
    // Only check for actual blocking indicators (not just any mention in text)
    const blockingIndicators = [
      // DataDome active blocking pages (not CSP references)
      'datadome.co/captcha',
      'dd.captcha-delivery.com/captcha',
      'geo.captcha-delivery.com/captcha',
      'ct.captcha-delivery.com',
      'captcha-delivery.com/interstitial',
      'captcha-delivery.com/captcha',
      'DataDome Captcha',
      'DataDome CAPTCHA',
      'DataDome Device Check',
      'Just a moment',
      'Verifying your browser',
      'Challenge solved',
      'DataDome protection',
      
      // Actual CAPTCHA challenge pages  
      'Please complete the security check',
      'Access Denied',
      'Please verify you are a human',
      'Security Check',
      'Bot Protection',
      
      // CloudFlare blocking pages
      'Please wait while we check your browser',
      
      // Direct access denial
      'forbidden',
      'rate limit exceeded',
    ];
    
    const hasBlockingIndicator = blockingIndicators.some(indicator => htmlLower.includes(indicator));
    
    // Minimal content detection
    const hasMinimalContent = html.length < 500;
    
    // Debug logging
    if (hasBlockingIndicator || hasMinimalContent) {
      this.logger.debug(`Potential blocking detected: htmlLength=${html.length}, hasBlockingIndicator=${hasBlockingIndicator}, hasMinimalContent=${hasMinimalContent}, hasJobContent=${hasJobContent}`);
      if (hasBlockingIndicator) {
        const foundIndicators = blockingIndicators.filter(indicator => htmlLower.includes(indicator));
        this.logger.debug(`Found blocking indicators: ${foundIndicators.join(', ')}`);
      }
    }
    
    return hasBlockingIndicator || hasMinimalContent;
  }

  /**
   * Safely execute page operations with connection checks
   */
  private async safePageOperation<T>(
    session: IBrowserSession, 
    operation: () => Promise<T>, 
    operationName: string
  ): Promise<T | null> {
    try {
      // Check if page is still valid
      if (session.page.isClosed()) {
        this.logger.warn(`Page closed during ${operationName}, skipping operation`);
        return null;
      }
      
      return await operation();
    } catch (error) {
      if (error.message.includes('Target page, context or browser has been closed') ||
          error.message.includes('browser has been closed') ||
          error.message.includes('context has been closed')) {
        this.logger.warn(`Session closed during ${operationName}: ${error.message}`);
        return null;
      }
      // Re-throw non-connection errors
      throw error;
    }
  }
}