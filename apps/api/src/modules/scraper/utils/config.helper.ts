import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';

/**
 * Centralized configuration helper for scrapers
 */
export class ScraperConfigHelper {
  private static readonly logger = new Logger(ScraperConfigHelper.name);

  /**
   * Convert site name to configuration key (e.g., 'dev.bg' -> 'devBg', 'jobs.bg' -> 'jobsBg')
   */
  static convertSiteNameToConfigKey(siteName: string): string {
    return siteName
      .replace(/[.-]/g, '') // Remove dots and dashes
      .replace(/bg$/i, 'Bg'); // Capitalize 'Bg' suffix
  }

  /**
   * Get site-specific configuration with fallback to defaults
   */
  static getSiteConfig(configService: ConfigService, siteName: string) {
    const siteKey = this.convertSiteNameToConfigKey(siteName);
    
    return {
      baseUrl: configService.get<string>(`scraper.sites.${siteKey}.baseUrl`),
      searchUrl: configService.get<string>(`scraper.sites.${siteKey}.searchUrl`) || 
                configService.get<string>(`scraper.sites.${siteKey}.apiUrl`),
      requestTimeout: configService.get<number>(`scraper.sites.${siteKey}.requestTimeout`, 30000),
      requestDelay: configService.get<number>(`scraper.sites.${siteKey}.requestDelay`, 2000),
      maxRetries: configService.get<number>(`scraper.sites.${siteKey}.maxRetries`, 3),
      userAgent: configService.get<string>(`scraper.sites.${siteKey}.userAgent`, 'TalentRadar/1.0 (Job Aggregator)'),
      useHttpFallback: configService.get<boolean>(`scraper.sites.${siteKey}.useHttpFallback`, true),
      maxPages: configService.get<number>(`scraper.sites.${siteKey}.maxPages`, 10),
    };
  }

  /**
   * Validate essential scraper configuration to ensure proper setup
   */
  static validateSiteConfiguration(configService: ConfigService, siteName: string): void {
    const siteKey = this.convertSiteNameToConfigKey(siteName);
    const config = this.getSiteConfig(configService, siteName);
    
    if (!config.baseUrl) {
      throw new Error(`Missing required configuration: scraper.sites.${siteKey}.baseUrl for site ${siteName}`);
    }
    
    if (!config.searchUrl) {
      throw new Error(`Missing required configuration: scraper.sites.${siteKey}.searchUrl or apiUrl for site ${siteName}`);
    }
    
    this.logger.debug(`Configuration validated for ${siteName}: baseUrl=${config.baseUrl}, searchUrl=${config.searchUrl}`);
  }
}