import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import {
  PaidScrapingOptions,
  PaidScrapingResponse,
  ScraperAPIResponse,
  ScrapingDogResponse,
} from '../interfaces/paid-scraper.interface';

@Injectable()
export class PaidScraperService {
  private readonly logger = new Logger(PaidScraperService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
  ) {
    this.logger.log('PaidScraperService initialized');
  }

  /**
   * Main entry point for paid scraping
   */
  async scrapeWithFallback(options: PaidScrapingOptions): Promise<PaidScrapingResponse> {
    this.logger.log(`Starting paid scraping for ${options.url}`);

    // Try ScraperAPI first (free tier available)
    if (this.isScraperAPIAvailable()) {
      try {
        return await this.scrapeWithScraperAPI(options);
      } catch (error) {
        this.logger.warn(`ScraperAPI failed: ${error.message}`);
      }
    }

    // Fallback to ScrapingDog (if available)
    if (this.isScrapingDogAvailable()) {
      try {
        return await this.scrapeWithScrapingDog(options);
      } catch (error) {
        this.logger.warn(`ScrapingDog failed: ${error.message}`);
      }
    }

    throw new Error('All paid scraping services exhausted or unavailable');
  }

  /**
   * Scrape using ScraperAPI
   */
  async scrapeWithScraperAPI(options: PaidScrapingOptions): Promise<PaidScrapingResponse> {
    const startTime = Date.now();
    const config = this.configService.get('paidServices.scraperapi');
    
    if (!config?.apiKey) {
      throw new Error('ScraperAPI not configured');
    }

    try {
      this.logger.log(`Using ScraperAPI for ${options.url}`);
      
      const params = new URLSearchParams({
        api_key: config.apiKey,
        url: options.url,
        render: (options.render ?? config.requestParams.render).toString(),
        format: 'html',
        country_code: options.countryCode ?? config.requestParams.country_code,
        premium: (options.premium ?? config.requestParams.premium).toString(),
        session_number: config.requestParams.session_number.toString(),
        timeout: (options.timeout ?? config.timeout).toString(),
      });

      const response = await firstValueFrom(
        this.httpService.get(`${config.baseUrl}/?${params.toString()}`, {
          timeout: options.timeout ?? config.timeout,
          headers: {
            'User-Agent': 'TalentRadar-API/1.0',
          },
        })
      );

      const apiResponse = response.data as ScraperAPIResponse;
      const processingTime = Date.now() - startTime;

      // Calculate credits used based on site
      const credits = this.calculateCredits(options.siteName, 'scraperapi');

      if (apiResponse.error) {
        throw new Error(`ScraperAPI error: ${apiResponse.error}`);
      }

      const html = typeof response.data === 'string' ? response.data : apiResponse.content || '';
      
      if (!html || html.length < 100) {
        throw new Error('ScraperAPI returned empty or minimal content');
      }

      this.logger.log(`ScraperAPI success: ${html.length} chars, ${credits} credits, ${processingTime}ms`);

      return {
        html,
        success: true,
        credits,
        service: 'scraperapi',
        processingTime,
        metadata: {
          originalUrl: options.url,
          finalUrl: apiResponse.url || options.url,
          statusCode: response.status,
          responseHeaders: response.headers as Record<string, string>,
        },
      };

    } catch (error) {
      const processingTime = Date.now() - startTime;
      this.logger.error(`ScraperAPI failed for ${options.url}: ${error.message}`);
      
      return {
        html: '',
        success: false,
        credits: 0,
        service: 'scraperapi',
        processingTime,
        error: error.message,
        metadata: {
          originalUrl: options.url,
          finalUrl: options.url,
          statusCode: error.response?.status || 0,
        },
      };
    }
  }

