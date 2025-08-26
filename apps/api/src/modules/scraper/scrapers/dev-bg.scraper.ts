import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as cheerio from 'cheerio';
import { BaseScraper } from './base.scraper';
import {
  JobListing,
  ScraperOptions,
  ScrapingResult,
  JobDetails,
} from '../interfaces/job-scraper.interface';
import { TranslationService } from '../services/translation.service';
import { JobParserService } from '../services/job-parser.service';
import { TechPatternService } from '../services/tech-pattern.service';
import { BrowserEngineService } from '../services/browser-engine.service';

/**
 * Dev.bg job scraper implementation
 * Refactored to extend BaseScraper for consistency
 */
@Injectable()
export class DevBgScraper extends BaseScraper {
  private readonly baseUrl: string;
  private readonly apiUrl: string;
  private readonly maxPages: number;

  constructor(
    configService: ConfigService,
    private readonly translationService: TranslationService,
    private readonly jobParserService: JobParserService,
    private readonly techPatternService: TechPatternService,
    browserEngine?: BrowserEngineService,
  ) {
    super(configService, 'dev.bg', browserEngine);
    
    // Load configuration using base class helper
    const config = this.loadScraperConfig('devBg');
    this.baseUrl = config.baseUrl || 'https://dev.bg';
    this.apiUrl = config.searchUrl || 'https://dev.bg/company/jobs/java/';
    this.maxPages = config.maxPages;
    
    this.logger.log('DevBgScraper constructor completed successfully');
  }

  async scrapeJobs(options: ScraperOptions = {}): Promise<ScrapingResult> {
    const { page = 1, limit } = options;
    const startTime = Date.now();
    
    this.logger.log(`Starting to scrape Java jobs from dev.bg - Page ${page}${limit ? ` (limit: ${limit})` : ''}`);
    
    try {
      const url = page === 1 ? this.apiUrl : `${this.apiUrl}page/${page}/`;
      this.logger.log(`Fetching HTML from: ${url}`);
      
      // Use smart fetching (HTTP first, browser on failure) for dev.bg
      const response = await this.fetchPage(url, { useBrowser: false });
      if (!response.success || !response.html) {
        this.logger.warn(`Failed to fetch HTML from dev.bg for page ${page}: ${response.error || 'No content'}`);
        return this.buildErrorResult(page, startTime, url, response.error || 'No content', 1);
      }

      const jobs = await this.parseJobsFromHtml(response.html, page);
      
      // Apply limit using base class helper
      const limitedJobs = this.applyJobLimit(jobs, limit);
      
      // Check if there are more pages
      const hasNextPage = this.hasNextPage(response.html, page);
      
      // Build result using base class helper
      return this.buildSuccessResult(limitedJobs, page, hasNextPage, startTime, url, 1);

    } catch (error) {
      this.logger.error(`Failed to scrape dev.bg jobs for page ${page}:`, error.message);
      return this.buildErrorResult(page, startTime, this.apiUrl, error.message, 1);
    }
  }

  async fetchJobDetails(jobUrl: string, companyName?: string): Promise<JobDetails> {
    try {
      this.logger.log(`Fetching job details from: ${jobUrl}`);
      
      // Use smart fetching for job details
      const response = await this.fetchPage(jobUrl, { useBrowser: false });
      
      if (!response.success || !response.html) {
        this.logger.warn(`Failed to fetch job details from ${jobUrl}: ${response.error || 'No content'}`);
        return this.buildEmptyJobDetails();
      }
      
      const jobDetails = this.jobParserService.parseJobDetailsFromHtml(response.html);
      const companyUrls = this.jobParserService.extractCompanyUrls(response.html, companyName);
      const salaryInfo = this.extractSalaryFromContent(response.html);
      
      return {
        description: this.translationService.translateJobTerms(jobDetails.description),
        requirements: this.translationService.translateJobTerms(jobDetails.requirements),
        rawHtml: response.html,
        companyProfileUrl: companyUrls.profileUrl,
        companyWebsite: companyUrls.website,
        salaryInfo,
      };

    } catch (error) {
      this.logger.warn(`Failed to fetch job details from ${jobUrl}:`, error.message);
      return this.buildEmptyJobDetails();
    }
  }

  getSiteConfig() {
    return {
      name: 'dev.bg',
      baseUrl: this.baseUrl,
      supportedLocations: ['Sofia', 'Plovdiv', 'Varna', 'Burgas', 'Remote'],
      supportedCategories: ['Java', 'JavaScript', 'Python', 'C#', '.NET', 'PHP'],
    };
  }

  canHandle(url: string): boolean {
    return url.includes('dev.bg');
  }

