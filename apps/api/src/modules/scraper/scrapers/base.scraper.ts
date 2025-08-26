import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import {
  IJobScraper,
  ScraperOptions,
  ScrapingResult,
  JobDetails,
} from '../interfaces/job-scraper.interface';
import {
  BrowserSessionConfig,
  BrowserScrapingResponse,
  IBrowserSession,
} from '../interfaces/browser-scraper.interface';
import { BrowserEngineService } from '../services/browser-engine.service';
import { ScraperConfigHelper } from '../utils/config.helper';

/**
 * Abstract base class for all job scrapers
 * Provides modern browser-based scraping with stealth capabilities
 */
@Injectable()
export abstract class BaseScraper implements IJobScraper {
  protected readonly logger = new Logger(this.constructor.name);
  
  // Common configuration
  protected readonly siteConfig: ReturnType<typeof ScraperConfigHelper.getSiteConfig>;
  
  // Browser session for this scraper
  protected browserSession: IBrowserSession | null = null;
  
  constructor(
    protected readonly configService: ConfigService,
    protected readonly siteName: string,
    protected readonly browserEngine?: BrowserEngineService,
  ) {
    // Load configuration using centralized helper
    this.siteConfig = ScraperConfigHelper.getSiteConfig(configService, siteName);
    
    // Validate essential configuration
    ScraperConfigHelper.validateSiteConfiguration(configService, siteName);
  }

  /**
   * Load common scraper configuration from config service
   */
  protected loadScraperConfig(siteKey: string): {
    baseUrl: string;
    searchUrl: string;
    maxPages: number;
  } {
    const baseUrl = this.configService.get<string>(`scraper.${siteKey}.baseUrl`) || 
                   this.configService.get<string>(`scraper.sites.${siteKey}.baseUrl`);
    const searchUrl = this.configService.get<string>(`scraper.${siteKey}.apiUrl`) ||
                     this.configService.get<string>(`scraper.${siteKey}.searchUrl`) ||
                     this.configService.get<string>(`scraper.sites.${siteKey}.searchUrl`);
    const maxPages = this.configService.get<number>(`scraper.${siteKey}.maxPages`) ||
                    this.configService.get<number>(`scraper.sites.${siteKey}.maxPages`, 10);
    
    return { baseUrl, searchUrl, maxPages };
  }


  /**
   * Abstract methods that must be implemented by concrete scrapers
   */
  abstract scrapeJobs(options?: ScraperOptions): Promise<ScrapingResult>;
  abstract fetchJobDetails(jobUrl: string, companyName?: string): Promise<JobDetails>;
  abstract getSiteConfig(): { name: string; baseUrl: string; supportedLocations: string[]; supportedCategories: string[] };
  abstract canHandle(url: string): boolean;

  /**
   * Apply job limit and log if limiting occurs
   */
  protected applyJobLimit(jobs: any[], limit?: number): any[] {
    if (!limit || jobs.length <= limit) {
      return jobs;
    }
    
    this.logger.log(`Limiting results to ${limit} jobs (found ${jobs.length})`);
    return jobs.slice(0, limit);
  }

  /**
   * Build successful scraping result
   */
  protected buildSuccessResult(
    jobs: any[],
    page: number,
    hasNextPage: boolean,
    startTime: number,
    sourceUrl: string,
    requestCount: number = 1,
    extraMetadata: any = {}
  ): ScrapingResult {
    return {
      jobs,
      totalFound: jobs.length,
      page,
      hasNextPage,
      errors: [],
      metadata: {
        processingTime: Date.now() - startTime,
        sourceUrl,
        requestCount,
        ...extraMetadata,
      },
    };
  }

  /**
   * Build error scraping result
   */
  protected buildErrorResult(
    page: number,
    startTime: number,
    sourceUrl: string,
    error: string,
    requestCount: number = 1
  ): ScrapingResult {
    return {
      jobs: [],
      totalFound: 0,
      page,
      hasNextPage: false,
      errors: [error],
      metadata: {
        processingTime: Date.now() - startTime,
        sourceUrl,
        requestCount,
      },
    };
  }

  /**
   * Build empty job details for error cases
   */
  protected buildEmptyJobDetails(): JobDetails {
    return { 
      description: '', 
      requirements: '',
      rawHtml: '',
    };
  }
  
  /**
   * Protected methods for concrete scrapers to use
   */
  
