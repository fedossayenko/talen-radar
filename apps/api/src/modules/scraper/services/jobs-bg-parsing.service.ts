import { Injectable, Logger } from '@nestjs/common';
import * as cheerio from 'cheerio';
import { JobListing, JobDetails } from '../interfaces/job-scraper.interface';
import { promises as fs } from 'fs';
import { join } from 'path';

@Injectable()
export class JobsBgParsingService {
  private readonly logger = new Logger(JobsBgParsingService.name);

  /**
   * Parse job listings from jobs.bg HTML
   */
  async parseJobsFromHtml(html: string, page: number, baseUrl: string): Promise<JobListing[]> {
    const jobs: JobListing[] = [];
    
    try {
      const $ = cheerio.load(html);
      
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
          const job = this.processJobElement($, element, baseUrl);
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

  /**
   * Process individual job element from jobs.bg
   */
  private processJobElement($: cheerio.CheerioAPI, element: any, baseUrl: string): JobListing | null {
    try {
      // Updated selectors based on actual jobs.bg mobile HTML structure
      const linkElement = $(element).find('a.black-link-b').first();
      const titleElement = linkElement.find('span').first();
      const companyElement = $(element).find('a[href*="/company/"]').first();
      const cardInfoElement = $(element).find('.card-info');
      const dateElement = $(element).find('.card-date');
      
      const title = titleElement.text().trim();
      const company = companyElement.attr('title')?.trim() || '';
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
      
      // Extract work model and experience level
      const workModel = this.normalizeWorkModel(cardInfoText);
      const experienceLevel = this.normalizeExperienceLevel(cardInfoText);
      
      // Build full URL if relative
      const fullUrl = link.startsWith('http') ? link : `${baseUrl}${link}`;
      
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

  /**
   * Parse job details from jobs.bg HTML
   */
  parseJobDetailsFromHtml(html: string, jobUrl: string, baseUrl: string): JobDetails {
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
    const companyProfileUrl = companyWebsite?.startsWith('http') ? companyWebsite : `${baseUrl}${companyWebsite}`;
    
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

  /**
   * Check if there are more pages
   */
  hasNextPage(html: string, currentPage: number): boolean {
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
   * Save HTML response to file for debugging
   */
  async saveResponseToFile(html: string, page: number, method: string = 'free'): Promise<string> {
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

  /**
   * Extract job ID from jobs.bg URL
   */
  private extractJobId(url: string): string | undefined {
    // Extract job ID from jobs.bg URL patterns
    // e.g., "https://www.jobs.bg/job/8102284" -> "8102284"
    const match = url.match(/\/job\/(\d+)/);
    return match ? match[1] : undefined;
  }

  /**
   * Extract salary information from content
   */
  private extractSalaryFromContent(content: string): { min?: number; max?: number; currency?: string } | undefined {
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
          }

          if (salaryMin || salaryMax) {
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

  // Utility methods
  private parseNumber(str: string): number {
    return parseInt(str.replace(/[\s,]/g, ''), 10);
  }
  
  private parseCurrency(currencyStr?: string): string {
    if (!currencyStr) return 'BGN';
    
    const normalized = currencyStr.toLowerCase().trim();
    
    if (normalized.includes('€') || normalized === 'eur') return 'EUR';
    if (normalized.includes('$') || normalized === 'usd') return 'USD';
    if (normalized.includes('£') || normalized === 'gbp') return 'GBP';
    if (normalized.includes('лв') || normalized.includes('лева') || normalized === 'bgn') return 'BGN';
    
    return 'BGN'; // Default
  }

  private normalizeWorkModel(workModel: string): string {
    if (!workModel) return 'not_specified';
    
    const normalized = workModel.toLowerCase().trim();
    
    if (normalized.includes('remote') || normalized.includes('дистанционно')) return 'remote';
    if (normalized.includes('hybrid') || normalized.includes('хибридно') || normalized.includes('смесено')) return 'hybrid';
    if (normalized.includes('office') || normalized.includes('офис') || normalized.includes('на място')) return 'office';
    
    return 'not_specified';
  }
  
  private normalizeExperienceLevel(level: string): string {
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
  
  private normalizeCompanyName(name: string): string {
    if (!name) return name;
    
    return name
      .trim()
      .replace(/\s+/g, ' ') // Multiple spaces to single
      .replace(/[""]/g, '"') // Normalize quotes
      .replace(/^["']|["']$/g, ''); // Remove surrounding quotes
  }

  private parsePostedDate(dateStr: string): Date {
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
    
    return now;
  }

  private extractTechnologies(text: string): string[] {
    if (!text) return [];
    
    const commonTechs = [
      'Java', 'JavaScript', 'TypeScript', 'Python', 'C#', 'C++', 'PHP', 'Ruby', 'Go', 'Rust', 'Kotlin', 'Swift',
      'React', 'Vue', 'Angular', 'HTML', 'CSS', 'Node.js', 'Express', 'Next.js', 'Nuxt.js',
      'Spring', 'Spring Boot', 'Django', 'Flask', 'Laravel', 'ASP.NET', '.NET', 'Rails',
      'MySQL', 'PostgreSQL', 'MongoDB', 'Redis', 'Oracle', 'SQL Server', 'SQLite', 'Elasticsearch',
      'AWS', 'Azure', 'GCP', 'Docker', 'Kubernetes', 'Jenkins', 'GitLab', 'GitHub', 'CI/CD',
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