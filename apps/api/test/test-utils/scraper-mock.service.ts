import { Injectable, Logger } from '@nestjs/common';

/**
 * Mock BrowserEngineService for testing
 */
@Injectable()
export class BrowserEngineServiceMock {
  private readonly logger = new Logger('BrowserEngineServiceMock');

  async scrapeUrl(url: string, options: any = {}): Promise<{ html: string; metadata: any }> {
    this.logger.log(`Mock scraping URL: ${url}`);
    
    // Return mock HTML content based on URL
    if (url.includes('dev.bg')) {
      return {
        html: '<html><body><h1>Dev.bg Mock Content</h1><div class="job-listings">Mock job listings</div></body></html>',
        metadata: {
          title: 'Dev.bg Jobs',
          statusCode: 200,
          loadTime: 1000,
        },
      };
    }
    
    if (url.includes('jobs.bg')) {
      return {
        html: '<html><body><h1>Jobs.bg Mock Content</h1><div class="job-list">Mock job content</div></body></html>',
        metadata: {
          title: 'Jobs.bg',
          statusCode: 200,
          loadTime: 1200,
        },
      };
    }
    
    // Generic mock response
    return {
      html: '<html><body><h1>Mock Content</h1><div>Generic mock content</div></body></html>',
      metadata: {
        title: 'Mock Page',
        statusCode: 200,
        loadTime: 800,
      },
    };
  }

  async initialize(): Promise<void> {
    this.logger.log('Mock browser engine initialized');
  }

  async cleanup(): Promise<void> {
    this.logger.log('Mock browser engine cleaned up');
  }

  isInitialized(): boolean {
    return true;
  }
}

/**
 * Mock PaidScraperService for testing
 */
@Injectable()
export class PaidScraperServiceMock {
  private readonly logger = new Logger('PaidScraperServiceMock');

  async scrapeWithFallback(options: any): Promise<any> {
    this.logger.log(`Mock paid scraping: ${options.url}`);
    
    return {
      html: '<html><body><h1>Paid Scraper Mock</h1><div>Premium content</div></body></html>',
      success: true,
      credits: 1,
      service: 'mock-service',
      processingTime: 500,
      metadata: {
        originalUrl: options.url,
        finalUrl: options.url,
        statusCode: 200,
      },
    };
  }

  getAvailableServices(): string[] {
    return ['mock-service'];
  }

  async testService(serviceName: string): Promise<boolean> {
    this.logger.log(`Testing mock service: ${serviceName}`);
    return true;
  }
}

/**
 * Mock CreditTrackerService for testing
 */
@Injectable()
export class CreditTrackerServiceMock {
  private readonly logger = new Logger('CreditTrackerServiceMock');

  async getServiceLimits(): Promise<any> {
    return {
      scraperapi: {
        totalCredits: 1000,
        usedCredits: 150,
        remainingCredits: 850,
        resetDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
      },
    };
  }

  async getUsageStats(): Promise<any> {
    return {
      today: { requests: 5, credits: 5, errors: 0 },
      thisWeek: { requests: 25, credits: 30, errors: 1 },
      thisMonth: { requests: 150, credits: 180, errors: 3 },
    };
  }

  async trackUsage(service: string, credits: number, metadata?: any): Promise<void> {
    this.logger.log(`Mock tracking usage: ${service}, credits: ${credits}`);
  }

  async getAvailableServices(): Promise<string[]> {
    return ['mock-service', 'scraperapi'];
  }
}

/**
 * Mock ScrapingOrchestratorService for testing
 */
@Injectable()
export class ScrapingOrchestratorServiceMock {
  private readonly logger = new Logger('ScrapingOrchestratorServiceMock');

  async orchestrateMultipleScraping(options: any): Promise<any> {
    this.logger.log(`Mock orchestrating scraping for ${options.urls?.length || 1} URLs`);
    
    return {
      success: true,
      results: [{
        url: options.urls?.[0] || 'https://example.com',
        success: true,
        data: { jobs: [] },
        processingTime: 1000,
      }],
      summary: {
        total: 1,
        successful: 1,
        failed: 0,
        totalTime: 1000,
      },
    };
  }
}

/**
 * Mock AntiBypassService for testing
 */
@Injectable()
export class AntiBypassServiceMock {
  private readonly logger = new Logger('AntiBypassServiceMock');

  async applyAntiDetection(options: any): Promise<any> {
    this.logger.log('Mock applying anti-detection measures');
    return {
      ...options,
      userAgent: 'Mock User Agent',
      viewport: { width: 1920, height: 1080 },
      delay: 1000,
    };
  }

  getRecommendedDelay(siteName: string): number {
    return siteName === 'dev.bg' ? 2000 : 1000;
  }
}

/**
 * Mock JobsBgParsingService for testing
 */
@Injectable()
export class JobsBgParsingServiceMock {
  private readonly logger = new Logger('JobsBgParsingServiceMock');

  async parseJobDetails(html: string, url: string): Promise<any> {
    this.logger.log(`Mock parsing job details from ${url}`);
    
    return {
      title: 'Mock Job Title',
      company: 'Mock Company',
      location: 'Sofia, Bulgaria',
      description: 'Mock job description with Java, Spring Boot, and other technologies.',
      requirements: ['Java', 'Spring Boot', 'MySQL'],
      salary: { min: 3000, max: 5000, currency: 'BGN' },
      type: 'Full-time',
      level: 'Mid-level',
      posted: new Date(),
    };
  }

  async parseJobListings(html: string): Promise<any[]> {
    this.logger.log('Mock parsing job listings');
    
    return [
      {
        title: 'Java Developer',
        company: 'Tech Company',
        location: 'Sofia',
        url: 'https://jobs.bg/job/123',
        posted: new Date(),
      },
      {
        title: 'Spring Boot Developer',
        company: 'Software Firm',
        location: 'Plovdiv',
        url: 'https://jobs.bg/job/456',
        posted: new Date(),
      },
    ];
  }
}