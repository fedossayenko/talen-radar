import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { AxiosResponse } from 'axios';
import axios from 'axios';
import {
  PaidScrapingOptions,
  PaidScrapingResponse,
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
    const config = this.configService.get('paidServices.scraperapi');
    
    if (!config?.apiKey) {
      throw new Error('ScraperAPI not configured');
    }

    try {
      // Try REST API first
      return await this.scrapeWithScraperAPIRest(options);
    } catch (error) {
      // If REST API fails with protected domain error, try proxy approach
      if (error.message.includes('Protected domain') || error.message.includes('premium')) {
        this.logger.warn(`REST API failed, trying ScraperAPI proxy approach: ${error.message}`);
        try {
          return await this.scrapeWithScraperAPIProxy(options);
        } catch (proxyError) {
          this.logger.error(`Both REST and proxy approaches failed: ${proxyError.message}`);
          throw proxyError;
        }
      }
      throw error;
    }
  }

  /**
   * Scrape using ScraperAPI REST API (original method)
   */
  private async scrapeWithScraperAPIRest(options: PaidScrapingOptions): Promise<PaidScrapingResponse> {
    const startTime = Date.now();
    const config = this.configService.get('paidServices.scraperapi');

    try {
      this.logger.log(`Using ScraperAPI REST for ${options.url}`);
      
      // Build URL manually to match the working format from user's test
      // Double-encode brackets to match ScraperAPI's expected format
      const encodedUrl = encodeURIComponent(options.url)
        .replace(/%5B/g, '%255B')  // Double-encode [
        .replace(/%5D/g, '%255D'); // Double-encode ]
      
      // Use basic parameters for free tier compatibility
      const requestUrl = `${config.baseUrl}/?api_key=${config.apiKey}&url=${encodedUrl}&device_type=desktop`;
      
      this.logger.log(`ScraperAPI Request URL: ${requestUrl}`);

      const response: AxiosResponse<any> = await firstValueFrom(
        this.httpService.get(requestUrl, {
          timeout: options.timeout ?? config.timeout,
          headers: {
            'User-Agent': 'TalentRadar-API/1.0',
          },
          responseType: 'text', // Expect plain HTML, not JSON
          maxContentLength: Infinity,
          maxBodyLength: Infinity,
        })
      );

      const processingTime = Date.now() - startTime;

      // Calculate credits used based on site
      const credits = this.calculateCredits(options.siteName, 'scraperapi');

      // ScraperAPI returns plain HTML for successful requests
      const html = typeof response.data === 'string' ? response.data : String(response.data);
      
      // Check if we got an error response (would be JSON)
      if (html.trim().startsWith('{') || html.trim().startsWith('[')) {
        try {
          const errorResponse = JSON.parse(html);
          if (errorResponse.error) {
            throw new Error(`ScraperAPI error: ${errorResponse.error}`);
          }
        } catch {
          // If it's not valid JSON, treat as HTML
        }
      }
      
      if (!html || html.length < 100) {
        throw new Error('ScraperAPI returned empty or minimal content');
      }

      this.logger.log(`ScraperAPI REST success: ${html.length} chars, ${credits} credits, ${processingTime}ms`);

      return {
        html,
        success: true,
        credits,
        service: 'scraperapi',
        processingTime,
        metadata: {
          originalUrl: options.url,
          finalUrl: options.url, // ScraperAPI doesn't provide final URL in plain HTML response
          statusCode: response.status,
          responseHeaders: response.headers as Record<string, string>,
        },
      };

    } catch (error) {
      const processingTime = Date.now() - startTime;
      
      // Check if it's a premium plan limitation for protected domains
      if (error.response?.data && typeof error.response.data === 'string') {
        if (error.response.data.includes('current plan does not allow you to use our premium proxies')) {
          throw new Error(`Protected domain ${options.siteName} requires premium ScraperAPI plan. Current plan: free tier.`);
        }
        
        if (error.response.data.includes('Protected domains may require adding premium=true')) {
          throw new Error(`Protected domain ${options.siteName} requires premium ScraperAPI parameters.`);
        }
      }
      
      this.logger.error(`ScraperAPI REST failed for ${options.url} after ${processingTime}ms: ${error.message}`);
      throw error;
    }
  }

  /**
   * Scrape using ScraperAPI Proxy approach (for protected domains)
   */
  private async scrapeWithScraperAPIProxy(options: PaidScrapingOptions): Promise<PaidScrapingResponse> {
    const startTime = Date.now();
    const config = this.configService.get('paidServices.scraperapi');

    try {
      this.logger.log(`Using ScraperAPI Proxy for ${options.url}`);

      // Use axios directly with proxy configuration
      const response = await axios.get(options.url, {
        method: 'GET',
        timeout: options.timeout ?? config.timeout,
        proxy: {
          host: 'proxy-server.scraperapi.com',
          port: 8001,
          auth: {
            username: 'scraperapi.device_type=desktop',
            password: config.apiKey
          },
          protocol: 'http'
        },
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        },
        maxRedirects: 5,
        validateStatus: () => true, // Accept all status codes
      });

      const processingTime = Date.now() - startTime;
      const credits = this.calculateCredits(options.siteName, 'scraperapi');
      
      const html = typeof response.data === 'string' ? response.data : String(response.data);
      
      if (!html || html.length < 100) {
        throw new Error('ScraperAPI Proxy returned empty or minimal content');
      }

      this.logger.log(`ScraperAPI Proxy success: ${html.length} chars, ${credits} credits, ${processingTime}ms`);

      return {
        html,
        success: true,
        credits,
        service: 'scraperapi-proxy',
        processingTime,
        metadata: {
          originalUrl: options.url,
          finalUrl: response.request?.res?.responseUrl || options.url,
          statusCode: response.status,
          responseHeaders: response.headers as Record<string, string>,
        },
      };

    } catch (error) {
      const processingTime = Date.now() - startTime;
      this.logger.error(`ScraperAPI Proxy failed for ${options.url}: ${error.message}`);
      
      return {
        html: '',
        success: false,
        credits: 0,
        service: 'scraperapi-proxy',
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

      const response: AxiosResponse<ScrapingDogResponse> = await firstValueFrom(
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