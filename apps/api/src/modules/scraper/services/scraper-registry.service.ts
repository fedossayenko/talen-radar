import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IJobScraper } from '../interfaces/job-scraper.interface';
import { DevBgScraper } from '../scrapers/dev-bg.scraper';
import { JobsBgScraper } from '../scrapers/jobs-bg.scraper';

/**
 * Registry for all job scrapers
 * Manages which scrapers are available and enabled
 */
@Injectable()
export class ScraperRegistryService implements OnModuleInit {
  private readonly logger = new Logger(ScraperRegistryService.name);
  private readonly scrapers = new Map<string, IJobScraper>();
  private readonly enabledSites: string[];

  constructor(
    private readonly configService: ConfigService,
    private readonly devBgScraper: DevBgScraper,
    private readonly jobsBgScraper: JobsBgScraper,
  ) {
    this.enabledSites = this.configService.get<string[]>('scraper.enabledSites', ['dev.bg', 'jobs.bg']);
  }

  onModuleInit() {
    this.logger.log('Initializing scraper registry...');
    
    this.registerScrapers();
    
    this.logger.log(`Registry initialized with ${this.scrapers.size} scrapers: [${Array.from(this.scrapers.keys()).join(', ')}]`);
    
    // Log any missing scrapers
    const missingSites = this.enabledSites.filter(site => !this.scrapers.has(site));
    if (missingSites.length > 0) {
      this.logger.warn(`Missing scrapers for enabled sites: ${missingSites.join(', ')}`);
    }
  }

  /**
   * Register all available scrapers
   */
  private registerScrapers(): void {
    // Register dev.bg scraper
    if (this.isScraperEnabled('dev.bg')) {
      try {
        this.scrapers.set('dev.bg', this.devBgScraper);
        this.logger.debug('Registered dev.bg scraper');
      } catch (error) {
        this.logger.error('Failed to register dev.bg scraper:', error.message);
      }
    }

    // Register jobs.bg scraper
    if (this.isScraperEnabled('jobs.bg')) {
      try {
        this.scrapers.set('jobs.bg', this.jobsBgScraper);
        this.logger.debug('Registered jobs.bg scraper');
      } catch (error) {
        this.logger.error('Failed to register jobs.bg scraper:', error.message);
      }
    }
  }

  /**
   * Get scraper by site name
   */
  getScraper(siteName: string): IJobScraper | null {
    const scraper = this.scrapers.get(siteName);
    if (!scraper) {
      this.logger.warn(`No scraper found for site: ${siteName}`);
      return null;
    }
    
    this.logger.debug(`Using scraper for ${siteName}: ${scraper.constructor.name}`);
    return scraper;
  }

  /**
   * Get scraper that can handle a specific URL
   */
  getScraperForUrl(url: string): IJobScraper | null {
    for (const [siteName, scraper] of this.scrapers) {
      if (scraper.canHandle(url)) {
        this.logger.debug(`Found scraper for URL ${url}: ${siteName}`);
        return scraper;
      }
    }
    
    this.logger.warn(`No scraper found for URL: ${url}`);
    return null;
  }

  /**
   * Get all enabled scrapers
   */
  getAllEnabledScrapers(): Map<string, IJobScraper> {
    return new Map(this.scrapers);
  }

  /**
   * Get list of enabled site names
   */
  getEnabledSiteNames(): string[] {
    return Array.from(this.scrapers.keys());
  }

  /**
   * Check if scraper is available for a site
   */
  hasScraperForSite(siteName: string): boolean {
    return this.scrapers.has(siteName);
  }

  /**
   * Get scraper configuration for a site
   */
  getScraperConfig(siteName: string): any {
    const scraper = this.getScraper(siteName);
    return scraper?.getSiteConfig() || null;
  }

  /**
   * Get all scraper configurations
   */
  getAllScraperConfigs(): Record<string, any> {
    const configs: Record<string, any> = {};
    
    for (const [siteName, scraper] of this.scrapers) {
      configs[siteName] = scraper.getSiteConfig();
    }
    
    return configs;
  }

  /**
   * Register a new scraper dynamically (for plugins)
   */
  registerScraper(siteName: string, scraper: IJobScraper): void {
    if (this.scrapers.has(siteName)) {
      this.logger.warn(`Overwriting existing scraper for site: ${siteName}`);
    }
    
    this.scrapers.set(siteName, scraper);
    this.logger.log(`Registered scraper for site: ${siteName}`);
  }

  /**
   * Unregister a scraper
   */
  unregisterScraper(siteName: string): void {
    if (this.scrapers.delete(siteName)) {
      this.logger.log(`Unregistered scraper for site: ${siteName}`);
    } else {
      this.logger.warn(`No scraper found to unregister for site: ${siteName}`);
    }
  }

  /**
   * Check if a specific scraper is enabled via configuration
   */
  private isScraperEnabled(siteName: string): boolean {
    this.logger.log(`Checking if scraper is enabled for site: ${siteName}`);
    
    // Check if globally enabled
    const globallyEnabled = this.configService.get<boolean>('scraper.enabled', true);
    this.logger.log(`Global scraper enabled: ${globallyEnabled}`);
    if (!globallyEnabled) {
      this.logger.log(`Site ${siteName} disabled globally`);
      return false;
    }

    // Check if site is in enabled sites list
    this.logger.log(`Enabled sites list: [${this.enabledSites.join(', ')}]`);
    if (!this.enabledSites.includes(siteName)) {
      this.logger.log(`Site ${siteName} not in enabled sites list`);
      return false;
    }

    // Check site-specific configuration - convert to camelCase key
    const siteKey = this.convertSiteNameToConfigKey(siteName);
    this.logger.log(`Site key for config lookup: ${siteKey}`);
    const siteConfig = this.configService.get(`scraper.sites.${siteKey}`, {});
    this.logger.log(`Site config for ${siteName}:`, siteConfig);
    
    if (siteConfig.enabled === false) {
      this.logger.log(`Site ${siteName} explicitly disabled in configuration`);
      return false;
    }

    this.logger.log(`Site ${siteName} is enabled`);
    return true;
  }

  /**
   * Convert site name to configuration key (e.g., 'dev.bg' -> 'devBg', 'jobs.bg' -> 'jobsBg')
   */
  private convertSiteNameToConfigKey(siteName: string): string {
    return siteName
      .replace(/[.-]/g, '') // Remove dots and dashes
      .replace(/bg$/i, 'Bg'); // Capitalize 'Bg' suffix
  }

  /**
   * Get registry statistics
   */
  getStats(): {
    totalScrapers: number;
    enabledScrapers: number;
    availableSites: string[];
    enabledSites: string[];
  } {
    return {
      totalScrapers: this.scrapers.size,
      enabledScrapers: this.scrapers.size,
      availableSites: Array.from(this.scrapers.keys()),
      enabledSites: this.enabledSites,
    };
  }
}