import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosResponse } from 'axios';
import * as cheerio from 'cheerio';
import { DevBgCompanyExtractor, DevBgCompanyData } from './devbg-company-extractor.service';
import { BrowserEngineService } from './browser-engine.service';

export interface CompanyProfileData {
  name: string;
  description?: string;
  website?: string;
  industry?: string;
  size?: string;
  location?: string;
  founded?: number;
  employeeCount?: number;
  logo?: string;
  benefits?: string[];
  technologies?: string[];
  values?: string[];
  rawContent: string;
  sourceUrl: string;
  sourceSite: string;
  scrapedAt: Date;
  // Enhanced structured data
  structuredData?: DevBgCompanyData;
  tokenOptimized?: boolean; // Indicates if structured extraction was used
}

export interface CompanyScrapingResult {
  success: boolean;
  data?: CompanyProfileData;
  error?: string;
}

/**
 * Service for scraping company profiles from various sources
 */
@Injectable()
export class CompanyProfileScraper {
  private readonly logger = new Logger(CompanyProfileScraper.name);
  private readonly requestTimeout: number;
  private readonly requestDelay: number;
  private readonly userAgent: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly devBgExtractor: DevBgCompanyExtractor,
    private readonly browserEngine: BrowserEngineService
  ) {
    this.requestTimeout = this.configService.get<number>('scraper.devBg.requestTimeout', 30000);
    this.requestDelay = this.configService.get<number>('scraper.devBg.requestDelay', 2000);
    this.userAgent = this.configService.get<string>('scraper.devBg.userAgent', 'TalentRadar/1.0 (Company Profile Scraper)');
  }

  /**
   * Scrape company profile from dev.bg using optimized structured extraction
   */
  async scrapeDevBgCompanyProfile(companyUrl: string): Promise<CompanyScrapingResult> {
    try {
      this.logger.log(`Scraping dev.bg company profile: ${companyUrl}`);
      
      if (!this.isValidUrl(companyUrl)) {
        return { success: false, error: 'Invalid URL format' };
      }

      const response = await this.fetchPage(companyUrl);
      if (!response.data) {
        return { success: false, error: 'No content received' };
      }

      // Use optimized structured extraction
      const structuredData = await this.devBgExtractor.extractCompanyData(response.data, companyUrl);
      
      // Also use legacy parsing for fallback data
      const legacyData = this.parseDevBgCompanyProfile(response.data, companyUrl);
      
      // Merge structured data with legacy data (structured takes precedence)
      const profileData = this.mergeCompanyData(structuredData, legacyData);
      
      return {
        success: true,
        data: {
          ...profileData,
          rawContent: response.data,
          sourceUrl: companyUrl,
          sourceSite: 'dev.bg',
          scrapedAt: new Date(),
          structuredData, // Include full structured data for AI processing
          tokenOptimized: true, // Mark as using optimized extraction
        }
      };

    } catch (error) {
      this.logger.error(`Failed to scrape dev.bg company profile ${companyUrl}:`, error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Scrape company website for additional information
   */
  async scrapeCompanyWebsite(websiteUrl: string): Promise<CompanyScrapingResult> {
    try {
      this.logger.log(`Scraping company website: ${websiteUrl}`);
      
      if (!this.isValidUrl(websiteUrl)) {
        return { success: false, error: 'Invalid URL format' };
      }

      // First try HTTP request
      let response: AxiosResponse<string> | null = null;
      let htmlContent: string | null = null;

      try {
        response = await this.fetchPage(websiteUrl);
        if (response.data) {
          htmlContent = response.data;
          
          // Check if response contains only JavaScript (likely SPA)
          if (this.isJavaScriptOnlyContent(htmlContent)) {
            this.logger.log(`Website appears to be SPA, falling back to browser automation: ${websiteUrl}`);
            htmlContent = await this.fetchPageWithBrowser(websiteUrl);
          }
        }
      } catch (error) {
        this.logger.warn(`HTTP request failed, trying browser automation: ${error.message}`);
        htmlContent = await this.fetchPageWithBrowser(websiteUrl);
      }

      if (!htmlContent) {
        return { success: false, error: 'No content received from HTTP or browser methods' };
      }

      const websiteData = this.parseCompanyWebsite(htmlContent, websiteUrl);
      
      return {
        success: true,
        data: {
          ...websiteData,
          rawContent: htmlContent,
          sourceUrl: websiteUrl,
          sourceSite: 'company_website',
          scrapedAt: new Date(),
        }
      };

    } catch (error) {
      this.logger.error(`Failed to scrape company website ${websiteUrl}:`, error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Validate if a company URL is reachable and not blocked
   */
  async validateCompanyUrl(url: string): Promise<{ isValid: boolean; error?: string }> {
    try {
      if (!this.isValidUrl(url)) {
        return { isValid: false, error: 'Invalid URL format' };
      }

      // Perform a HEAD request to check if the URL is accessible
      const response = await axios.head(url, {
        headers: { 'User-Agent': this.userAgent },
        timeout: 10000,
        maxRedirects: 3,
      });

      const isValid = response.status >= 200 && response.status < 400;
      return {
        isValid,
        error: isValid ? undefined : `HTTP ${response.status}: ${response.statusText}`
      };

    } catch (error) {
      this.logger.warn(`URL validation failed for ${url}:`, error.message);
      return { 
        isValid: false, 
        error: `Connection failed: ${error.message}` 
      };
    }
  }

  /**
   * Parse dev.bg company profile HTML
   */
  private parseDevBgCompanyProfile(html: string, _sourceUrl: string): Omit<CompanyProfileData, 'rawContent' | 'sourceUrl' | 'sourceSite' | 'scrapedAt'> {
    const $ = cheerio.load(html);
    
    // Extract company name
    const name = $('.company-name, .page-title, h1').first().text().trim() || 
                 $('title').text().replace(/\s*-\s*dev\.bg.*$/, '').trim();

    // Extract description
    const description = $('.company-description, .about-company, .company-info p').first().text().trim() || 
                       $('.content .text, .company-details').first().text().trim();

    // Extract website
    const website = $('a[href^="http"]:not([href*="dev.bg"])')
      .filter((_, el) => {
        const href = $(el).attr('href');
        return href && !href.includes('linkedin.com') && !href.includes('facebook.com');
      })
      .first().attr('href');

    // Extract location
    const location = $('.company-location, .location, .address')
      .first().text().trim().replace(/^Location:\s*/i, '') ||
      $('span:contains("София"), span:contains("Пловдив"), span:contains("Варна")')
      .first().text().trim();

    // Extract size/employee count
    const sizeText = $('.company-size, .employees, .team-size')
      .first().text().trim();
    const employeeCount = this.extractEmployeeCount(sizeText);
    const size = this.normalizeCompanySize(sizeText || '');

    // Extract industry
    const industry = $('.industry, .sector, .business-area')
      .first().text().trim() || 'Technology';

    // Extract benefits
    const benefits = this.extractBenefits($);

    // Extract technologies
    const technologies = this.extractTechnologies($);

    // Extract company values
    const values = this.extractValues($);

    return {
      name,
      description: description || undefined,
      website: website || undefined,
      industry: industry || undefined,
      size: size || undefined,
      location: location || undefined,
      employeeCount: employeeCount || undefined,
      benefits: benefits.length > 0 ? benefits : undefined,
      technologies: technologies.length > 0 ? technologies : undefined,
      values: values.length > 0 ? values : undefined,
    };
  }

  /**
   * Parse company website HTML for additional information
   */
  private parseCompanyWebsite(html: string, _sourceUrl: string): Omit<CompanyProfileData, 'rawContent' | 'sourceUrl' | 'sourceSite' | 'scrapedAt'> {
    const $ = cheerio.load(html);
    
    // Extract company name from multiple possible sources
    const name = $('h1').first().text().trim() ||
                 $('.company-name, .brand-name, .site-title').first().text().trim() ||
                 $('title').text().split(/[-|]/, 1)[0].trim();

    // Extract description from about sections
    const description = $('.about, .company-description, .intro, #about').first().text().trim() ||
                       $('meta[name="description"]').attr('content') ||
                       $('.hero-text, .hero-description').first().text().trim();

    // Extract location from contact or footer
    const location = $('.address, .location, .contact-address')
      .first().text().trim();

    // Extract values/mission from common sections
    const values = [
      ...$('.values li, .mission, .vision').map((_, el) => $(el).text().trim()).get(),
      ...$('h2:contains("Values"), h3:contains("Mission")').next().find('li').map((_, el) => $(el).text().trim()).get()
    ].filter(Boolean).slice(0, 5);

    // Extract benefits from careers pages
    const benefits = [
      ...$('.benefits li, .perks li, .careers-benefits li').map((_, el) => $(el).text().trim()).get(),
      ...$('h2:contains("Benefits"), h3:contains("Perks")').next().find('li').map((_, el) => $(el).text().trim()).get()
    ].filter(Boolean).slice(0, 10);

    // Extract tech stack from tech/engineering sections
    const technologies = [
      ...$('.tech-stack li, .technologies li, .tools li').map((_, el) => $(el).text().trim()).get(),
      ...$('h2:contains("Technology"), h3:contains("Tech Stack")').next().find('li').map((_, el) => $(el).text().trim()).get()
    ].filter(Boolean).slice(0, 15);

    return {
      name,
      description: description || undefined,
      location: location || undefined,
      benefits: benefits.length > 0 ? benefits : undefined,
      technologies: technologies.length > 0 ? technologies : undefined,
      values: values.length > 0 ? values : undefined,
    };
  }

  /**
   * Extract benefits from company page
   */
  private extractBenefits($: cheerio.CheerioAPI): string[] {
    const benefits: string[] = [];
    
    // Common benefit selectors
    const benefitSelectors = [
      '.benefits li',
      '.perks li', 
      '.company-benefits li',
      '.why-join-us li',
      '.advantages li'
    ];

    for (const selector of benefitSelectors) {
      $(selector).each((_, element) => {
        const benefit = $(element).text().trim();
        if (benefit && !benefits.includes(benefit)) {
          benefits.push(benefit);
        }
      });
    }

    // Look for benefit keywords in text
    const benefitKeywords = [
      'health insurance', 'dental', 'vision', 'medical',
      'remote work', 'flexible hours', 'work from home',
      'vacation', 'paid time off', 'holidays',
      'bonus', 'equity', 'stock options',
      'training', 'learning', 'development',
      'gym', 'fitness', 'wellness',
      'free lunch', 'snacks', 'coffee',
      'parking', 'transport', 'public transport'
    ];

    const pageText = $.text().toLowerCase();
    benefitKeywords.forEach(keyword => {
      if (pageText.includes(keyword) && benefits.length < 10) {
        benefits.push(keyword);
      }
    });

    return benefits.slice(0, 10);
  }

  /**
   * Extract technologies from company page
   */
  private extractTechnologies($: cheerio.CheerioAPI): string[] {
    const technologies: string[] = [];
    
    // Common tech selectors
    const techSelectors = [
      '.technologies li',
      '.tech-stack li',
      '.skills li',
      '.tools li'
    ];

    for (const selector of techSelectors) {
      $(selector).each((_, element) => {
        const tech = $(element).text().trim();
        if (tech && !technologies.includes(tech)) {
          technologies.push(tech);
        }
      });
    }

    return technologies.slice(0, 15);
  }

  /**
   * Extract company values from page
   */
  private extractValues($: cheerio.CheerioAPI): string[] {
    const values: string[] = [];
    
    // Common value selectors
    const valueSelectors = [
      '.values li',
      '.principles li',
      '.culture li',
      '.beliefs li'
    ];

    for (const selector of valueSelectors) {
      $(selector).each((_, element) => {
        const value = $(element).text().trim();
        if (value && !values.includes(value)) {
          values.push(value);
        }
      });
    }

    return values.slice(0, 5);
  }

  /**
   * Extract employee count from size text
   */
  private extractEmployeeCount(sizeText: string): number | undefined {
    if (!sizeText) return undefined;
    
    const numberMatch = sizeText.match(/(\d+)/);
    return numberMatch ? parseInt(numberMatch[1], 10) : undefined;
  }

  /**
   * Normalize company size to standard categories
   */
  private normalizeCompanySize(sizeText: string): string | undefined {
    if (!sizeText) return undefined;
    
    const text = sizeText.toLowerCase();
    
    if (text.includes('startup') || text.includes('1-10')) return '1-10';
    if (text.includes('small') || text.includes('11-50')) return '11-50';
    if (text.includes('medium') || text.includes('51-200')) return '51-200';
    if (text.includes('large') || text.includes('201-500')) return '201-500';
    if (text.includes('enterprise') || text.includes('500+') || text.includes('1000+')) return '1000+';
    
    return undefined;
  }

  /**
   * Validate URL format
   */
  private isValidUrl(url: string): boolean {
    try {
      const parsedUrl = new URL(url);
      return parsedUrl.protocol === 'http:' || parsedUrl.protocol === 'https:';
    } catch {
      return false;
    }
  }

  /**
   * Fetch page with error handling and rate limiting
   */
  private async fetchPage(url: string): Promise<AxiosResponse<string>> {
    await this.delay(this.requestDelay);
    
    return axios.get(url, {
      headers: {
        'User-Agent': this.userAgent,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5,bg;q=0.3',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
      },
      timeout: this.requestTimeout,
      maxRedirects: 5,
    });
  }

  /**
   * Merge structured data with legacy data (structured takes precedence)
   */
  private mergeCompanyData(
    structuredData: DevBgCompanyData, 
    legacyData: Omit<CompanyProfileData, 'rawContent' | 'sourceUrl' | 'sourceSite' | 'scrapedAt' | 'structuredData' | 'tokenOptimized'>
  ): Omit<CompanyProfileData, 'rawContent' | 'sourceUrl' | 'sourceSite' | 'scrapedAt' | 'structuredData' | 'tokenOptimized'> {
    
    return {
      // Basic information - prefer structured data
      name: structuredData.name || legacyData.name,
      description: structuredData.description || legacyData.description,
      website: structuredData.website || legacyData.website,
      industry: structuredData.industry || legacyData.industry,
      size: this.normalizeCompanySize(structuredData.companySize) || legacyData.size,
      location: this.getBestLocation(structuredData.locations, legacyData.location),
      founded: structuredData.founded || legacyData.founded,
      employeeCount: this.getBestEmployeeCount(structuredData.employees) || legacyData.employeeCount,
      logo: structuredData.logo || legacyData.logo,
      
      // Arrays - merge and deduplicate
      benefits: this.mergeArrays(structuredData.benefits, legacyData.benefits),
      technologies: this.mergeArrays(structuredData.technologies, legacyData.technologies),
      values: this.mergeArrays(structuredData.values, legacyData.values),
    };
  }

  /**
   * Get the best location from structured data
   */
  private getBestLocation(
    locations: DevBgCompanyData['locations'], 
    legacyLocation?: string
  ): string | undefined {
    if (locations.headquarters) return locations.headquarters;
    if (locations.offices.length > 0) return locations.offices[0];
    return legacyLocation;
  }

  /**
   * Get the best employee count from structured employee data
   */
  private getBestEmployeeCount(employees: DevBgCompanyData['employees']): number | undefined {
    // Prefer Bulgaria count for local relevance, then IT count, then global
    if (employees.bulgaria) return employees.bulgaria;
    if (employees.it) return employees.it;
    if (employees.global) return employees.global;
    return undefined;
  }

  /**
   * Merge arrays and remove duplicates
   */
  private mergeArrays(arr1?: string[], arr2?: string[]): string[] | undefined {
    const combined = [...(arr1 || []), ...(arr2 || [])];
    if (combined.length === 0) return undefined;
    
    // Remove duplicates (case-insensitive)
    const unique = combined.filter((item, index) => {
      return combined.findIndex(other => 
        other.toLowerCase() === item.toLowerCase()
      ) === index;
    });
    
    return unique.length > 0 ? unique : undefined;
  }


  /**
   * Check if content contains only JavaScript code (indicating SPA)
   */
  private isJavaScriptOnlyContent(content: string): boolean {
    const $ = cheerio.load(content);
    
    // Remove script tags and check remaining text content
    $('script, noscript, style').remove();
    const textContent = $('body').text().trim();
    
    // If there's very little text content but lots of scripts, likely SPA
    const scriptTags = $('script').length;
    const hasMinimalContent = textContent.length < 500;
    const hasLotsOfScripts = scriptTags > 5;
    
    return hasMinimalContent && hasLotsOfScripts;
  }

  /**
   * Fetch page content using unified browser engine
   */
  private async fetchPageWithBrowser(url: string): Promise<string | null> {
    try {
      this.logger.log(`Using browser automation to fetch: ${url}`);
      
      const session = await this.browserEngine.getSession({
        siteName: 'company-profile',
        headless: true,
        timeout: 30000,
      });
      
      const response = await this.browserEngine.fetchPage(url, session);
      
      if (response.success) {
        this.logger.log(`Successfully fetched ${response.html.length} characters using browser automation`);
        return response.html;
      } else {
        this.logger.error(`Browser automation failed for ${url}: ${response.error}`);
        return null;
      }
      
    } catch (error) {
      this.logger.error(`Browser automation failed for ${url}:`, error.message);
      return null;
    }
  }

  /**
   * Add delay between requests to be respectful
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}