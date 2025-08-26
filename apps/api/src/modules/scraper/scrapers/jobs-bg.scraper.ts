import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as cheerio from 'cheerio';
import { promises as fs } from 'fs';
import { join } from 'path';
import { BaseScraper } from './base.scraper';
import {
  JobListing,
  ScraperOptions,
  ScrapingResult,
  JobDetails,
} from '../interfaces/job-scraper.interface';
import { BrowserEngineService } from '../services/browser-engine.service';
import { PaidScraperService } from '../services/paid-scraper.service';
import { CreditTrackerService } from '../services/credit-tracker.service';
import { PaidScrapingOptions, CreditUsage } from '../interfaces/paid-scraper.interface';

/**
 * Jobs.bg job scraper implementation
 * Bulgarian job site with different structure than dev.bg
 */
@Injectable()
export class JobsBgScraper extends BaseScraper {
  private readonly baseUrl: string;
  private readonly searchUrl: string;
  private readonly maxPages: number;

  constructor(
    configService: ConfigService,
    protected readonly browserEngine: BrowserEngineService,
    private readonly paidScraperService: PaidScraperService,
    private readonly creditTrackerService: CreditTrackerService,
  ) {
    super(configService, 'jobs.bg', browserEngine);
    
    this.baseUrl = this.configService.get<string>('scraper.sites.jobsBg.baseUrl', 'https://www.jobs.bg');
    this.searchUrl = this.configService.get<string>('scraper.sites.jobsBg.searchUrl', 'https://www.jobs.bg/en/front_job_search.php');
    this.maxPages = this.configService.get<number>('scraper.sites.jobsBg.maxPages', 10);
    
    this.logger.log('JobsBgScraper initialized successfully');
  }

  async scrapeJobs(options: ScraperOptions = {}): Promise<ScrapingResult> {
    const { page = 1, limit, keywords = ['Java'], location, experienceLevel } = options;
    const startTime = Date.now();
    let totalRequestCount = 0;
    
    this.logger.log(`Starting to scrape jobs from jobs.bg - Page ${page}${limit ? ` (limit: ${limit})` : ''}`);
    
    const url = this.buildSearchUrl(page, keywords, location, experienceLevel);
    this.logger.log(`Target URL: ${url}`);
    
    // Get retry configuration
    const retryConfig = this.configService.get('paidServices.retry', {
      maxAttempts: 3,
      baseDelayMs: 10000,
      exponentialBase: 3,
      jitterMs: 2000,
    });
    
    let lastError: string | null = null;
    
    // Try free scraping with retries first
    for (let attempt = 1; attempt <= retryConfig.maxAttempts; attempt++) {
      try {
        this.logger.log(`🆓 Free scraping attempt ${attempt}/${retryConfig.maxAttempts}`);
        totalRequestCount++;
        
        // Use stealth browser with enhanced DataDome bypass techniques
        const response = await this.fetchWithStealthBrowser(url, { infiniteScroll: true, warmup: false });
        
        // Save raw HTML response to file for debugging
        if (response.html) {
          await this.saveResponseToFile(response.html, page);
        }
        
        if (!response.success || !response.html) {
          throw new Error(response.error || 'No content received');
        }

        // Check for DataDome protection
        if (this.isCaptchaOrBlocked(response.html)) {
          throw new Error('DataDome protection detected - blocked by anti-bot system');
        }

        // Success! Parse and return results
        const jobs = await this.parseJobsFromHtml(response.html, page);
        
        // Apply limit if specified
        const limitedJobs = limit && jobs.length > limit ? jobs.slice(0, limit) : jobs;
        
        if (limit && jobs.length > limit) {
          this.logger.log(`Limiting results to ${limit} jobs (found ${jobs.length})`);
        }
        
        // Check if there are more pages
        const hasNextPage = this.hasNextPage(response.html, page);
        
        this.logger.log(`✅ Free scraping succeeded on attempt ${attempt} - found ${limitedJobs.length} jobs`);
        
        return {
          jobs: limitedJobs,
          totalFound: limitedJobs.length,
          page,
          hasNextPage,
          errors: [],
          metadata: {
            processingTime: Date.now() - startTime,
            sourceUrl: url,
            requestCount: totalRequestCount,
            scrapingMethod: 'free',
            attempts: attempt,
          },
        };

      } catch (error) {
        lastError = error.message;
        this.logger.warn(`❌ Free scraping attempt ${attempt} failed: ${error.message}`);
        
        // If not the last attempt, wait before retrying
        if (attempt < retryConfig.maxAttempts) {
          const delay = retryConfig.baseDelayMs * Math.pow(retryConfig.exponentialBase, attempt - 1) + 
                       Math.random() * retryConfig.jitterMs;
          
          this.logger.log(`⏳ Waiting ${Math.round(delay/1000)}s before retry...`);
          await this.sleep(delay);
        }
      }
    }
    
    // All free attempts failed - try paid service fallback
    this.logger.warn(`🆓 All free scraping attempts failed. Trying paid service fallback...`);
    
    try {
      return await this.scrapeWithPaidFallback(url, {
        page,
        limit,
        keywords,
        location,
        experienceLevel,
        startTime,
        totalRequestCount,
        lastError,
      });
      
    } catch (paidError) {
      this.logger.error(`💳 Paid scraping also failed: ${paidError.message}`);
      
      return {
        jobs: [],
        totalFound: 0,
        page,
        hasNextPage: false,
        errors: [
          `Free scraping failed after ${retryConfig.maxAttempts} attempts: ${lastError}`,
          `Paid scraping failed: ${paidError.message}`,
        ],
        metadata: {
          processingTime: Date.now() - startTime,
          sourceUrl: url,
          requestCount: totalRequestCount + 1, // +1 for paid attempt
          scrapingMethod: 'both_failed',
          attempts: retryConfig.maxAttempts,
        },
      };
    }
  }