  /**
   * Fetch page using modern browser automation with smart fallback
   */
  protected async fetchPage(url: string, options: { useBrowser?: boolean; forceBrowser?: boolean } = {}): Promise<BrowserScrapingResponse> {
    const startTime = Date.now();
    const { useBrowser = true, forceBrowser = false } = options;
    
    // Try HTTP first if fallback is enabled and not forced to use browser
    if (!forceBrowser && this.siteConfig.useHttpFallback && !useBrowser) {
      try {
        this.logger.debug(`Trying HTTP request first for: ${url}`);
        const httpResponse = await this.makeHttpRequest(url);
        
        // Convert HTTP response to browser response format
        return {
          html: httpResponse.data,
          finalUrl: httpResponse.request?.responseURL || url,
          status: httpResponse.status,
          headers: httpResponse.headers,
          success: true,
          loadTime: Date.now() - startTime,
          cookies: [], // HTTP requests don't maintain cookies automatically
        };
        
      } catch (error) {
        // If HTTP fails with 403/429, automatically try browser
        if (error.response?.status === 403 || error.response?.status === 429) {
          this.logger.warn(`HTTP request blocked (${error.response.status}), falling back to browser automation`);
          return this.fetchWithBrowser(url);
        }
        
        // For other HTTP errors, still try browser if browser engine is available
        if (this.browserEngine) {
          this.logger.warn(`HTTP request failed (${error.message}), falling back to browser automation`);
          return this.fetchWithBrowser(url);
        }
        
        throw error;
      }
    }
    
    // Use browser automation
    return this.fetchWithBrowser(url);
  }
  
  /**
   * Fetch page using browser automation
   */
  protected async fetchWithBrowser(url: string, options?: { infiniteScroll?: boolean }): Promise<BrowserScrapingResponse> {
    if (!this.browserEngine) {
      throw new Error('Browser engine not available for browser-based scraping');
    }
    
    try {
      // Get or create browser session
      if (!this.browserSession) {
        const sessionConfig: BrowserSessionConfig = {
          siteName: this.siteName,
          headless: this.configService.get<boolean>('scraper.browser.headless', true),
          timeout: this.siteConfig.requestTimeout,
          userAgent: this.siteConfig.userAgent,
          loadImages: this.configService.get<boolean>('scraper.browser.loadImages', false),
          stealth: this.configService.get<boolean>('scraper.browser.stealth', true),
        };
        
        this.browserSession = await this.browserEngine.getSession(sessionConfig);
        this.logger.debug(`Created browser session for ${this.siteName}`);
      }
      
      return await this.browserEngine.fetchPage(url, this.browserSession, options);
      
    } catch (error) {
      this.logger.error(`Browser fetch failed for ${url}:`, error.message);
      
      // If browser session fails, try to rotate it
      if (this.browserSession) {
        try {
          this.browserSession = await this.browserEngine.rotateSession(this.browserSession.id);
          this.logger.debug(`Rotated browser session for ${this.siteName}`);
          
          // Retry with new session
          return await this.browserEngine.fetchPage(url, this.browserSession, options);
        } catch (rotateError) {
          this.logger.error(`Session rotation failed:`, rotateError.message);
        }
      }
      
      throw error;
    }
  }
  
  /**
   * Legacy HTTP request method for fallback
   * @deprecated Use fetchPage() instead
   */
  protected async makeHttpRequest(url: string, options: any = {}): Promise<any> {
    // This is a simplified HTTP implementation for fallback
    // Will be removed once all scrapers are migrated to browser-first approach
    
    let lastError: Error;
    
    for (let attempt = 1; attempt <= this.siteConfig.maxRetries; attempt++) {
      try {
        this.logger.debug(`Making HTTP request to ${url} (attempt ${attempt}/${this.siteConfig.maxRetries})`);
        
        const response = await axios.get(url, {
          headers: {
            'User-Agent': this.siteConfig.userAgent,
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.5',
            'Accept-Encoding': 'gzip, deflate, br',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1',
            ...options.headers,
          },
          timeout: this.siteConfig.requestTimeout,
          ...options,
        });
        
        // Rate limiting: wait between requests
        if (attempt < this.siteConfig.maxRetries) {
          await this.delay(this.siteConfig.requestDelay);
        }
        
        return response;
        
      } catch (error) {
        lastError = error;
        this.logger.warn(`HTTP request attempt ${attempt} failed for ${url}:`, error.message);
        
        // If it's a rate limiting error, wait longer
        if (error.response?.status === 429) {
          const waitTime = this.siteConfig.requestDelay * Math.pow(2, attempt); // Exponential backoff
          this.logger.warn(`Rate limited, waiting ${waitTime}ms before retry`);
          await this.delay(waitTime);
        } else if (attempt < this.siteConfig.maxRetries) {
          // Regular retry delay
          await this.delay(this.siteConfig.requestDelay * attempt);
        }
      }
    }
    
    throw new Error(`Failed to fetch ${url} after ${this.siteConfig.maxRetries} attempts: ${lastError.message}`);
  }
  
