import { Controller, Get, Logger } from '@nestjs/common';
import { CreditTrackerService } from '../services/credit-tracker.service';
import { PaidScraperService } from '../services/paid-scraper.service';

/**
 * Controller for monitoring paid scraping services
 * Provides endpoints for credit usage, service health, and statistics
 */
@Controller('scraper/monitoring')
export class ScraperMonitoringController {
  private readonly logger = new Logger(ScraperMonitoringController.name);

  constructor(
    private readonly creditTrackerService: CreditTrackerService,
    private readonly paidScraperService: PaidScraperService,
  ) {}

  /**
   * Get current service limits and remaining credits
   */
  @Get('limits')
  async getServiceLimits() {
    try {
      this.logger.log('📊 Fetching service limits...');
      const limits = await this.creditTrackerService.getServiceLimits();
      
      return {
        success: true,
        data: limits,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error(`Failed to get service limits: ${error.message}`);
      return {
        success: false,
        error: error.message,
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * Get detailed usage statistics
   */
  @Get('stats')
  async getUsageStats() {
    try {
      this.logger.log('📈 Fetching usage statistics...');
      const stats = await this.creditTrackerService.getUsageStats();
      
      return {
        success: true,
        data: stats,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error(`Failed to get usage stats: ${error.message}`);
      return {
        success: false,
        error: error.message,
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * Get current usage percentage for all services
   */
  @Get('usage')
  async getUsagePercentages() {
    try {
      this.logger.log('🔍 Fetching usage percentages...');
      
      const scraperAPIUsage = await this.creditTrackerService.getUsagePercentage('scraperapi');
      const scrapingDogUsage = await this.creditTrackerService.getUsagePercentage('scrapingdog');
      
      const usage = {
        scraperapi: {
          percentage: scraperAPIUsage,
          status: this.getUsageStatus(scraperAPIUsage),
        },
        scrapingdog: {
          percentage: scrapingDogUsage,
          status: this.getUsageStatus(scrapingDogUsage),
        },
      };
      
      return {
        success: true,
        data: usage,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error(`Failed to get usage percentages: ${error.message}`);
      return {
        success: false,
        error: error.message,
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * Test service connectivity
   */
  @Get('health')
  async testServices() {
    try {
      this.logger.log('🔍 Testing service connectivity...');
      
      const availableServices = this.paidScraperService.getAvailableServices();
      const healthResults = {};
      
      for (const service of availableServices) {
        try {
          const isHealthy = await this.paidScraperService.testService(service);
          healthResults[service] = {
            status: isHealthy ? 'healthy' : 'unhealthy',
            tested: true,
          };
        } catch (error) {
          healthResults[service] = {
            status: 'error',
            tested: true,
            error: error.message,
          };
        }
      }
      
      return {
        success: true,
        data: {
          availableServices,
          health: healthResults,
        },
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error(`Failed to test services: ${error.message}`);
      return {
        success: false,
        error: error.message,
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * Estimate monthly cost based on hypothetical usage
   */
  @Get('cost-estimate')
  async getCostEstimate() {
    try {
      this.logger.log('💰 Calculating cost estimate...');
      
      // Example usage patterns for estimation
      const exampleUsage = {
        'jobs.bg': 100, // 100 requests per month to jobs.bg (10 credits each)
        'dev.bg': 50,   // 50 requests per month to dev.bg (1 credit each)
      };
      
      const estimate = await this.creditTrackerService.estimateMonthlyCost(exampleUsage);
      
      return {
        success: true,
        data: {
          ...estimate,
          exampleUsage,
          currency: 'USD',
        },
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error(`Failed to get cost estimate: ${error.message}`);
      return {
        success: false,
        error: error.message,
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * Get comprehensive monitoring dashboard data
   */
  @Get('dashboard')
  async getDashboard() {
    try {
      this.logger.log('📊 Fetching dashboard data...');
      
      const [limits, stats, usage, health] = await Promise.all([
        this.creditTrackerService.getServiceLimits(),
        this.creditTrackerService.getUsageStats(),
        this.getUsagePercentagesInternal(),
        this.testServicesInternal(),
      ]);
      
      return {
        success: true,
        data: {
          limits,
          stats,
          usage,
          health,
          alerts: this.generateAlerts(usage),
        },
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error(`Failed to get dashboard data: ${error.message}`);
      return {
        success: false,
        error: error.message,
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * Force reset monthly usage counters (admin only)
   */
  @Get('reset-usage')
  async resetUsage() {
    try {
      this.logger.log('🔄 Forcing usage reset...');
      await this.creditTrackerService.resetMonthlyUsage();
      
      return {
        success: true,
        message: 'Usage counters reset successfully',
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error(`Failed to reset usage: ${error.message}`);
      return {
        success: false,
        error: error.message,
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * Get usage status based on percentage
   */
  private getUsageStatus(percentage: number): 'low' | 'medium' | 'high' | 'critical' {
    if (percentage >= 95) return 'critical';
    if (percentage >= 80) return 'high';
    if (percentage >= 50) return 'medium';
    return 'low';
  }

  /**
   * Internal method to get usage percentages
   */
  private async getUsagePercentagesInternal() {
    const scraperAPIUsage = await this.creditTrackerService.getUsagePercentage('scraperapi');
    const scrapingDogUsage = await this.creditTrackerService.getUsagePercentage('scrapingdog');
    
    return {
      scraperapi: {
        percentage: scraperAPIUsage,
        status: this.getUsageStatus(scraperAPIUsage),
      },
      scrapingdog: {
        percentage: scrapingDogUsage,
        status: this.getUsageStatus(scrapingDogUsage),
      },
    };
  }

  /**
   * Internal method to test services
   */
  private async testServicesInternal() {
    const availableServices = this.paidScraperService.getAvailableServices();
    const healthResults = {};
    
    for (const service of availableServices) {
      try {
        const isHealthy = await this.paidScraperService.testService(service);
        healthResults[service] = {
          status: isHealthy ? 'healthy' : 'unhealthy',
          tested: true,
        };
      } catch (error) {
        healthResults[service] = {
          status: 'error',
          tested: true,
          error: error.message,
        };
      }
    }
    
    return {
      availableServices,
      health: healthResults,
    };
  }

  /**
   * Generate alerts based on current usage
   */
  private generateAlerts(usage: any): Array<{ type: string; message: string; severity: 'info' | 'warning' | 'error' }> {
    const alerts = [];
    
    Object.entries(usage).forEach(([service, data]: [string, any]) => {
      if (data.status === 'critical') {
        alerts.push({
          type: 'credit_usage',
          message: `${service.toUpperCase()} usage is critical (${data.percentage.toFixed(1)}%). Consider monitoring closely.`,
          severity: 'error' as const,
        });
      } else if (data.status === 'high') {
        alerts.push({
          type: 'credit_usage',
          message: `${service.toUpperCase()} usage is high (${data.percentage.toFixed(1)}%). Monitor usage carefully.`,
          severity: 'warning' as const,
        });
      }
    });
    
    if (alerts.length === 0) {
      alerts.push({
        type: 'credit_usage',
        message: 'All services are operating within normal usage limits.',
        severity: 'info' as const,
      });
    }
    
    return alerts;
  }
}