  async fetchJobDetails(jobUrl: string, _companyName?: string): Promise<JobDetails> {
    try {
      this.logger.log(`Fetching job details from: ${jobUrl}`);
      
      // Try free scraping first with single attempt
      let response = await this.fetchPage(jobUrl, { forceBrowser: true });
      
      // If free scraping fails and we have credits, use paid service
      if (!response.success || !response.html || this.isCaptchaOrBlocked(response.html)) {
        this.logger.log(`Free fetch failed for job details, trying paid service...`);
        
        const requiredCredits = this.creditTrackerService.getCreditCost('jobs.bg', 'scraperapi');
        const hasCredits = await this.creditTrackerService.hasAvailableCredits('scraperapi', requiredCredits);
        
        if (hasCredits) {
          try {
            const paidOptions: PaidScrapingOptions = {
              url: jobUrl,
              siteName: 'jobs.bg',
              render: true,
              premium: true,
              countryCode: 'bg',
              timeout: 180000,
            };
            
            const paidResponse = await this.paidScraperService.scrapeWithScraperAPI(paidOptions);
            
            if (paidResponse.success && paidResponse.html) {
              // Track credit usage
              await this.creditTrackerService.trackUsage({
                service: 'scraperapi',
                site: 'jobs.bg',
                credits: paidResponse.credits,
                url: jobUrl,
                timestamp: new Date(),
                successful: true,
              });
              
              response = {
                html: paidResponse.html,
                success: true,
                finalUrl: jobUrl,
                status: 200,
                headers: {},
                loadTime: paidResponse.processingTime,
                cookies: [],
              };
              
              this.logger.log(`✅ Paid job details fetch succeeded (${paidResponse.credits} credits used)`);
            }
          } catch (paidError) {
            this.logger.warn(`Paid job details fetch failed: ${paidError.message}`);
          }
        }
      }
      
      if (!response.success || !response.html) {
        this.logger.warn(`Failed to fetch job details from ${jobUrl}: ${response.error || 'No content'}`);
        return { 
          description: '', 
          requirements: '',
          rawHtml: '',
        };
      }
      
      return this.parseJobDetailsFromHtml(response.html, jobUrl);

    } catch (error) {
      this.logger.warn(`Failed to fetch job details from ${jobUrl}:`, error.message);
      return { 
        description: '', 
        requirements: '',
        rawHtml: '',
      };
    }
  }

  getSiteConfig() {
    return {
      name: 'jobs.bg',
      baseUrl: this.baseUrl,
      supportedLocations: ['София', 'Пловдив', 'Варна', 'Бургас', 'Стара Загора', 'Remote'],
      supportedCategories: ['Java', 'JavaScript', 'Python', 'C#', '.NET', 'PHP', 'React', 'Angular'],
    };
  }

