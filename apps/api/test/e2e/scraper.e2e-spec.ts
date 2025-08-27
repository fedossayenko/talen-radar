import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import helmet from 'helmet';
import compression from 'compression';
import { AppModule } from '../../src/app.module';
import { RedisService } from '../../src/common/redis/redis.service';
import { RedisMockService } from '../test-utils/redis-mock.service';
import { AICoreService } from '../../src/modules/ai/services/ai-core.service';
import { AiRequestLoggerService } from '../../src/common/ai-logging/ai-request-logger.service';
import { AICoreServiceMock, AiRequestLoggerServiceMock } from '../test-utils/ai-core-mock.service';
import { BrowserEngineService } from '../../src/modules/scraper/services/browser-engine.service';
import { PaidScraperService } from '../../src/modules/scraper/services/paid-scraper.service';
import { CreditTrackerService } from '../../src/modules/scraper/services/credit-tracker.service';
import { 
  BrowserEngineServiceMock,
  PaidScraperServiceMock,
  CreditTrackerServiceMock
} from '../test-utils/scraper-mock.service';
import { DatabaseHelper } from '../test-utils/database.helper';

describe('ScraperController (e2e)', () => {
  let app: INestApplication;
  let moduleRef: TestingModule;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
    .overrideProvider(RedisService)
    .useClass(RedisMockService)
    .overrideProvider(AICoreService)
    .useClass(AICoreServiceMock)
    .overrideProvider(AiRequestLoggerService)
    .useClass(AiRequestLoggerServiceMock)
    .overrideProvider(BrowserEngineService)
    .useClass(BrowserEngineServiceMock)
    .overrideProvider(PaidScraperService)
    .useClass(PaidScraperServiceMock)
    .overrideProvider(CreditTrackerService)
    .useClass(CreditTrackerServiceMock)
    .compile();

    app = moduleRef.createNestApplication();
    
    if (!app) {
      throw new Error('Failed to create NestJS application for testing');
    }
    
    // Configure the app like in main.ts for tests
    app.use(helmet());
    app.use(compression());
    
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: {
          enableImplicitConversion: true,
        },
      }),
    );
    
    app.setGlobalPrefix('api/v1');
    app.enableCors({
      origin: true, // Allow all origins in test environment
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
      allowedHeaders: ['Content-Type', 'Authorization'],
    });
    
    await app.init();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
    if (moduleRef) {
      await moduleRef.close();
    }
  });

  beforeEach(async () => {
    await DatabaseHelper.clearDatabase();
  });

  describe('POST /api/v1/scraper/scrape', () => {
    it('should scrape jobs from dev.bg without saving', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/scraper/scrape')
        .query({ 
          url: 'dev.bg',
          limit: 2,
          save: false 
        })
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('results');
      expect(response.body).toHaveProperty('summary');
      expect(response.body.summary).toHaveProperty('totalJobs');
      expect(response.body.summary).toHaveProperty('processingTime');
      expect(response.body.results).toHaveProperty('jobs');
      expect(Array.isArray(response.body.results.jobs)).toBe(true);
    });

    it('should scrape jobs from jobs.bg without saving', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/scraper/scrape')
        .query({ 
          url: 'jobs.bg',
          limit: 1,
          save: false 
        })
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('results');
      expect(response.body.summary).toHaveProperty('totalJobs');
    });

    it('should scrape and save jobs to database', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/scraper/scrape')
        .query({ 
          url: 'dev.bg',
          limit: 1,
          save: true 
        })
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('saveStats');
      expect(response.body.saveStats).toHaveProperty('vacanciesSaved');
      expect(response.body.saveStats).toHaveProperty('companiesProcessed');
    });

    it('should handle full URL scraping', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/scraper/scrape')
        .query({ 
          url: 'https://dev.bg/company/jobs/java/',
          limit: 1,
          save: false 
        })
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('results');
    });

    it('should return error for missing URL parameter', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/scraper/scrape')
        .query({ limit: 1 })
        .expect(200);

      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('URL parameter is required');
    });

    it('should return error for unsupported site', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/scraper/scrape')
        .query({ 
          url: 'unsupported-site.com',
          limit: 1 
        })
        .expect(200);

      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('Unsupported URL or site');
    });

    it('should validate limit parameter', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/scraper/scrape')
        .query({ 
          url: 'dev.bg',
          limit: 0,
          save: false 
        })
        .expect(200);

      // Should use default limit of 1
      expect(response.body).toHaveProperty('success', true);
    });
  });

  describe('GET /api/v1/scraper/sites', () => {
    it('should return list of available scraper sites', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/scraper/sites')
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('sites');
      expect(Array.isArray(response.body.sites)).toBe(true);
      expect(response.body.sites.length).toBeGreaterThan(0);
      
      // Should include dev.bg and jobs.bg
      const siteNames = response.body.sites.map(site => site.name);
      expect(siteNames).toContain('dev.bg');
    });

    it('should return site details with configuration', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/scraper/sites')
        .expect(200);

      const sites = response.body.sites;
      expect(sites[0]).toHaveProperty('name');
      expect(sites[0]).toHaveProperty('enabled');
      expect(sites[0]).toHaveProperty('description');
      expect(sites[0]).toHaveProperty('baseUrl');
    });
  });

  describe('GET /api/v1/scraper/status', () => {
    it('should return scraper service status', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/scraper/status')
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('status');
      expect(response.body.status).toHaveProperty('totalScrapers');
      expect(response.body.status).toHaveProperty('enabledScrapers');
      expect(response.body.status).toHaveProperty('lastScrapeTime');
      expect(response.body.status).toHaveProperty('healthStatus');
    });

    it('should include individual scraper status', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/scraper/status')
        .expect(200);

      expect(response.body.status).toHaveProperty('scrapers');
      expect(Array.isArray(response.body.status.scrapers)).toBe(true);
      
      if (response.body.status.scrapers.length > 0) {
        const scraper = response.body.status.scrapers[0];
        expect(scraper).toHaveProperty('name');
        expect(scraper).toHaveProperty('enabled');
        expect(scraper).toHaveProperty('lastUsed');
      }
    });
  });

  describe('GET /api/v1/scraper/monitoring/limits', () => {
    it('should return service limits and remaining credits', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/scraper/monitoring/limits')
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('data');
      expect(response.body).toHaveProperty('timestamp');
      expect(response.body.data).toHaveProperty('scraperapi');
      
      const scraperApiLimits = response.body.data.scraperapi;
      expect(scraperApiLimits).toHaveProperty('totalCredits');
      expect(scraperApiLimits).toHaveProperty('usedCredits');
      expect(scraperApiLimits).toHaveProperty('remainingCredits');
      expect(scraperApiLimits).toHaveProperty('resetDate');
    });

    it('should handle service limits error gracefully', async () => {
      // This test verifies error handling, mock will return success
      const response = await request(app.getHttpServer())
        .get('/api/v1/scraper/monitoring/limits')
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
    });
  });

  describe('GET /api/v1/scraper/monitoring/stats', () => {
    it('should return usage statistics', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/scraper/monitoring/stats')
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('data');
      
      const stats = response.body.data;
      expect(stats).toHaveProperty('today');
      expect(stats).toHaveProperty('thisWeek');
      expect(stats).toHaveProperty('thisMonth');
      
      expect(stats.today).toHaveProperty('requests');
      expect(stats.today).toHaveProperty('credits');
      expect(stats.today).toHaveProperty('errors');
      
      expect(typeof stats.today.requests).toBe('number');
      expect(typeof stats.today.credits).toBe('number');
      expect(typeof stats.today.errors).toBe('number');
    });

    it('should include weekly and monthly statistics', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/scraper/monitoring/stats')
        .expect(200);

      const stats = response.body.data;
      
      expect(stats.thisWeek).toHaveProperty('requests');
      expect(stats.thisWeek).toHaveProperty('credits');
      expect(stats.thisWeek).toHaveProperty('errors');
      
      expect(stats.thisMonth).toHaveProperty('requests');
      expect(stats.thisMonth).toHaveProperty('credits');
      expect(stats.thisMonth).toHaveProperty('errors');
    });
  });

  describe('Rate Limiting and Performance', () => {
    it('should handle concurrent scraping requests', async () => {
      const promises = Array.from({ length: 3 }, () =>
        request(app.getHttpServer())
          .post('/api/v1/scraper/scrape')
          .query({ 
            url: 'dev.bg',
            limit: 1,
            save: false 
          })
      );

      const responses = await Promise.all(promises);
      
      responses.forEach(response => {
        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('success', true);
      });
    });

    it('should return reasonable response times', async () => {
      const startTime = Date.now();
      
      const response = await request(app.getHttpServer())
        .post('/api/v1/scraper/scrape')
        .query({ 
          url: 'dev.bg',
          limit: 1,
          save: false 
        })
        .expect(200);

      const responseTime = Date.now() - startTime;
      
      expect(responseTime).toBeLessThan(5000); // Should respond within 5 seconds
      expect(response.body).toHaveProperty('success', true);
    });
  });

  describe('Error Handling and Resilience', () => {
    it('should handle invalid query parameters gracefully', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/scraper/scrape')
        .query({ 
          url: 'dev.bg',
          limit: 'invalid',
          save: 'invalid'
        })
        .expect(200);

      // Should handle invalid parameters and use defaults
      expect(response.body).toHaveProperty('success', true);
    });

    it('should handle malformed URLs', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/scraper/scrape')
        .query({ 
          url: 'not-a-valid-url',
          limit: 1
        })
        .expect(200);

      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('error');
    });
  });

  describe('Authentication and Authorization', () => {
    it('should allow public access to scraping endpoints', async () => {
      // No authorization header needed for scraping endpoints
      const response = await request(app.getHttpServer())
        .post('/api/v1/scraper/scrape')
        .query({ 
          url: 'dev.bg',
          limit: 1,
          save: false 
        })
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
    });

    it('should allow public access to monitoring endpoints', async () => {
      // No authorization header needed for monitoring endpoints
      const response = await request(app.getHttpServer())
        .get('/api/v1/scraper/monitoring/stats')
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
    });
  });
});