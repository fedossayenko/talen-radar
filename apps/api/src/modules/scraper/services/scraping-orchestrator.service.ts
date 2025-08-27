import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PaidScraperService } from './paid-scraper.service';
import { CreditTrackerService } from './credit-tracker.service';
import { PaidScrapingOptions } from '../interfaces/paid-scraper.interface';
import { BrowserScrapingResponse } from '../interfaces/browser-scraper.interface';

export interface ScrapingContext {
  url: string;
  siteName: string;
  page: number;
  startTime: number;
  totalRequestCount: number;
  lastError: string | null;
  metadata?: any;
}

export interface ScrapingStrategy {
  name: string;
  execute: (context: ScrapingContext) => Promise<BrowserScrapingResponse>;
}

@Injectable()
export class ScrapingOrchestratorService {
  private readonly logger = new Logger(ScrapingOrchestratorService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly paidScraperService: PaidScraperService,
    private readonly creditTrackerService: CreditTrackerService,
  ) {}

  /**
   * Execute scraping with retry logic and paid fallback
   */
  async executeWithFallback(
    context: ScrapingContext,
    freeStrategy: ScrapingStrategy,
    options: {
      retryConfig?: any;
      enablePaidFallback?: boolean;
      isBlockedChecker?: (html: string) => boolean;
    } = {}
  ): Promise<BrowserScrapingResponse> {
    const {
      retryConfig = this.getDefaultRetryConfig(),
      enablePaidFallback = true,
      isBlockedChecker
    } = options;

    let lastError: string | null = null;

    // Try free scraping with retries first
    for (let attempt = 1; attempt <= retryConfig.maxAttempts; attempt++) {
      try {
        this.logger.log(`🆓 Free scraping attempt ${attempt}/${retryConfig.maxAttempts} for ${context.siteName}`);
        context.totalRequestCount++;
        
        const response = await freeStrategy.execute(context);
        
        if (!response.success || !response.html) {
          throw new Error(response.error || 'No content received');
        }

        // Check for blocking if checker provided
        if (isBlockedChecker && isBlockedChecker(response.html)) {
          this.logger.warn(`🚫 Blocking detected on attempt ${attempt} - skipping to paid service`);
          lastError = 'Blocking detected - requires premium service';
          break; // Exit retry loop immediately
        }

        // Success!
        this.logger.log(`✅ Free scraping succeeded on attempt ${attempt}`);
        return response;

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
    if (enablePaidFallback) {
      this.logger.warn(`🆓 All free scraping attempts failed. Trying paid service fallback...`);
      return await this.executeWithPaidService({ ...context, lastError });
    }

    // No paid fallback, return failure
    return {
      html: '',
      finalUrl: context.url,
      status: 0,
      headers: {},
      success: false,
      error: `Free scraping failed after ${retryConfig.maxAttempts} attempts: ${lastError}`,
      loadTime: 0,
      cookies: [],
    };
  }

  /**
   * Execute scraping using paid service
   */
  async executeWithPaidService(context: ScrapingContext & { lastError?: string }): Promise<BrowserScrapingResponse> {
    const { url, siteName, lastError } = context;
    
    // Check if paid scraping is enabled and we have credits
    const requiredCredits = this.creditTrackerService.getCreditCost(siteName, 'scraperapi');
    const hasCredits = await this.creditTrackerService.hasAvailableCredits('scraperapi', requiredCredits);
    
    if (!hasCredits) {
      const usagePercentage = await this.creditTrackerService.getUsagePercentage('scraperapi');
      throw new Error(`Insufficient ScraperAPI credits. Current usage: ${usagePercentage.toFixed(1)}%. Required: ${requiredCredits} credits.`);
    }
    
    this.logger.log(`💳 Using paid ScraperAPI (${requiredCredits} credits) for ${siteName}`);
    
    try {
      const paidOptions: PaidScrapingOptions = {
        url,
        siteName,
        render: true,
        premium: true,
        countryCode: siteName.includes('.bg') ? 'bg' : 'us',
        timeout: 180000, // 3 minutes for complex challenges
      };
      
      const paidResponse = await this.paidScraperService.scrapeWithScraperAPI(paidOptions);
      
      if (!paidResponse.success || !paidResponse.html) {
        throw new Error(`ScraperAPI failed: ${paidResponse.error || 'No content received'}`);
      }
      
      // Track credit usage
      await this.creditTrackerService.trackUsage({
        service: 'scraperapi',
        site: siteName,
        credits: paidResponse.credits,
        url,
        timestamp: new Date(),
        successful: true,
      });
      
      this.logger.log(`✅ Paid scraping succeeded (${paidResponse.credits} credits used)`);
      
      // Convert paid response to browser response format
      return {
        html: paidResponse.html,
        finalUrl: paidResponse.metadata?.finalUrl || url,
        status: paidResponse.metadata?.statusCode || 200,
        headers: paidResponse.metadata?.responseHeaders || {},
        success: true,
        loadTime: paidResponse.processingTime || 0,
        cookies: [],
        metadata: {
          service: 'scraperapi',
          creditsUsed: paidResponse.credits,
          fallbackReason: lastError,
        },
      };
      
    } catch (error) {
      // Track failed credit usage
      await this.creditTrackerService.trackUsage({
        service: 'scraperapi',
        site: siteName, 
        credits: 0, // No credits charged for failures
        url,
        timestamp: new Date(),
        successful: false,
      });
      
      throw error;
    }
  }

  /**
   * Get default retry configuration
   */
  private getDefaultRetryConfig() {
    return this.configService.get('paidServices.retry', {
      maxAttempts: 3,
      baseDelayMs: 10000,
      exponentialBase: 3,
      jitterMs: 2000,
    });
  }

  /**
   * Sleep utility for retry delays
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}