  /**
   * Extract salary information from text content
   * Common patterns across job sites
   */
  protected extractSalaryFromContent(content: string): { min?: number; max?: number; currency?: string } | undefined {
    try {
      // Remove HTML tags to get plain text
      const text = content.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');
      
      // Common salary patterns across different sites
      const patterns = [
        // Range patterns: "4,500 - 9,500 BGN", "€50,000-€60,000", "$80K-$120K"
        /([€$£¥₹]?)(\d+[\s,\d]*)\s*[-–~]\s*([€$£¥₹]?)(\d+[\s,\d]*)\s*([A-Z]{3}|лв|лева|€|$|£|K|k)?/gi,
        
        // Single value patterns: "Up to $120,000", "до 9500 лв", "Starting at €45K"
        /(up\s+to|до|starting\s+at|from)\s+([€$£¥₹]?)(\d+[\s,\d]*)\s*([A-Z]{3}|лв|лева|€|$|£|K|k)?/gi,
        
        // Bulgarian patterns: "От 5000 до 8000 лв"
        /от\s+(\d+[\s,\d]*)\s+до\s+(\d+[\s,\d]*)\s*(лв|лева|BGN)/gi,
        
        // Monthly/yearly indicators: "€50K/year", "3000 лв месечно"
        /([€$£¥₹]?)(\d+[\s,\d]*)\s*([A-Z]{3}|лв|лева|€|$|£|K|k)?\s*(\/year|\/month|monthly|yearly|месечно|годишно)/gi,
      ];

      for (const pattern of patterns) {
        const match = pattern.exec(text);
        if (match) {
          let salaryMin: number | undefined;
          let salaryMax: number | undefined;
          let currency = 'BGN'; // Default to BGN for Bulgarian sites
          
          // Parse different match groups based on pattern
          if (match[2] && match[4]) {
            // Range pattern
            salaryMin = this.parseNumber(match[2]);
            salaryMax = this.parseNumber(match[4]);
            
            // Determine currency from symbols or suffix
            const currencySymbol = match[1] || match[3] || match[5];
            currency = this.parseCurrency(currencySymbol);
            
            // Handle K/k multipliers
            if (match[5]?.toLowerCase().includes('k')) {
              salaryMin = salaryMin ? salaryMin * 1000 : undefined;
              salaryMax = salaryMax ? salaryMax * 1000 : undefined;
            }
          } else if (match[3]) {
            // Single value pattern (up to, from, etc.)
            const value = this.parseNumber(match[3]);
            if (match[1].toLowerCase().includes('up to') || match[1].includes('до')) {
              salaryMax = value;
            } else {
              salaryMin = value;
            }
            currency = this.parseCurrency(match[2] || match[4]);
            
            if (match[4]?.toLowerCase().includes('k')) {
              salaryMin = salaryMin ? salaryMin * 1000 : undefined;
              salaryMax = salaryMax ? salaryMax * 1000 : undefined;
            }
          }

          if (salaryMin || salaryMax) {
            this.logger.debug(`Extracted salary: ${salaryMin || 'N/A'} - ${salaryMax || 'N/A'} ${currency}`);
            return { min: salaryMin, max: salaryMax, currency };
          }
        }
      }

      return undefined;
    } catch (error) {
      this.logger.warn('Error extracting salary information:', error.message);
      return undefined;
    }
  }
  
  /**
   * Parse number from string, handling thousands separators
   */
  private parseNumber(str: string): number {
    return parseInt(str.replace(/[\s,]/g, ''), 10);
  }
  
  /**
   * Parse currency from symbol or text
   */
  private parseCurrency(currencyStr?: string): string {
    if (!currencyStr) return 'BGN';
    
    const normalized = currencyStr.toLowerCase().trim();
    
    if (normalized.includes('€') || normalized === 'eur') return 'EUR';
    if (normalized.includes('$') || normalized === 'usd') return 'USD';
    if (normalized.includes('£') || normalized === 'gbp') return 'GBP';
    if (normalized.includes('лв') || normalized.includes('лева') || normalized === 'bgn') return 'BGN';
    
    // If it looks like a currency code, return it uppercase
    if (normalized.match(/^[a-z]{3}$/)) return normalized.toUpperCase();
    
    return 'BGN'; // Default
  }
  
  /**
   * Normalize work model strings across different sites
   */
  protected normalizeWorkModel(workModel: string): string {
    if (!workModel) return 'not_specified';
    
    const normalized = workModel.toLowerCase().trim();
    
    if (normalized.includes('remote') || normalized.includes('дистанционно')) return 'remote';
    if (normalized.includes('hybrid') || normalized.includes('хибридно') || normalized.includes('смесено')) return 'hybrid';
    if (normalized.includes('office') || normalized.includes('офис') || normalized.includes('на място')) return 'office';
    
    return 'not_specified';
  }
  