  /**
   * Scrape using ScrapingDog
   */
  async scrapeWithScrapingDog(options: PaidScrapingOptions): Promise<PaidScrapingResponse> {
    const startTime = Date.now();
    const config = this.configService.get('paidServices.scrapingdog');
    
    if (!config?.apiKey) {
      throw new Error('ScrapingDog not configured');
    }

    try {
      this.logger.log(`Using ScrapingDog for ${options.url}`);
      
      const params = new URLSearchParams({
        api_key: config.apiKey,
        url: options.url,
        dynamic: 'true',
        format: 'text',
      });

      const response = await firstValueFrom(
        this.httpService.get(`${config.baseUrl}/scrape?${params.toString()}`, {
          timeout: options.timeout ?? 180000,
          headers: {
            'User-Agent': 'TalentRadar-API/1.0',
          },
        })
      );

      const processingTime = Date.now() - startTime;
      const credits = this.calculateCredits(options.siteName, 'scrapingdog');
      
      const scrapingDogResponse = response.data as ScrapingDogResponse;
      const html = typeof response.data === 'string' ? response.data : scrapingDogResponse.html || '';
      
      if (!html || html.length < 100) {
        throw new Error('ScrapingDog returned empty or minimal content');
      }

      this.logger.log(`ScrapingDog success: ${html.length} chars, ${credits} credits, ${processingTime}ms`);

      return {
        html,
        success: true,
        credits,
        service: 'scrapingdog',
        processingTime,
        metadata: {
          originalUrl: options.url,
          finalUrl: scrapingDogResponse.url || options.url,
          statusCode: response.status,
        },
      };

    } catch (error) {
      const processingTime = Date.now() - startTime;
      this.logger.error(`ScrapingDog failed for ${options.url}: ${error.message}`);
      
      return {
        html: '',
        success: false,
        credits: 0,
        service: 'scrapingdog',
        processingTime,
        error: error.message,
        metadata: {
          originalUrl: options.url,
          finalUrl: options.url,
          statusCode: error.response?.status || 0,
        },
      };
    }
  }

  /**
   * Calculate credits used based on site and service
   */
  private calculateCredits(siteName: string, service: string): number {
    if (service === 'scraperapi') {
      const config = this.configService.get('paidServices.scraperapi');
      return config?.creditsPerRequest[siteName] || config?.creditsPerRequest.default || 1;
    }
    
    if (service === 'scrapingdog') {
      return 1; // ScrapingDog uses 1 credit per request
    }
    
    return 1;
  }

  /**
   * Check if ScraperAPI is available and configured
   */
  private isScraperAPIAvailable(): boolean {
    const config = this.configService.get('paidServices.scraperapi');
    return config?.enabled && !!config?.apiKey;
  }

  /**
   * Check if ScrapingDog is available and configured
   */
  private isScrapingDogAvailable(): boolean {
    const config = this.configService.get('paidServices.scrapingdog');
    return config?.enabled && !!config?.apiKey;
  }

  /**
   * Get available services
   */
  getAvailableServices(): string[] {
    const services: string[] = [];
    
    if (this.isScraperAPIAvailable()) {
      services.push('scraperapi');
    }
    
    if (this.isScrapingDogAvailable()) {
      services.push('scrapingdog');
    }
    
    return services;
  }

  /**
   * Test service connection
   */
  async testService(serviceName: string): Promise<boolean> {
    try {
      const testUrl = 'https://httpbin.org/html';
      const options: PaidScrapingOptions = {
        url: testUrl,
        siteName: 'test',
        timeout: 30000,
      };

      let result: PaidScrapingResponse;
      
      if (serviceName === 'scraperapi') {
        result = await this.scrapeWithScraperAPI(options);
      } else if (serviceName === 'scrapingdog') {
        result = await this.scrapeWithScrapingDog(options);
      } else {
        throw new Error(`Unknown service: ${serviceName}`);
      }

      return result.success && result.html.includes('html');
    } catch (error) {
      this.logger.error(`Service test failed for ${serviceName}: ${error.message}`);
      return false;
    }
  }
}