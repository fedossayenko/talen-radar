/**
 * Common interface for all job scrapers
 * This ensures consistency across different job sites
 */

export interface JobListing {
  // Basic job information
  title: string;
  company: string;
  location: string;
  workModel: string; // remote/hybrid/office/not_specified
  
  // Technical details
  technologies: string[];
  salaryRange?: string;
  experienceLevel?: string; // junior/mid/senior/lead/principal/not_specified
  employmentType?: string; // full-time/part-time/contract/internship/freelance
  
  // Metadata
  postedDate: Date;
  url: string;
  originalJobId?: string; // Site-specific job ID
  sourceSite: string; // dev.bg, jobs.bg, etc.
  
  // Optional detailed information
  description?: string;
  requirements?: string;
  responsibilities?: string[];
  benefits?: string[];
  
  // Company information (if available from job listing)
  companyWebsite?: string;
  companySize?: string;
  industry?: string;
}

export interface ScraperOptions {
  page?: number;
  limit?: number;
  keywords?: string[];
  location?: string;
  experienceLevel?: string;
  employmentType?: string;
  workModel?: string;
}

export interface ScrapingResult {
  jobs: JobListing[];
  totalFound: number;
  page: number;
  hasNextPage: boolean;
  errors: string[];
  metadata?: {
    processingTime: number;
    sourceUrl: string;
    requestCount: number;
    scrapingMethod?: 'free' | 'paid' | 'both_failed';
    service?: string;
    creditsUsed?: number;
    attempts?: number;
    fallbackReason?: string;
    paidProcessingTime?: number;
  };
}

export interface JobDetails {
  description: string;
  requirements: string;
  responsibilities?: string[];
  benefits?: string[];
  rawHtml?: string;
  companyProfileUrl?: string;
  companyWebsite?: string;
  salaryInfo?: {
    min?: number;
    max?: number;
    currency?: string;
  };
  applicationDeadline?: Date;
  contactInfo?: {
    email?: string;
    phone?: string;
    recruiterName?: string;
  };
}

export interface IJobScraper {
  /**
   * Scrape job listings from the site
   */
  scrapeJobs(options?: ScraperOptions): Promise<ScrapingResult>;
  
  /**
   * Fetch detailed information for a specific job
   */
  fetchJobDetails(jobUrl: string, companyName?: string): Promise<JobDetails>;
  
  /**
   * Get site-specific configuration
   */
  getSiteConfig(): {
    name: string;
    baseUrl: string;
    supportedLocations: string[];
    supportedCategories: string[];
  };
  
  /**
   * Validate if a URL belongs to this scraper's site
   */
  canHandle(url: string): boolean;
}