import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BaseScraper } from './base.scraper';
import {
  ScraperOptions,
  ScrapingResult,
  JobDetails,
} from '../interfaces/job-scraper.interface';
import { BrowserEngineService } from '../services/browser-engine.service';
import { ScrapingOrchestratorService, ScrapingContext, ScrapingStrategy } from '../services/scraping-orchestrator.service';
import { AntiBypassService } from '../services/anti-bypass.service';
import { JobsBgParsingService } from '../services/jobs-bg-parsing.service';
import { CreditTrackerService } from '../services/credit-tracker.service';

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
    private readonly scrapingOrchestrator: ScrapingOrchestratorService,
    private readonly antiBypass: AntiBypassService,
    private readonly parsingService: JobsBgParsingService,
    private readonly creditTrackerService: CreditTrackerService,
  ) {
    super(configService, 'jobs.bg', browserEngine);
    
    // Load configuration using base class helper
    const config = this.loadScraperConfig('jobsBg');
    this.baseUrl = config.baseUrl || 'https://www.jobs.bg';
    this.searchUrl = config.searchUrl || 'https://www.jobs.bg/en/front_job_search.php';
    this.maxPages = config.maxPages;
    
    this.logger.log('JobsBgScraper initialized successfully');
  }


  async scrapeJobs(options: ScraperOptions = {}): Promise<ScrapingResult> {
    const { page = 1, limit, keywords = ['Java'], location, experienceLevel } = options;
    const startTime = Date.now();
    
    this.logger.log(`Starting to scrape jobs from jobs.bg - Page ${page}${limit ? ` (limit: ${limit})` : ''}`);
    
    const url = this.buildSearchUrl(page, keywords, location, experienceLevel);
    this.logger.log(`Target URL: ${url}`);
    
    // Create scraping context
    const context: ScrapingContext = {
      url,
      siteName: 'jobs.bg',
      page,
      startTime,
      totalRequestCount: 0,
      lastError: null,
      metadata: { keywords, location, experienceLevel }
    };

    // Create free scraping strategy
    const freeStrategy: ScrapingStrategy = {
      name: 'jobs.bg-stealth-browser',
      execute: async (ctx) => {
        return await this.antiBypass.executeJobsBgBypass(ctx.url, { infiniteScroll: true, warmup: false });
      }
    };

    try {
      // Execute with orchestrated retry and fallback
      const response = await this.scrapingOrchestrator.executeWithFallback(
        context,
        freeStrategy,
        {
          enablePaidFallback: true,
          isBlockedChecker: (html) => this.antiBypass.isContentBlocked(html)
        }
      );

      // Save raw HTML response to file for debugging
      if (response.html) {
        await this.parsingService.saveResponseToFile(response.html, page, response.metadata?.service || 'free');
      }

      if (!response.success || !response.html) {
        throw new Error(response.error || 'No content received');
      }

      // Parse jobs using dedicated service
      const jobs = await this.parsingService.parseJobsFromHtml(response.html, page, this.baseUrl);
      
      // Apply limit using base class helper
      const limitedJobs = this.applyJobLimit(jobs, limit);
      
      // Check if there are more pages
      const hasNextPage = this.parsingService.hasNextPage(response.html, page);
      
      this.logger.log(`✅ Scraping succeeded - found ${limitedJobs.length} jobs`);
      
      // Build result using base class helper
      return this.buildSuccessResult(
        limitedJobs,
        page,
        hasNextPage,
        startTime,
        url,
        context.totalRequestCount + 1,
        {
          scrapingMethod: response.metadata?.service || 'free',
          ...(response.metadata || {})
        }
      );

    } catch (error) {
      this.logger.error(`Scraping failed: ${error.message}`);
      
      // Build error result using base class helper
      return this.buildErrorResult(page, startTime, url, error.message, context.totalRequestCount);
    }
  }

  async fetchJobDetails(jobUrl: string, _companyName?: string): Promise<JobDetails> {
    try {
      this.logger.log(`Fetching job details from: ${jobUrl}`);
      
      // Create scraping context for job details
      const context: ScrapingContext = {
        url: jobUrl,
        siteName: 'jobs.bg',
        page: 1,
        startTime: Date.now(),
        totalRequestCount: 0,
        lastError: null,
      };

      // Create free scraping strategy for job details
      const freeStrategy: ScrapingStrategy = {
        name: 'jobs.bg-job-details',
        execute: async (ctx) => {
          return await this.fetchPage(ctx.url, { forceBrowser: true });
        }
      };

      // Execute with orchestrated fallback
      const response = await this.scrapingOrchestrator.executeWithFallback(
        context,
        freeStrategy,
        {
          enablePaidFallback: true,
          isBlockedChecker: (html) => this.antiBypass.isContentBlocked(html)
        }
      );
      
      if (!response.success || !response.html) {
        this.logger.warn(`Failed to fetch job details from ${jobUrl}: ${response.error || 'No content'}`);
        return this.buildEmptyJobDetails();
      }
      
      return this.parsingService.parseJobDetailsFromHtml(response.html, jobUrl, this.baseUrl);

    } catch (error) {
      this.logger.warn(`Failed to fetch job details from ${jobUrl}:`, error.message);
      return this.buildEmptyJobDetails();
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
    
    // Add submit parameter for better compatibility
    params.append('subm', '1');
    
    // Add categories - using Java category 56 based on user's example
    if (keywords.includes('Java')) {
      params.append('categories[]', '56');
    }
    
    // Add technologies with empty bracket format to match working curl
    keywords.forEach((keyword) => {
      params.append('techs[]', keyword);
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









}