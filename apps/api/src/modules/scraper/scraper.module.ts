import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BullModule } from '@nestjs/bull';
import { HttpModule } from '@nestjs/axios';

// Services
import { ScraperRegistryService } from './services/scraper-registry.service';
import { ScraperService } from './scraper.service';

// Scrapers
import { DevBgScraper } from './scrapers/dev-bg.scraper';
import { JobsBgScraper } from './scrapers/jobs-bg.scraper';

// Support services
import { TranslationService } from './services/translation.service';
import { JobParserService } from './services/job-parser.service';
import { TechPatternService } from './services/tech-pattern.service';
import { ContentExtractorService } from './services/content-extractor.service';
import { HtmlCleanerService } from './services/html-cleaner.service';

// Unified browser service
import { BrowserEngineService } from './services/browser-engine.service';

// Paid scraping services
import { PaidScraperService } from './services/paid-scraper.service';
import { CreditTrackerService } from './services/credit-tracker.service';

// Orchestration and parsing services
import { ScrapingOrchestratorService } from './services/scraping-orchestrator.service';
import { AntiBypassService } from './services/anti-bypass.service';
import { JobsBgParsingService } from './services/jobs-bg-parsing.service';

// Controllers
import { ScraperController } from './scraper.controller';
import { ScraperMonitoringController } from './controllers/scraper-monitoring.controller';

// External modules
import { DatabaseModule } from '../../common/database/database.module';
import { VacancyModule } from '../vacancy/vacancy.module';
import { CompanyModule } from '../company/company.module';
import scraperConfig from '../../config/scraper.config';
import paidServicesConfig from '../../config/paid-services.config';

/**
 * Simplified Scraper Module
 * 
 * Features:
 * - Direct scraper access via registry
 * - Support for dev.bg and jobs.bg
 * - Clean, single-endpoint architecture
 */
@Module({
  imports: [
    ConfigModule.forFeature(scraperConfig),
    ConfigModule.forFeature(paidServicesConfig),
    HttpModule,
    DatabaseModule,
    VacancyModule,
    CompanyModule,
    BullModule.registerQueue({
      name: 'scraper',
    }),
  ],
  controllers: [
    ScraperController,
    ScraperMonitoringController,
  ],
  providers: [
    // === Core Services ===
    ScraperService,
    ScraperRegistryService,

    // === Browser Services ===
    BrowserEngineService,

    // === Paid Scraping Services ===
    PaidScraperService,
    CreditTrackerService,

    // === Orchestration Services ===
    ScrapingOrchestratorService,
    AntiBypassService,
    JobsBgParsingService,

    // === Scrapers ===
    DevBgScraper,
    JobsBgScraper,

    // === Shared Services ===
    TranslationService,
    JobParserService,
    TechPatternService,
    ContentExtractorService,
    HtmlCleanerService,
  ],
  exports: [
    ScraperService,
    ScraperRegistryService,
    BrowserEngineService,
    PaidScraperService,
    CreditTrackerService,
    ContentExtractorService,
    HtmlCleanerService,
  ],
})
export class ScraperModule {}