  canHandle(url: string): boolean {
    return url.includes('jobs.bg');
  }

  private buildSearchUrl(page: number, keywords: string[], location?: string, experienceLevel?: string): string {
    const params = new URLSearchParams();
    
    // Add categories - using Java category 56 based on user's example
    if (keywords.includes('Java')) {
      params.append('categories[0]', '56');
    }
    
    // Add technologies with indexed format
    keywords.forEach((keyword, index) => {
      params.append(`techs[${index}]`, keyword);
    });
    
    // Add location if specified
    if (location) {
      params.append('location', location);
    }
    
    // Add experience level if specified
    if (experienceLevel) {
      params.append('experience', experienceLevel);
    }
    
    // Add page if not first page
    if (page > 1) {
      params.append('page', page.toString());
    }
    
    return `${this.searchUrl}?${params.toString()}`;
  }

  private async parseJobsFromHtml(html: string, page: number): Promise<JobListing[]> {
    const jobs: JobListing[] = [];
    
    try {
      const $ = cheerio.load(html);
      
      // Check for CAPTCHA or anti-bot protection
      if (this.isCaptchaOrBlocked(html)) {
        this.logger.warn('Jobs.bg is showing CAPTCHA or anti-bot protection');
        return jobs; // Return empty array with warning logged
      }
      
      // Try multiple selectors for job listings
      const selectors = [
        'li .mdc-card',           // Primary selector
        '.job-item .mdc-card',    // Alternative 1
        '[data-job] .mdc-card',   // Alternative 2
        '.mdc-card[href]',        // Alternative 3
      ];
      
      let jobElements = $();
      for (const selector of selectors) {
        jobElements = $(selector);
        if (jobElements.length > 0) {
          this.logger.debug(`Found ${jobElements.length} jobs using selector: ${selector}`);
          break;
        }
      }
      
      if (jobElements.length === 0) {
        this.logger.warn('No job listings found with any selector - possible structure change or blocking');
      }
      
      this.logger.log(`Found ${jobElements.length} job listings in HTML for page ${page}`);

      jobElements.each((index, element) => {
        try {
          const job = this.processJobElement($, element);
          if (job) {
            jobs.push(job);
          }
        } catch (error) {
          this.logger.warn(`Failed to parse job listing ${index + 1}:`, error.message);
        }
      });

    } catch (error) {
      this.logger.error('Failed to parse jobs from HTML:', error.message);
    }

    return jobs;
  }

  private processJobElement($: cheerio.CheerioAPI, element: any): JobListing | null {
    try {
      // Updated selectors based on actual jobs.bg HTML structure
      const titleElement = $(element).find('.card-title span').last();
      const companyElement = $(element).find('.card-logo-info .secondary-text');
      const cardInfoElement = $(element).find('.card-info');
      const linkElement = $(element).find('.card-title').closest('a');
      const dateElement = $(element).find('.card-date');
      
      const title = titleElement.text().trim();
      const company = companyElement.text().trim();
      const link = linkElement.attr('href');
      const dateText = dateElement.first().contents().filter(function() {
        return this.nodeType === 3; // Text node
      }).text().trim();
      
      if (!title || !company || !link) {
        this.logger.debug(`Missing required fields - Title: "${title}", Company: "${company}", Link: "${link}"`);
        return null;
      }
      
      // Extract job metadata from card-info
      const cardInfoText = cardInfoElement.text();
      const locationMatch = cardInfoText.match(/location_on\s*([^;]+)/);
      const location = locationMatch ? locationMatch[1].trim() : 'Sofia';
      
      // Use base class method for work model normalization
      const workModel = this.normalizeWorkModel(cardInfoText);
      
      // Use base class method for experience level normalization  
      const experienceLevel = this.normalizeExperienceLevel(cardInfoText);
      
      // Build full URL if relative
      const fullUrl = link.startsWith('http') ? link : `${this.baseUrl}${link}`;
      
      // Extract technologies from skill images
      const technologies: string[] = [];
      $(element).find('.skill img').each((i, img) => {
        const tech = $(img).attr('alt');
        if (tech && tech.toLowerCase() !== 'english') {
          technologies.push(tech.toLowerCase());
        }
      });
      
      // Fallback: extract from job text if no tech elements found
      if (technologies.length === 0) {
        const jobText = $(element).text();
        technologies.push(...this.extractTechnologies(jobText));
      }
      
      return {
        title,
        company: this.normalizeCompanyName(company),
        location,
        workModel,
        technologies,
        postedDate: this.parsePostedDate(dateText),
        salaryRange: undefined, // Not typically shown in job listings
        url: fullUrl,
        originalJobId: this.extractJobId(fullUrl),
        sourceSite: 'jobs.bg',
        description: '', // Will be filled when fetching job details
        requirements: '',
        experienceLevel,
        employmentType: 'full-time', // Default
      };
      
    } catch (error) {
      this.logger.warn('Error processing job element:', error.message);
      return null;
    }
  }

