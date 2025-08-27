import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../common/database/prisma.service';
import { VacancyService } from '../vacancy/vacancy.service';
import { CompanyService } from '../company/company.service';
import { ScraperRegistryService } from './services/scraper-registry.service';
import { 
  ScraperOptions, 
  JobListing,
  ScrapingResult 
} from './interfaces/job-scraper.interface';

export interface EnhancedScrapingOptions extends ScraperOptions {
  sites?: string[]; // Specific sites to scrape
  enableAiExtraction?: boolean;
  enableCompanyAnalysis?: boolean;
  force?: boolean;
}

export interface EnhancedScrapingResult {
  totalJobsFound: number;
  newVacancies: number;
  updatedVacancies: number;
  newCompanies: number;
  sitesScraped: string[];
  siteResults: Record<string, ScrapingResult>;
  errors: string[];
  duration: number;
}

export interface ScrapingStats {
  totalVacancies: number;
  activeVacancies: number;
  totalCompanies: number;
  siteCounts: Record<string, number>;
  lastScrapedAt: string | null;
}

/**
 * Simplified scraper service that supports multiple job sites
 * using the scraper registry directly
 */
@Injectable()
export class ScraperService {
  private readonly logger = new Logger(ScraperService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly scraperRegistry: ScraperRegistryService,
    private readonly vacancyService: VacancyService,
    private readonly companyService: CompanyService,
    private readonly prisma: PrismaService,
    @InjectQueue('scraper') private readonly scraperQueue: Queue,
  ) {
    this.logger.log('Simplified ScraperService initialized');
  }

  /**
   * Scrape jobs from all enabled sites or specific sites
   */
  async scrapeAllSites(options: EnhancedScrapingOptions = {}): Promise<EnhancedScrapingResult> {
    this.logger.log('Starting multi-site scraping process');
    
    const { 
      sites,
      enableAiExtraction = true, 
      enableCompanyAnalysis = true,
      force = false,
      ...scraperOptions 
    } = options;

    const startTime = Date.now();
    this.logger.log(`Starting scraping process for sites: ${sites?.join(', ') || 'all enabled'}`);

    const result: EnhancedScrapingResult = {
      totalJobsFound: 0,
      newVacancies: 0,
      updatedVacancies: 0,
      newCompanies: 0,
      sitesScraped: [],
      siteResults: {},
      errors: [],
      duration: 0,
    };

    try {
      // Determine which sites to scrape
      const sitesToScrape = sites || this.scraperRegistry.getEnabledSiteNames();
      this.logger.log(`Scraping sites: ${sitesToScrape.join(', ')}`);

      // Scrape each site
      for (const siteName of sitesToScrape) {
        try {
          this.logger.log(`Starting scrape for site: ${siteName}`);
          
          const scraper = this.scraperRegistry.getScraper(siteName);
          if (!scraper) {
            result.errors.push(`No scraper found for site: ${siteName}`);
            continue;
          }

          const siteResult = await scraper.scrapeJobs(scraperOptions);
          result.siteResults[siteName] = siteResult;
          result.totalJobsFound += siteResult.totalFound;
          result.sitesScraped.push(siteName);

          if (siteResult.errors.length > 0) {
            result.errors.push(...siteResult.errors.map(error => `${siteName}: ${error}`));
          }

          this.logger.log(`Completed scrape for ${siteName}: ${siteResult.totalFound} jobs found`);

          // Process jobs for database storage
          if (siteResult.jobs.length > 0) {
            const processed = await this.processJobsFromSite(
              siteResult.jobs,
              siteName,
              { enableAiExtraction, enableCompanyAnalysis, force }
            );

            result.newVacancies += processed.newVacancies;
            result.updatedVacancies += processed.updatedVacancies;
            result.newCompanies += processed.newCompanies;
          }

        } catch (error) {
          this.logger.error(`Failed to scrape ${siteName}:`, error);
          result.errors.push(`${siteName}: ${error.message}`);
        }
      }

    } catch (error) {
      this.logger.error('Failed to scrape multiple sites:', error);
      result.errors.push(`Scraping failed: ${error.message}`);
    }

    result.duration = Date.now() - startTime;
    
    this.logger.log(`Scraping completed in ${result.duration}ms. ` +
      `Found: ${result.totalJobsFound}, New: ${result.newVacancies}, ` +
      `Updated: ${result.updatedVacancies}`);

    return result;
  }

