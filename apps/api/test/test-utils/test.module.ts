import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { DatabaseModule } from '../../src/common/database/database.module';
import { RedisService } from '../../src/common/redis/redis.service';
import { PrismaService } from '../../src/common/database/prisma.service';
import { DatabaseHelper } from './database.helper';
import { RedisMockService } from './redis-mock.service';

// Import scraper services for mocking
import { BrowserEngineService } from '../../src/modules/scraper/services/browser-engine.service';
import { PaidScraperService } from '../../src/modules/scraper/services/paid-scraper.service';
import { CreditTrackerService } from '../../src/modules/scraper/services/credit-tracker.service';
import { ScrapingOrchestratorService } from '../../src/modules/scraper/services/scraping-orchestrator.service';
import { AntiBypassService } from '../../src/modules/scraper/services/anti-bypass.service';
import { JobsBgParsingService } from '../../src/modules/scraper/services/jobs-bg-parsing.service';

// Import AI services for mocking
import { AICoreService } from '../../src/modules/ai/services/ai-core.service';
import { AiRequestLoggerService } from '../../src/common/ai-logging/ai-request-logger.service';

// Import mock services
import { 
  BrowserEngineServiceMock,
  PaidScraperServiceMock,
  CreditTrackerServiceMock,
  ScrapingOrchestratorServiceMock,
  AntiBypassServiceMock,
  JobsBgParsingServiceMock
} from './scraper-mock.service';

import {
  AICoreServiceMock,
  AiRequestLoggerServiceMock
} from './ai-core-mock.service';

// Import config files
import { appConfig } from '../../src/config/app.config';
import { databaseConfig } from '../../src/config/database.config';
import { redisConfig } from '../../src/config/redis.config';
import { aiConfig } from '../../src/config/ai.config';
import scraperConfig from '../../src/config/scraper.config';
import paidServicesConfig from '../../src/config/paid-services.config';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig, databaseConfig, redisConfig, aiConfig, scraperConfig, paidServicesConfig],
      envFilePath: ['.env.test', '.env'],
    }),
    DatabaseModule,
  ],
  providers: [
    {
      provide: RedisService,
      useClass: RedisMockService,
    },
    // Mock scraper services
    {
      provide: BrowserEngineService,
      useClass: BrowserEngineServiceMock,
    },
    {
      provide: PaidScraperService,
      useClass: PaidScraperServiceMock,
    },
    {
      provide: CreditTrackerService,
      useClass: CreditTrackerServiceMock,
    },
    {
      provide: ScrapingOrchestratorService,
      useClass: ScrapingOrchestratorServiceMock,
    },
    {
      provide: AntiBypassService,
      useClass: AntiBypassServiceMock,
    },
    {
      provide: JobsBgParsingService,
      useClass: JobsBgParsingServiceMock,
    },
    // Mock AI services
    {
      provide: AICoreService,
      useClass: AICoreServiceMock,
    },
    {
      provide: AiRequestLoggerService,
      useClass: AiRequestLoggerServiceMock,
    },
  ],
  exports: [
    RedisService, 
    BrowserEngineService,
    PaidScraperService,
    CreditTrackerService,
    ScrapingOrchestratorService,
    AntiBypassService,
    JobsBgParsingService,
    AICoreService,
    AiRequestLoggerService,
  ],
})
export class TestModule {
  static async createTestingModule(imports: any[] = [], providers: any[] = []): Promise<TestingModule> {
    const moduleRef = await Test.createTestingModule({
      imports: [TestModule, ...imports],
      providers: [...providers],
    }).compile();

    // Initialize test database
    await DatabaseHelper.initializeTestDatabase();
    
    return moduleRef;
  }

  static async clearTestData(): Promise<void> {
    await DatabaseHelper.clearDatabase();
  }

  static async seedTestData(): Promise<void> {
    await DatabaseHelper.seedTestData();
  }

  static async closeTestModule(moduleRef: TestingModule): Promise<void> {
    if (moduleRef) {
      try {
        const prismaService = moduleRef.get<PrismaService>(PrismaService);
        if (prismaService) {
          await prismaService.$disconnect();
        }
        await moduleRef.close();
      } catch (error) {
        // Ignore errors during cleanup
        // eslint-disable-next-line no-console
        console.warn('Error during test module cleanup:', error.message);
      }
    }
    await DatabaseHelper.closeDatabase();
  }
}