  private parseJobDetailsFromHtml(html: string, _jobUrl: string): JobDetails {
    const $ = cheerio.load(html);
    
    // Extract job description and requirements
    const descriptionElement = $('.job-description, .description, .content, .job-content').first();
    const requirementsElement = $('.requirements, .job-requirements').first();
    
    const description = descriptionElement.text().trim();
    const requirements = requirementsElement.text().trim();
    
    // Extract salary information
    const salaryInfo = this.extractSalaryFromContent(html);
    
    // Extract company information
    const companyLinkElement = $('.company-link, .employer-link, a[href*="/company/"]').first();
    const companyWebsite = companyLinkElement.attr('href');
    const companyProfileUrl = companyWebsite?.startsWith('http') ? companyWebsite : `${this.baseUrl}${companyWebsite}`;
    
    // Extract benefits if available
    const benefitsElement = $('.benefits, .perks, .job-benefits');
    const benefits: string[] = [];
    benefitsElement.each((index, element) => {
      const benefitText = $(element).text().trim();
      if (benefitText) {
        benefits.push(benefitText);
      }
    });
    
    // Extract application deadline
    const deadlineElement = $('.deadline, .apply-until, .valid-until');
    const deadlineText = deadlineElement.text().trim();
    let applicationDeadline: Date | undefined;
    if (deadlineText) {
      try {
        applicationDeadline = new Date(deadlineText);
        if (isNaN(applicationDeadline.getTime())) {
          applicationDeadline = undefined;
        }
      } catch {
        applicationDeadline = undefined;
      }
    }
    
    return {
      description,
      requirements,
      benefits,
      rawHtml: html,
      companyProfileUrl,
      companyWebsite: companyProfileUrl,
      salaryInfo,
      applicationDeadline,
    };
  }


  private extractJobId(url: string): string | undefined {
    // Extract job ID from jobs.bg URL patterns
    // e.g., "https://www.jobs.bg/job/8102284" -> "8102284"
    const match = url.match(/\/job\/(\d+)/);
    return match ? match[1] : undefined;
  }

  private hasNextPage(html: string, currentPage: number): boolean {
    const $ = cheerio.load(html);
    
    // Look for pagination elements
    const nextButton = $('.pagination .next, .paging .next, [rel="next"]');
    if (nextButton.length > 0 && !nextButton.hasClass('disabled')) {
      return true;
    }
    
    // Look for page numbers
    const pageNumbers = $('.pagination a, .paging a').toArray().map(el => {
      const pageNum = parseInt($(el).text().trim(), 10);
      return isNaN(pageNum) ? 0 : pageNum;
    });
    
    return pageNumbers.some(num => num > currentPage);
  }