  /**
   * Normalize experience level across different sites
   */
  protected normalizeExperienceLevel(level: string): string {
    if (!level) return 'not_specified';
    
    const normalized = level.toLowerCase().trim();
    
    if (normalized.includes('junior') || normalized.includes('начинаещ')) return 'junior';
    if (normalized.includes('senior') || normalized.includes('старши')) return 'senior';
    if (normalized.includes('lead') || normalized.includes('ръководител')) return 'lead';
    if (normalized.includes('principal') || normalized.includes('главен')) return 'principal';
    if (normalized.includes('mid') || normalized.includes('middle') || normalized.includes('средно')) return 'mid';
    if (normalized.includes('entry') || normalized.includes('стажант')) return 'entry';
    
    return 'not_specified';
  }
  
  /**
   * Normalize employment type across different sites
   */
  protected normalizeEmploymentType(type: string): string {
    if (!type) return 'full-time';
    
    const normalized = type.toLowerCase().trim();
    
    if (normalized.includes('part') || normalized.includes('частично')) return 'part-time';
    if (normalized.includes('contract') || normalized.includes('договор')) return 'contract';
    if (normalized.includes('intern') || normalized.includes('стаж')) return 'internship';
    if (normalized.includes('freelance') || normalized.includes('свободна практика')) return 'freelance';
    
    return 'full-time';
  }
  
  /**
   * Clean and normalize company name
   */
  protected normalizeCompanyName(name: string): string {
    if (!name) return name;
    
    return name
      .trim()
      .replace(/\s+/g, ' ') // Multiple spaces to single
      .replace(/[""]/g, '"') // Normalize quotes
      .replace(/^["']|["']$/g, ''); // Remove surrounding quotes
  }
  
  /**
   * Delay execution for rate limiting
   */
  protected delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  /**
   * Parse posted date from various formats
   */
  protected parsePostedDate(dateStr: string): Date {
    if (!dateStr) return new Date();
    
    const normalized = dateStr.toLowerCase().trim();
    const now = new Date();
    
    // Handle relative dates
    if (normalized.includes('today') || normalized.includes('днес')) {
      return now;
    }
    
    if (normalized.includes('yesterday') || normalized.includes('вчера')) {
      return new Date(now.getTime() - 24 * 60 * 60 * 1000);
    }
    
    // Handle "X days/weeks/months ago" patterns
    const relativeMatch = normalized.match(/(\d+)\s*(day|week|month|hour|ден|седмица|месец|час)/);
    if (relativeMatch) {
      const amount = parseInt(relativeMatch[1], 10);
      const unit = relativeMatch[2];
      
      let multiplier = 1;
      if (unit.includes('hour') || unit.includes('час')) multiplier = 60 * 60 * 1000;
      else if (unit.includes('day') || unit.includes('ден')) multiplier = 24 * 60 * 60 * 1000;
      else if (unit.includes('week') || unit.includes('седмица')) multiplier = 7 * 24 * 60 * 60 * 1000;
      else if (unit.includes('month') || unit.includes('месец')) multiplier = 30 * 24 * 60 * 60 * 1000;
      
      return new Date(now.getTime() - (amount * multiplier));
    }
    
    // Try to parse as ISO date
    try {
      const parsed = new Date(dateStr);
      if (!isNaN(parsed.getTime())) {
        return parsed;
      }
    } catch {
      // Fall through to default
    }
    
    // Default to current date
    return now;
  }
  
  /**
   * Extract technologies from job text using common patterns
   */
  protected extractTechnologies(text: string): string[] {
    if (!text) return [];
    
    const commonTechs = [
      // Programming languages
      'Java', 'JavaScript', 'TypeScript', 'Python', 'C#', 'C++', 'PHP', 'Ruby', 'Go', 'Rust', 'Kotlin', 'Swift',
      
      // Web technologies
      'React', 'Vue', 'Angular', 'HTML', 'CSS', 'Node.js', 'Express', 'Next.js', 'Nuxt.js',
      
      // Backend frameworks
      'Spring', 'Spring Boot', 'Django', 'Flask', 'Laravel', 'ASP.NET', '.NET', 'Rails',
      
      // Databases
      'MySQL', 'PostgreSQL', 'MongoDB', 'Redis', 'Oracle', 'SQL Server', 'SQLite', 'Elasticsearch',
      
      // Cloud & DevOps
      'AWS', 'Azure', 'GCP', 'Docker', 'Kubernetes', 'Jenkins', 'GitLab', 'GitHub', 'CI/CD',
      
      // Tools
      'Git', 'Jira', 'Maven', 'Gradle', 'npm', 'Webpack', 'Babel'
    ];
    
    const found = new Set<string>();
    const textUpper = text.toUpperCase();
    
    commonTechs.forEach(tech => {
      if (textUpper.includes(tech.toUpperCase())) {
        found.add(tech);
      }
    });
    
    return Array.from(found);
  }
}