  /**
   * Scrape all pages until no more jobs found or max pages reached
   */
  async scrapeAllJavaJobs(): Promise<JobListing[]> {
    const allJobs: JobListing[] = [];
    let currentPage = 1;
    
    this.logger.log('Starting complete scrape of Java jobs from dev.bg');

    while (currentPage <= this.maxPages) {
      try {
        const result = await this.scrapeJobs({ page: currentPage });
        
        if (result.jobs.length === 0) {
          this.logger.log(`No more jobs found at page ${currentPage}, stopping scrape`);
          break;
        }

        allJobs.push(...result.jobs);
        this.logger.log(`Scraped ${result.jobs.length} jobs from page ${currentPage}, total: ${allJobs.length}`);
        
        if (!result.hasNextPage) {
          this.logger.log(`No more pages available after page ${currentPage}`);
          break;
        }
        
        currentPage++;
        await this.delay(this.siteConfig.requestDelay);
        
      } catch (error) {
        this.logger.error(`Error scraping page ${currentPage}:`, error.message);
        break;
      }
    }

    this.logger.log(`Completed scraping dev.bg. Total jobs found: ${allJobs.length}`);
    return allJobs;
  }

  private async parseJobsFromHtml(htmlTemplate: string, page: number): Promise<JobListing[]> {
    const jobs: JobListing[] = [];
    
    try {
      const $ = cheerio.load(htmlTemplate);
      const jobElements = $('.job-list-item');
      
      this.logger.log(`Found ${jobElements.length} job listings in HTML for page ${page}`);

      for (let i = 0; i < jobElements.length; i++) {
        const element = jobElements[i];
        try {
          const job = await this.processJobElement($, element);
          if (job) {
            jobs.push(job);
          }
        } catch (error) {
          this.logger.warn(`Failed to parse job listing ${i + 1}:`, error.message);
        }
      }

    } catch (error) {
      this.logger.error('Failed to parse jobs from HTML:', error.message);
    }

    return jobs;
  }

  private async processJobElement($: cheerio.CheerioAPI, element: any): Promise<JobListing | null> {
    // Parse raw data using JobParserService
    const rawJobData = this.jobParserService.parseJobFromElement($, element);
    if (!rawJobData) {
      return null;
    }

    // Extract location and work model from badge text
    const location = this.translationService.parseLocationFromBadge(rawJobData.badgeText);
    const workModel = this.normalizeWorkModel(this.translationService.parseWorkModelFromBadge(rawJobData.badgeText));

    // Extract technologies from multiple sources
    const imageTechs = this.techPatternService.extractTechnologiesFromImageTitles(rawJobData.techImageTitles);
    const textTechs = this.techPatternService.extractTechnologiesFromText(rawJobData.fullJobText);
    const technologies = this.techPatternService.combineTechnologies(textTechs, imageTechs);

    // Determine posted date
    const postedDate = this.determinePostedDate(rawJobData);

    return {
      title: this.translationService.translateJobTerms(rawJobData.title),
      company: this.normalizeCompanyName(this.translationService.translateJobTerms(rawJobData.company)),
      location,
      workModel,
      technologies,
      salaryRange: rawJobData.salaryRange,
      postedDate,
      url: rawJobData.url,
      originalJobId: this.extractJobId(rawJobData.url),
      sourceSite: 'dev.bg',
      description: '',
      requirements: '',
      experienceLevel: 'not_specified', // Will be enhanced by AI extraction
      employmentType: 'full-time', // Default for dev.bg
    };
  }

  private determinePostedDate(rawJobData: any): Date {
    if (rawJobData.timeElement?.datetime) {
      return new Date(rawJobData.timeElement.datetime);
    }

    // Look for Bulgarian date patterns in the job text
    const bulgariandateStr = this.jobParserService.findBulgarianDateInText(rawJobData.fullJobText);
    if (bulgariandateStr) {
      return this.translationService.parseBulgarianDate(bulgariandateStr);
    }

    return new Date(); // fallback to current date
  }

  private extractJobId(url: string): string | undefined {
    // Extract job ID from dev.bg URL patterns
    // e.g., "https://dev.bg/company/jobads/ukg-senior-java-developer/" -> "ukg-senior-java-developer"
    const match = url.match(/\/jobads\/([^/]+)\/?$/);
    return match ? match[1] : undefined;
  }

  private hasNextPage(html: string, currentPage: number): boolean {
    // Check if there's a next page by looking for pagination elements
    const $ = cheerio.load(html);
    
    // Look for "next" button or page numbers higher than current
    const nextButton = $('.pagination .next, .pagination [rel="next"]');
    if (nextButton.length > 0) return true;
    
    // Look for page numbers
    const pageNumbers = $('.pagination a').toArray().map(el => {
      const pageNum = parseInt($(el).text().trim(), 10);
      return isNaN(pageNum) ? 0 : pageNum;
    });
    
    return pageNumbers.some(num => num > currentPage);
  }

}