  /**
   * Enhanced DataDome and anti-bot protection detection
   * Fixed to prevent false positives from legitimate DataDome scripts in CSP headers
   */
  private isCaptchaOrBlocked(html: string): boolean {
    const indicators = [
      // DataDome specific blocking indicators (not just script references)
      'datadome.co/captcha',
      'dd.captcha-delivery.com',
      'captcha-delivery.com/interstitial',
      'geo.captcha-delivery.com',
      'DataDome Captcha',
      'DataDome Device Check',
      'Just a moment',
      'Verifying your browser',
      'dd_cookie_test',
      'Challenge solved',
      'DataDome protection',
      
      // Generic bot protection
      'Please complete the security check',
      'Access Denied',
      'captcha',
      'hcaptcha',
      'recaptcha',
      'Please verify you are a human',
      'Security Check',
      'Bot Protection',
      
      // CloudFlare
      'cloudflare',
      'cf-ray',
      'Please wait while we check your browser',
      
      // Generic blocking indicators
      'blocked',
      'forbidden',
      'rate limit',
    ];
    
    const htmlLower = html.toLowerCase();
    const hasIndicator = indicators.some(indicator => htmlLower.includes(indicator));
    
    // Improved minimal content detection
    const hasMinimalContent = html.length < 500 && 
      !htmlLower.includes('mdc-card') && 
      !htmlLower.includes('job');
    
    // Debug logging to help diagnose false positives
    if (hasIndicator || hasMinimalContent) {
      this.logger.debug(`Potential blocking detected: htmlLength=${html.length}, hasIndicator=${hasIndicator}, hasMinimalContent=${hasMinimalContent}`);
      if (hasIndicator) {
        const foundIndicators = indicators.filter(indicator => htmlLower.includes(indicator));
        this.logger.debug(`Found indicators: ${foundIndicators.join(', ')}`);
      }
    }
    
    return hasIndicator || hasMinimalContent;
  }

  private createEmptyResult(page: number, startTime: number, url: string): ScrapingResult {
    return {
      jobs: [],
      totalFound: 0,
      page,
      hasNextPage: false,
      errors: [],
      metadata: {
        processingTime: Date.now() - startTime,
        sourceUrl: url,
        requestCount: 1,
      },
    };
  }