  /**
   * Scrape a specific site
   */
  async scrapeSite(siteName: string, options: EnhancedScrapingOptions = {}): Promise<EnhancedScrapingResult> {
    return this.scrapeAllSites({ ...options, sites: [siteName] });
  }

  /**
   * Legacy method for dev.bg scraping (backwards compatibility)
   */
  async scrapeDevBg(options: EnhancedScrapingOptions = {}): Promise<EnhancedScrapingResult> {
    return this.scrapeSite('dev.bg', options);
  }

  /**
   * Process jobs from a specific site
   */
  private async processJobsFromSite(
    jobs: JobListing[],
    siteName: string,
    options: {
      enableAiExtraction?: boolean;
      enableCompanyAnalysis?: boolean;
      force?: boolean;
    }
  ): Promise<{
    newVacancies: number;
    updatedVacancies: number;
    newCompanies: number;
  }> {
    const { enableCompanyAnalysis } = options;

    let processed = 0;
    let newVacancies = 0;
    let updatedVacancies = 0;
    const newCompanies = 0;

    for (const job of jobs) {
      try {
        // Basic company handling
        let companyId: string | null = null;
        if (enableCompanyAnalysis && job.company) {
          // Use findOrCreate method from CompanyService
          const company = await this.companyService.findOrCreate({
            name: job.company,
            website: job.companyWebsite || null,
            location: job.location,
          });
          companyId = company.id;
          // Note: we can't easily track if it's new without checking the result
        }

        // Check if vacancy already exists by URL
        const existingVacancy = await this.prisma.vacancy.findFirst({
          where: { sourceUrl: job.url }
        });
        
        if (existingVacancy) {
          // Update existing vacancy
          await this.prisma.vacancy.update({
            where: { id: existingVacancy.id },
            data: {
              title: job.title,
              description: job.description,
              requirements: job.requirements,
              benefits: job.benefits,
              location: job.location,
              experienceLevel: job.experienceLevel,
              employmentType: job.employmentType,
              technologies: job.technologies,
              companyId,
              updatedAt: new Date(),
            }
          });
          updatedVacancies++;
        } else {
          // Create new vacancy
          await this.vacancyService.create({
            title: job.title,
            description: job.description,
            requirements: job.requirements,
            benefits: job.benefits,
            sourceUrl: job.url,
            sourceSite: siteName,
            location: job.location,
            experienceLevel: job.experienceLevel,
            employmentType: job.employmentType,
            technologies: job.technologies || [],
            companyId,
            status: 'active',
          });
          newVacancies++;
        }

        processed++;

        if (processed % 10 === 0) {
          this.logger.debug(`Processed ${processed}/${jobs.length} jobs from ${siteName}`);
        }

      } catch (error) {
        this.logger.error(`Failed to process job "${job.title}" from ${siteName}:`, error);
      }
    }

    this.logger.log(`Processed ${processed} jobs from ${siteName}: ${newVacancies} new, ${updatedVacancies} updated, ${newCompanies} new companies`);

    return {
      newVacancies,
      updatedVacancies,
      newCompanies,
    };
  }

  /**
   * Get scraping statistics
   */
  async getStats(): Promise<ScrapingStats> {
    const totalVacancies = await this.prisma.vacancy.count();
    const activeVacancies = await this.prisma.vacancy.count({
      where: { status: 'active' }
    });
    const totalCompanies = await this.prisma.company.count();

    const siteCounts = await this.prisma.vacancy.groupBy({
      by: ['sourceSite'],
      _count: { sourceSite: true },
    });

    const lastScraped = await this.prisma.vacancy.findFirst({
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    });

    return {
      totalVacancies,
      activeVacancies,
      totalCompanies,
      siteCounts: siteCounts.reduce((acc, item) => {
        if (item.sourceSite) {
          acc[item.sourceSite] = item._count.sourceSite;
        }
        return acc;
      }, {} as Record<string, number>),
      lastScrapedAt: lastScraped?.createdAt?.toISOString() || null,
    };
  }
}