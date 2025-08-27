import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectQueue } from '@nestjs/bull';
import * as Bull from 'bull';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { HashingUtil } from '../../common/utils/hashing.util';

// Type definitions for job data

interface AiExtractionJobData {
  vacancyId?: string;
  contentHash?: string;
  content?: string;
  sourceUrl?: string;
  priority?: number;
  retryCount?: number;
  maxRetries?: number;
  batchId?: string;
}

interface BatchProcessingJobData {
  batchId?: string;
  urls?: string[];
  priority?: number;
  options?: {
    maxConcurrent?: number;
    delayBetweenRequests?: number;
    enableAiExtraction?: boolean;
    qualityThreshold?: number;
  };
}

@Injectable()
export class ScraperScheduler {
  private readonly logger = new Logger(ScraperScheduler.name);

  constructor(
    private readonly configService: ConfigService,
    @InjectQueue('scraper') private readonly scraperQueue: Bull.Queue<any>,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async scheduleDailyDevBgScraping() {
    const isScrapingEnabled = this.configService.get<boolean>('SCRAPER_ENABLED', true);
    
    if (!isScrapingEnabled) {
      this.logger.log('Scraping is disabled, skipping scheduled dev.bg scraping');
      return;
    }


    this.logger.log('Scheduling daily dev.bg scraping job');

    try {
      const job = await this.scraperQueue.add(
        'scrape-dev-bg',
        {
          source: 'dev.bg',
          triggeredBy: 'scheduled_daily',
          options: {
            includeJobDetails: true,
          },
        },
        {
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 5000, // Start with 5 second delay
          },
          removeOnComplete: 10, // Keep 10 completed jobs
          removeOnFail: 5, // Keep 5 failed jobs for debugging
        }
      );

      this.logger.log(`Scheduled dev.bg scraping job with ID: ${job.id}`);

    } catch (error) {
      this.logger.error('Failed to schedule dev.bg scraping job:', error);
    }
  }

  @Cron(CronExpression.EVERY_HOUR)
  async scheduleHealthCheck() {
    this.logger.log('Scheduling hourly health check');

    try {
      const job = await this.scraperQueue.add(
        'health-check',
        {},
        {
          attempts: 1,
          removeOnComplete: 1,
          removeOnFail: 1,
        }
      );

      this.logger.log(`Scheduled health check job with ID: ${job.id}`);

    } catch (error) {
      this.logger.error('Failed to schedule health check job:', error);
    }
  }

