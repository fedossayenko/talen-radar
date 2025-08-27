import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AiService } from './ai.service';
import { RedisModule } from '../../common/redis/redis.module';
import { AiRequestLoggerService } from '../../common/ai-logging/ai-request-logger.service';
import { ContentExtractorService } from '../scraper/services/content-extractor.service';

// New AI Services
import { AICoreService } from './services/ai-core.service';
import { AIVacancyService } from './services/ai-vacancy.service';
import { AICompanyService } from './services/ai-company.service';
import { AIPromptService } from './services/ai-prompt.service';

@Module({
  imports: [ConfigModule, RedisModule],
  providers: [
    // Legacy service (facade)
    AiService,
    
    // New modular services
    AICoreService,
    AIVacancyService,
    AICompanyService,
    AIPromptService,
    
    // Shared dependencies
    AiRequestLoggerService,
    ContentExtractorService,
  ],
  exports: [
    AiService,
    AIVacancyService,
    AICompanyService,
    AICoreService,
  ],
})
export class AiModule {}