  /**
   * Fetch page using mobile headful browser with extreme DataDome evasion
   */
  private async fetchWithStealthBrowser(url: string, options?: { infiniteScroll?: boolean, warmup?: boolean }) {
    try {
      this.logger.log('🔥 JOBS.BG EXTREME BYPASS MODE: Mobile + Headful + Ultra-Slow');
      
      // EXTREME DataDome bypass: Mobile + Headful + Ultra-slow timing
      const session = await this.browserEngine.getSession({
        siteName: 'jobs.bg',
        headless: false, // 🚨 HEADFUL BROWSER - Most important change!
        stealth: true,
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1', // Mobile user agent
        viewport: { width: 375, height: 667 }, // iPhone viewport
        loadImages: true,
        timeout: 120000, // 2 minutes timeout
      });
      
      // EXTREME MULTI-PHASE BYPASS STRATEGY
      this.logger.log('📱 Phase 1: Mobile homepage visit (building trust)');
      
      // Phase 1: Visit mobile homepage and simulate real mobile user
      await session.page.setExtraHTTPHeaders({
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'DNT': '1',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
      });
      
      const homepageResponse = await this.browserEngine.fetchPage('https://www.jobs.bg', session, {
        stealth: true,
        warmup: false
      });
      
      if (!homepageResponse.success) {
        this.logger.warn('Homepage failed, but continuing...');
      }
      
      // Phase 2: Simulate real mobile user behavior - scroll, wait, interact
      this.logger.log('📱 Phase 2: Simulating mobile user interactions');
      await session.page.evaluate(() => {
        // Mobile-like scrolling
        window.scrollTo(0, 100);
        setTimeout(() => window.scrollTo(0, 200), 500);
        setTimeout(() => window.scrollTo(0, 0), 1000);
      });
      
      // ULTRA-LONG WAIT - DataDome bypass
      this.logger.log('⏰ Phase 3: ULTRA-LONG WAIT (60+ seconds to build trust)');
      const ultraWait = 60000 + Math.random() * 30000; // 60-90 seconds
      this.logger.log(`Waiting ${Math.round(ultraWait/1000)} seconds...`);
      await session.page.waitForTimeout(ultraWait);
      
      // Phase 4: Navigate to job search with mobile headers
      this.logger.log('📱 Phase 4: Mobile job search navigation');
      await session.page.setExtraHTTPHeaders({
        'Referer': 'https://www.jobs.bg/',
        'Sec-Fetch-Site': 'same-origin',
        'Sec-Fetch-Mode': 'navigate', 
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-User': '?1',
        'Cache-Control': 'max-age=0',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      });

      // Phase 5: Final navigation with mobile stealth
      this.logger.log('📱 Phase 5: Final search page navigation');
      return await this.browserEngine.fetchPage(url, session, {
        ...options,
        stealth: true,
        warmup: false
      });
      
    } catch (error) {
      this.logger.error(`Stealth browser fetch failed: ${error.message}`);
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
   * Fallback to paid scraping service when free methods fail
   */
  private async scrapeWithPaidFallback(url: string, context: {
    page: number;
    limit?: number;
    keywords: string[];
    location?: string;
    experienceLevel?: string;
    startTime: number;
    totalRequestCount: number;
    lastError: string | null;
  }): Promise<ScrapingResult> {
    const { page, limit, startTime, totalRequestCount, lastError } = context;
    
    // Check if paid scraping is enabled and we have credits
    const requiredCredits = this.creditTrackerService.getCreditCost('jobs.bg', 'scraperapi');
    const hasCredits = await this.creditTrackerService.hasAvailableCredits('scraperapi', requiredCredits);
    
    if (!hasCredits) {
      const usagePercentage = await this.creditTrackerService.getUsagePercentage('scraperapi');
      throw new Error(`Insufficient ScraperAPI credits. Current usage: ${usagePercentage.toFixed(1)}%. Required: ${requiredCredits} credits.`);
    }
    
    this.logger.log(`💳 Using paid ScraperAPI (${requiredCredits} credits) for jobs.bg`);
    
    try {
      const paidOptions: PaidScrapingOptions = {
        url,
        siteName: 'jobs.bg',
        render: true,
        premium: true,
        countryCode: 'bg',
        timeout: 180000, // 3 minutes for DataDome challenges
      };
      
      const paidResponse = await this.paidScraperService.scrapeWithScraperAPI(paidOptions);
      
      if (!paidResponse.success || !paidResponse.html) {
        throw new Error(`ScraperAPI failed: ${paidResponse.error || 'No content received'}`);
      }
      
      // Track credit usage
      await this.creditTrackerService.trackUsage({
        service: 'scraperapi',
        site: 'jobs.bg',
        credits: paidResponse.credits,
        url,
        timestamp: new Date(),
        successful: true,
      });
      
      // Save response for debugging
      await this.saveResponseToFile(paidResponse.html, page, 'paid');
      
      // Parse jobs from the paid response
      const jobs = await this.parseJobsFromHtml(paidResponse.html, page);
      
      // Apply limit if specified
      const limitedJobs = limit && jobs.length > limit ? jobs.slice(0, limit) : jobs;
      
      // Check if there are more pages
      const hasNextPage = this.hasNextPage(paidResponse.html, page);
      
      this.logger.log(`✅ Paid scraping succeeded - found ${limitedJobs.length} jobs (${paidResponse.credits} credits used)`);
      
      return {
        jobs: limitedJobs,
        totalFound: limitedJobs.length,
        page,
        hasNextPage,
        errors: [],
        metadata: {
          processingTime: Date.now() - startTime,
          sourceUrl: url,
          requestCount: totalRequestCount + 1,
          scrapingMethod: 'paid',
          service: 'scraperapi',
          creditsUsed: paidResponse.credits,
          fallbackReason: lastError,
          paidProcessingTime: paidResponse.processingTime,
        },
      };
      
    } catch (error) {
      // Track failed credit usage
      await this.creditTrackerService.trackUsage({
        service: 'scraperapi',
        site: 'jobs.bg', 
        credits: 0, // No credits charged for failures
        url,
        timestamp: new Date(),
        successful: false,
      });
      
      throw error;
    }
  }
  
  /**
   * Sleep utility for retry delays
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Save raw HTML response to file for debugging
   */
  private async saveResponseToFile(html: string, page: number, method: string = 'free'): Promise<string> {
    try {
      const debugDir = './debug-responses';
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `jobs-bg-page-${page}-${method}-${timestamp}.html`;
      const filepath = join(debugDir, filename);
      
      // Ensure debug directory exists
      await fs.mkdir(debugDir, { recursive: true });
      
      // Save HTML content
      await fs.writeFile(filepath, html, 'utf-8');
      
      const absolutePath = join(process.cwd(), filepath);
      this.logger.log(`HTML response saved to: ${absolutePath}`);
      
      return absolutePath;
    } catch (error) {
      this.logger.warn(`Failed to save HTML response:`, error.message);
      return '';
    }
  }
}