  async manualScrapeDevBg(triggeredBy = 'manual'): Promise<string> {
    this.logger.log(`Manually triggering dev.bg scraping (triggered by: ${triggeredBy})`);

    try {
      const job = await this.scraperQueue.add(
        'scrape-dev-bg',
        {
          source: 'dev.bg',
          triggeredBy,
          options: {
            includeJobDetails: true,
          },
        },
        {
          priority: 10, // Higher priority for manual jobs
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 5000,
          },
        }
      );

      this.logger.log(`Manually triggered dev.bg scraping job with ID: ${job.id}`);
      return job.id.toString();

    } catch (error) {
      this.logger.error('Failed to manually trigger dev.bg scraping:', error);
      throw error;
    }
  }

  async getQueueStats() {
    try {
      const [waiting, active, completed, failed] = await Promise.all([
        this.scraperQueue.getWaiting(),
        this.scraperQueue.getActive(),
        this.scraperQueue.getCompleted(),
        this.scraperQueue.getFailed(),
      ]);

      return {
        waiting: waiting.length,
        active: active.length,
        completed: completed.length,
        failed: failed.length,
        total: waiting.length + active.length + completed.length + failed.length,
      };

    } catch (error) {
      this.logger.error('Failed to get queue stats:', error);
      throw error;
    }
  }

  async getJobStatus(jobId: string) {
    try {
      const job = await this.scraperQueue.getJob(jobId);
      
      if (!job) {
        return { status: 'not_found' };
      }

      const state = await job.getState();
      const progress = job.progress();
      
      return {
        id: job.id,
        status: state,
        progress,
        data: job.data,
        processedOn: job.processedOn,
        finishedOn: job.finishedOn,
        failedReason: job.failedReason,
        returnvalue: job.returnvalue,
      };

    } catch (error) {
      this.logger.error(`Failed to get job status for ${jobId}:`, error);
      throw error;
    }
  }

  async cancelJob(jobId: string): Promise<boolean> {
    try {
      const job = await this.scraperQueue.getJob(jobId);
      
      if (!job) {
        this.logger.warn(`Job ${jobId} not found for cancellation`);
        return false;
      }

      await job.remove();
      this.logger.log(`Cancelled job ${jobId}`);
      
      return true;

    } catch (error) {
      this.logger.error(`Failed to cancel job ${jobId}:`, error);
      return false;
    }
  }

  async retryFailedJobs(): Promise<number> {
    try {
      const failedJobs = await this.scraperQueue.getFailed();
      
      this.logger.log(`Found ${failedJobs.length} failed jobs to retry`);

      let retriedCount = 0;
      for (const job of failedJobs) {
        try {
          await job.retry();
          retriedCount++;
          this.logger.log(`Retried job ${job.id}`);
        } catch (error) {
          this.logger.error(`Failed to retry job ${job.id}:`, error);
        }
      }

      this.logger.log(`Successfully retried ${retriedCount} out of ${failedJobs.length} failed jobs`);
      return retriedCount;

    } catch (error) {
      this.logger.error('Failed to retry failed jobs:', error);
      throw error;
    }
  }

  /**
   * Schedule AI extraction for a single vacancy or content
   */
  async scheduleAiExtraction(options: {
    vacancyId?: string;
    content: string;
    sourceUrl: string;
    priority?: number;
    maxRetries?: number;
    batchId?: string;
    delay?: number;
  }): Promise<string> {
    const { 
      vacancyId, 
      content, 
      sourceUrl, 
      priority = 5, 
      maxRetries = 3, 
      batchId,
      delay = 0 
    } = options;

    // Generate content hash for caching using unified utility
    const contentHash = HashingUtil.generateSimpleContentHash(content, false);

    this.logger.log(`Scheduling AI extraction job`, {
      vacancyId,
      sourceUrl,
      priority,
      batchId,
      contentHash: contentHash.substring(0, 8) + '...',
    });

    try {
      const jobData: AiExtractionJobData = {
        vacancyId,
        contentHash,
        content,
        sourceUrl,
        priority,
        retryCount: 0,
        maxRetries,
        batchId,
      };

      const job = await this.scraperQueue.add(
        'ai-extraction',
        jobData,
        {
          priority,
          attempts: maxRetries,
          delay,
          backoff: {
            type: 'exponential',
            delay: 3000,
          },
          removeOnComplete: 50,
          removeOnFail: 25,
        }
      );

      this.logger.log(`Scheduled AI extraction job with ID: ${job.id}`);
      return job.id.toString();

    } catch (error) {
      this.logger.error('Failed to schedule AI extraction job:', error);
      throw error;
    }
  }

  /**
   * Schedule batch processing for multiple URLs
   */
  async scheduleBatchProcessing(options: {
    urls: string[];
    priority?: number;
    maxConcurrent?: number;
    delayBetweenRequests?: number;
    enableAiExtraction?: boolean;
    qualityThreshold?: number;
  }): Promise<string> {
    const { 
      urls, 
      priority = 3, 
      maxConcurrent = 2, 
      delayBetweenRequests = 1000,
      enableAiExtraction = true,
      qualityThreshold = 70
    } = options;

    const batchId = randomUUID();

    this.logger.log(`Scheduling batch processing job`, {
      batchId,
      urlCount: urls.length,
      priority,
      maxConcurrent,
      enableAiExtraction,
    });

    try {
      const jobData: BatchProcessingJobData = {
        batchId,
        urls,
        priority,
        options: {
          maxConcurrent,
          delayBetweenRequests,
          enableAiExtraction,
          qualityThreshold,
        },
      };

      const job = await this.scraperQueue.add(
        'batch-processing',
        jobData,
        {
          priority,
          attempts: 2,
          backoff: {
            type: 'exponential',
            delay: 5000,
          },
          removeOnComplete: 20,
          removeOnFail: 10,
        }
      );

      this.logger.log(`Scheduled batch processing job with ID: ${job.id} for batch: ${batchId}`);
      return job.id.toString();

    } catch (error) {
      this.logger.error('Failed to schedule batch processing job:', error);
      throw error;
    }
  }

  /**
   * Schedule AI extraction for an existing vacancy
   */
  async scheduleAiExtractionForVacancy(
    vacancyId: string,
    content: string,
    sourceUrl: string,
    priority: number = 6
  ): Promise<string> {
    return this.scheduleAiExtraction({
      vacancyId,
      content,
      sourceUrl,
      priority,
    });
  }

  /**
   * Schedule batch AI extraction for multiple vacancies
   */
  async scheduleBatchAiExtraction(vacancies: Array<{
    id: string;
    content: string;
    sourceUrl: string;
  }>, priority: number = 4): Promise<string[]> {
    const batchId = randomUUID();
    const jobIds: string[] = [];

    this.logger.log(`Scheduling batch AI extraction for ${vacancies.length} vacancies`, {
      batchId,
      priority,
    });

    try {
      for (let i = 0; i < vacancies.length; i++) {
        const vacancy = vacancies[i];
        const delay = i * 500; // Stagger jobs by 500ms

        const jobId = await this.scheduleAiExtraction({
          vacancyId: vacancy.id,
          content: vacancy.content,
          sourceUrl: vacancy.sourceUrl,
          priority,
          batchId,
          delay,
        });

        jobIds.push(jobId);
      }

      this.logger.log(`Scheduled ${jobIds.length} AI extraction jobs for batch: ${batchId}`);
      return jobIds;

    } catch (error) {
      this.logger.error('Failed to schedule batch AI extraction:', error);
      throw error;
    }
  }

  /**
   * Get detailed queue statistics including AI-specific metrics
   */
  async getDetailedQueueStats() {
    try {
      const [waiting, active, completed, failed, delayed] = await Promise.all([
        this.scraperQueue.getWaiting(),
        this.scraperQueue.getActive(),
        this.scraperQueue.getCompleted(),
        this.scraperQueue.getFailed(),
        this.scraperQueue.getDelayed(),
      ]);

      // Count jobs by type
      const jobsByType = {
        'scrape-dev-bg': 0,
        'health-check': 0,
        'ai-extraction': 0,
        'batch-processing': 0,
        'unknown': 0,
      };

      [...waiting, ...active, ...delayed].forEach(job => {
        const jobType = job.name as keyof typeof jobsByType;
        if (jobType in jobsByType) {
          jobsByType[jobType]++;
        } else {
          jobsByType.unknown++;
        }
      });

      return {
        counts: {
          waiting: waiting.length,
          active: active.length,
          completed: completed.length,
          failed: failed.length,
          delayed: delayed.length,
          total: waiting.length + active.length + completed.length + failed.length + delayed.length,
        },
        jobsByType,
        activeJobs: active.map(job => ({
          id: job.id,
          name: job.name,
          progress: job.progress(),
          processedOn: job.processedOn,
        })),
      };

    } catch (error) {
      this.logger.error('Failed to get detailed queue stats:', error);
      throw error;
    }
  }

  /**
   * Get jobs by batch ID
   */
  async getBatchJobs(batchId: string) {
    try {
      const [waiting, active, completed, failed] = await Promise.all([
        this.scraperQueue.getWaiting(),
        this.scraperQueue.getActive(),
        this.scraperQueue.getCompleted(),
        this.scraperQueue.getFailed(),
      ]);

      const allJobs = [...waiting, ...active, ...completed, ...failed];
      const batchJobs = allJobs.filter(job => {
        const data = job.data as AiExtractionJobData | BatchProcessingJobData;
        return data.batchId === batchId;
      });

      return batchJobs.map(job => ({
        id: job.id,
        name: job.name,
        status: job.finishedOn ? (job.failedReason ? 'failed' : 'completed') : 
                job.processedOn ? 'active' : 'waiting',
        progress: job.progress(),
        data: job.data,
        processedOn: job.processedOn,
        finishedOn: job.finishedOn,
        failedReason: job.failedReason,
      }));

    } catch (error) {
      this.logger.error(`Failed to get batch jobs for ${batchId}:`, error);
      throw error;
    }
  }

  /**
   * Pause/Resume queue processing
   */
  async pauseQueue(): Promise<void> {
    await this.scraperQueue.pause();
    this.logger.log('Queue paused');
  }

  async resumeQueue(): Promise<void> {
    await this.scraperQueue.resume();
    this.logger.log('Queue resumed');
  }

  /**
   * Get queue health metrics
   */
  async getQueueHealth() {
    try {
      const stats = await this.getDetailedQueueStats();
      const isPaused = await this.scraperQueue.isPaused();
      
      // Calculate health score based on queue metrics
      const activeRatio = stats.counts.active / Math.max(stats.counts.total, 1);
      const failedRatio = stats.counts.failed / Math.max(stats.counts.total, 1);
      
      const healthScore = Math.max(0, Math.min(100, 
        100 - (failedRatio * 50) - (isPaused ? 30 : 0) - (activeRatio > 0.8 ? 20 : 0)
      ));

      return {
        healthScore: Math.round(healthScore),
        status: healthScore > 80 ? 'healthy' : healthScore > 50 ? 'degraded' : 'unhealthy',
        isPaused,
        stats,
        timestamp: new Date(),
      };

    } catch (error) {
      this.logger.error('Failed to get queue health:', error);
      return {
        healthScore: 0,
        status: 'error',
        isPaused: true,
        error: error.message,
        timestamp: new Date(),
      };
    }
  }

  async cleanOldJobs(): Promise<void> {
    try {
      // Clean completed jobs older than 7 days
      const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
      
      await this.scraperQueue.clean(sevenDaysAgo, 'completed');
      await this.scraperQueue.clean(sevenDaysAgo, 'failed');
      
      this.logger.log('Cleaned old jobs from queue');

    } catch (error) {
      this.logger.error('Failed to clean old jobs:', error);
    }
  }
}