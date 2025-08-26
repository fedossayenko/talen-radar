import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../common/database/prisma.service';
import {
  CreditUsage,
  ServiceLimits,
  PaidServiceStats,
} from '../interfaces/paid-scraper.interface';

@Injectable()
export class CreditTrackerService {
  private readonly logger = new Logger(CreditTrackerService.name);

  // In-memory cache for current month's usage
  private monthlyUsage = new Map<string, number>();
  private lastReset = new Date();

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    this.logger.log('CreditTrackerService initialized');
    this.initializeUsageCache();
  }

  /**
   * Track credit usage for a request
   */
  async trackUsage(usage: CreditUsage): Promise<void> {
    const key = `${usage.service}_${new Date().getFullYear()}_${new Date().getMonth()}`;
    
    try {
      // Update in-memory cache
      const currentUsage = this.monthlyUsage.get(key) || 0;
      this.monthlyUsage.set(key, currentUsage + usage.credits);

      // Persist to database (if enabled)
      if (this.configService.get('paidServices.creditTracking.persistToDb')) {
        await this.persistUsage(usage);
      }

      // Check limits and alert if necessary
      await this.checkLimitsAndAlert(usage.service, currentUsage + usage.credits);

      this.logger.debug(`Tracked ${usage.credits} credits for ${usage.service} (site: ${usage.site})`);
    } catch (error) {
      this.logger.error(`Failed to track credit usage: ${error.message}`);
    }
  }

  /**
   * Get current usage for all services
   */
  async getServiceLimits(): Promise<ServiceLimits> {
    const now = new Date();
    const currentKey = `scraperapi_${now.getFullYear()}_${now.getMonth()}`;
    const scrapingdogKey = `scrapingdog_${now.getFullYear()}_${now.getMonth()}`;

    const scraperAPIConfig = this.configService.get('paidServices.scraperapi');
    const scrapingDogConfig = this.configService.get('paidServices.scrapingdog');

    const scraperAPIUsage = this.monthlyUsage.get(currentKey) || 0;
    const scrapingDogUsage = this.monthlyUsage.get(scrapingdogKey) || 0;

    return {
      scraperapi: {
        monthly: scraperAPIConfig?.freeMonthlyLimit || 1000,
        daily: Math.floor((scraperAPIConfig?.freeMonthlyLimit || 1000) / 30),
        remaining: Math.max(0, (scraperAPIConfig?.freeMonthlyLimit || 1000) - scraperAPIUsage),
      },
      scrapingdog: {
        trial: scrapingDogConfig?.freeTrialLimit || 1000,
        used: scrapingDogUsage,
        remaining: Math.max(0, (scrapingDogConfig?.freeTrialLimit || 1000) - scrapingDogUsage),
      },
    };
  }

  /**
   * Get detailed usage statistics
   */
  async getUsageStats(): Promise<PaidServiceStats> {
    try {
      // This would typically query the database for comprehensive stats
      // For now, return in-memory data
      const totalCredits = Array.from(this.monthlyUsage.values()).reduce((sum, credits) => sum + credits, 0);
      
      return {
        totalRequests: 0, // Would need to track this separately
        successfulRequests: 0,
        failedRequests: 0,
        totalCredits,
        averageCreditsPerRequest: totalCredits > 0 ? totalCredits / 1 : 0,
        successRate: 0.95, // Would calculate from actual data
        serviceBreakdown: {
          scraperapi: {
            requests: 0,
            credits: this.monthlyUsage.get(`scraperapi_${new Date().getFullYear()}_${new Date().getMonth()}`) || 0,
            successRate: 0.99,
          },
          scrapingdog: {
            requests: 0,
            credits: this.monthlyUsage.get(`scrapingdog_${new Date().getFullYear()}_${new Date().getMonth()}`) || 0,
            successRate: 0.95,
          },
        },
        siteBreakdown: {
          'jobs.bg': {
            requests: 0,
            credits: 0,
            averageCreditsPerRequest: 10,
          },
          'dev.bg': {
            requests: 0,
            credits: 0,
            averageCreditsPerRequest: 1,
          },
        },
      };
    } catch (error) {
      this.logger.error(`Failed to get usage stats: ${error.message}`);
      throw error;
    }
  }

  /**
   * Check if service has available credits
   */
  async hasAvailableCredits(service: string, requiredCredits: number = 1): Promise<boolean> {
    const limits = await this.getServiceLimits();
    
    if (service === 'scraperapi') {
      return limits.scraperapi.remaining >= requiredCredits;
    }
    
    if (service === 'scrapingdog') {
      return limits.scrapingdog.remaining >= requiredCredits;
    }
    
    return false;
  }

  /**
   * Get usage percentage for alerts
   */
  async getUsagePercentage(service: string): Promise<number> {
    const limits = await this.getServiceLimits();
    
    if (service === 'scraperapi') {
      const used = limits.scraperapi.monthly - limits.scraperapi.remaining;
      return (used / limits.scraperapi.monthly) * 100;
    }
    
    if (service === 'scrapingdog') {
      return (limits.scrapingdog.used / limits.scrapingdog.trial) * 100;
    }
    
    return 0;
  }

  /**
   * Reset monthly usage (called on first day of month)
   */
  async resetMonthlyUsage(): Promise<void> {
    const now = new Date();
    
    if (now.getDate() === 1 && now.getMonth() !== this.lastReset.getMonth()) {
      this.logger.log('Resetting monthly credit usage counters');
      this.monthlyUsage.clear();
      this.lastReset = now;
      
      // Archive previous month's data if needed
      // await this.archivePreviousMonth();
    }
  }

  /**
   * Initialize in-memory usage cache from database
   */
  private async initializeUsageCache(): Promise<void> {
    try {
      // Would typically load from database
      // For now, start fresh
      this.monthlyUsage.clear();
      this.logger.debug('Credit usage cache initialized');
    } catch (error) {
      this.logger.error(`Failed to initialize usage cache: ${error.message}`);
    }
  }

  /**
   * Persist usage to database
   */
  private async persistUsage(usage: CreditUsage): Promise<void> {
    try {
      // Would implement database persistence here
      // For now, just log
      this.logger.debug(`Would persist: ${JSON.stringify(usage)}`);
    } catch (error) {
      this.logger.error(`Failed to persist usage: ${error.message}`);
    }
  }

  /**
   * Check limits and send alerts if thresholds are exceeded
   */
  private async checkLimitsAndAlert(service: string, currentUsage: number): Promise<void> {
    const percentage = await this.getUsagePercentage(service);
    const thresholds = this.configService.get('paidServices.creditTracking.alertThresholds');
    
    if (percentage >= (thresholds?.critical || 0.95) * 100) {
      this.logger.error(`🚨 CRITICAL: ${service} usage at ${percentage.toFixed(1)}%! Approaching limit.`);
    } else if (percentage >= (thresholds?.warning || 0.8) * 100) {
      this.logger.warn(`⚠️  WARNING: ${service} usage at ${percentage.toFixed(1)}%`);
    }
  }

  /**
   * Get credit cost for a specific site
   */
  getCreditCost(siteName: string, service: string = 'scraperapi'): number {
    if (service === 'scraperapi') {
      const config = this.configService.get('paidServices.scraperapi');
      return config?.creditsPerRequest?.[siteName] || config?.creditsPerRequest?.default || 1;
    }
    
    return 1; // Default credit cost
  }

  /**
   * Estimate monthly cost based on usage patterns
   */
  async estimateMonthlyCost(requestsPerSite: { [site: string]: number }): Promise<{
    freeCreditsUsed: number;
    paidCreditsNeeded: number;
    estimatedCost: number;
  }> {
    let totalCreditsNeeded = 0;
    
    for (const [site, requests] of Object.entries(requestsPerSite)) {
      const creditsPerRequest = this.getCreditCost(site);
      totalCreditsNeeded += requests * creditsPerRequest;
    }
    
    const freeLimit = this.configService.get('paidServices.scraperapi.freeMonthlyLimit') || 1000;
    const freeCreditsUsed = Math.min(totalCreditsNeeded, freeLimit);
    const paidCreditsNeeded = Math.max(0, totalCreditsNeeded - freeLimit);
    
    // ScraperAPI pricing: roughly $49 for 100,000 credits
    const costPerCredit = 49 / 100000; // $0.00049 per credit
    const estimatedCost = paidCreditsNeeded * costPerCredit;
    
    return {
      freeCreditsUsed,
      paidCreditsNeeded,
      estimatedCost,
    };
  }
}