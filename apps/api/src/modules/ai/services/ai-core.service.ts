import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { RedisService } from '../../../common/redis/redis.service';
import { HashingUtil } from '../../../common/utils/hashing.util';
import { AiRequestLoggerService } from '../../../common/ai-logging/ai-request-logger.service';
import { ContentExtractorService } from '../../scraper/services/content-extractor.service';

@Injectable()
export class AICoreService {
  private readonly logger = new Logger(AICoreService.name);
  private readonly openai: OpenAI;

  constructor(
    private readonly configService: ConfigService,
    private readonly redisService: RedisService,
    private readonly aiRequestLogger: AiRequestLoggerService,
    private readonly contentExtractor: ContentExtractorService,
  ) {
    const apiKey = this.configService.get<string>('ai.openai.apiKey');
    this.openai = new OpenAI({ 
      apiKey,
      baseURL: this.configService.get<string>('ai.openai.baseURL') 
    });
  }

  /**
   * Core OpenAI API call with comprehensive logging and error handling
   */
  async callOpenAiWithLogging(
    messages: any[],
    model: string,
    temperature: number = 0.1,
    maxTokens: number = 2000,
    requestType: string = 'general',
    sourceUrl?: string,
  ): Promise<string | undefined> {
    const startTime = Date.now();
    
    try {
      this.logger.log(`Making OpenAI request with model ${model} for ${requestType}`);
      
      const response = await this.openai.chat.completions.create({
        model,
        messages,
        temperature,
        max_tokens: maxTokens,
      });

      const result = response.choices[0]?.message?.content;
      const processingTime = Date.now() - startTime;

      // Log the request
      await this.aiRequestLogger.logRequest(
        requestType,
        {
          model,
          messages,
          response: result,
          tokensUsed: response.usage?.total_tokens || 0,
          processingTime,
          sourceUrl,
          success: true,
        }
      );

      this.logger.log(`OpenAI request completed in ${processingTime}ms, tokens: ${response.usage?.total_tokens}`);
      
      return result;
    } catch (error) {
      const processingTime = Date.now() - startTime;
      
      // Log the failed request
      await this.aiRequestLogger.logRequest(
        requestType,
        {
          model,
          messages,
          response: null,
          tokensUsed: 0,
          processingTime,
          sourceUrl,
          success: false,
          error: error.message,
        }
      );

      this.logger.error(`OpenAI request failed after ${processingTime}ms: ${error.message}`);
      throw error;
    }
  }

  /**
   * Clean and prepare content for AI processing
   */
  async cleanContent(content: string): Promise<string> {
    if (!content || typeof content !== 'string') {
      return '';
    }

    // Use content extractor for initial cleaning
    const extractResult = await this.contentExtractor.extractContent(content, 'ai-processing');
    const extractedContent = extractResult.cleanedContent;
    
    let cleaned = extractedContent || content;
    
    // Remove excessive whitespace and normalize
    cleaned = cleaned
      .replace(/\s+/g, ' ')
      .replace(/\n\s*\n/g, '\n')
      .trim();

    // Remove common noise patterns
    cleaned = cleaned
      .replace(/<!--.*?-->/gs, '')
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
      .replace(/\b(cookie|privacy|gdpr|consent)\b.*?(?=\n|\.|$)/gi, '');

    return cleaned;
  }

  /**
   * Assess content quality for AI processing
   */
  async assessContentQuality(content: string): Promise<any> {
    const wordCount = content.split(/\s+/).length;
    const hasStructuredContent = /(\n|<br>|\|)/.test(content);
    const hasContactInfo = /(email|phone|contact|apply)/i.test(content);
    const hasJobTerms = /(experience|salary|remote|full.?time|part.?time)/i.test(content);
    const hasCompanyInfo = /(company|about us|team|mission|vision)/i.test(content);
    
    const qualityScore = Math.min(100, 
      (wordCount > 50 ? 20 : wordCount * 0.4) +
      (hasStructuredContent ? 20 : 0) +
      (hasContactInfo ? 15 : 0) +
      (hasJobTerms ? 25 : 0) +
      (hasCompanyInfo ? 20 : 0)
    );

    return {
      wordCount,
      hasStructuredContent,
      hasContactInfo,
      hasJobTerms,
      hasCompanyInfo,
      qualityScore,
      isHighQuality: qualityScore >= 60
    };
  }

  /**
   * Optimize content for extraction by removing noise and enhancing structure
   */
  private async optimizeContentForExtraction(content: string, sourceUrl?: string): Promise<string> {
    let optimized = content;

    // Remove navigation and footer patterns
    optimized = optimized
      .replace(/nav(igation)?.*?(?=\n|\.|main|content)/gi, '')
      .replace(/footer.*?(?=\n|$)/gi, '')
      .replace(/sidebar.*?(?=\n|$)/gi, '')
      .replace(/breadcrumb.*?(?=\n|$)/gi, '');

    // Enhance job-specific structure if detected
    if (/job|position|role|vacancy/i.test(optimized)) {
      // Add structure markers for better parsing
      optimized = optimized
        .replace(/(requirements?:)/gi, '\n## $1\n')
        .replace(/(responsibilities?:)/gi, '\n## $1\n')
        .replace(/(benefits?:)/gi, '\n## $1\n')
        .replace(/(qualifications?:)/gi, '\n## $1\n')
        .replace(/(salary|compensation):?/gi, '\n## Salary: ');
    }

    // Site-specific optimizations
    if (sourceUrl) {
      if (sourceUrl.includes('dev.bg')) {
        optimized = this.optimizeForDevBg(optimized);
      } else if (sourceUrl.includes('jobs.bg')) {
        optimized = this.optimizeForJobsBg(optimized);
      }
    }

    return this.smartTruncateContent(optimized, 
      this.configService.get<number>('ai.maxContentLength') || 8000
    );
  }

  private optimizeForDevBg(content: string): string {
    return content
      .replace(/Apply for this job/gi, '')
      .replace(/Share this job/gi, '')
      .replace(/Posted \d+ days? ago/gi, '');
  }

  private optimizeForJobsBg(content: string): string {
    return content
      .replace(/Кандидатствай/gi, '')
      .replace(/Сподели обявата/gi, '');
  }

  /**
   * Smart content truncation that preserves important information
   */
  private smartTruncateContent(content: string, maxLength: number): string {
    if (content.length <= maxLength) {
      return content;
    }

    // Try to find natural break points
    const breakPoints = [
      content.lastIndexOf('\n\n', maxLength),
      content.lastIndexOf('. ', maxLength),
      content.lastIndexOf('.\n', maxLength),
      content.lastIndexOf('\n', maxLength),
    ].filter(pos => pos > maxLength * 0.7); // Keep at least 70% of desired length

    const breakPoint = Math.max(...breakPoints);
    
    if (breakPoint > 0) {
      return content.substring(0, breakPoint).trim() + '\n\n[Content truncated for processing...]';
    }

    // Fallback to hard truncation
    return content.substring(0, maxLength - 50).trim() + '\n\n[Content truncated for processing...]';
  }

  /**
   * Cache management for AI responses
   */
  async cacheResult(contentHash: string, key: string, result: any): Promise<void> {
    try {
      const cacheKey = `ai_cache:${key}:${contentHash}`;
      const ttl = this.configService.get<number>('ai.cacheExpiryHours') * 3600 || 86400; // 24 hours default
      
      await this.redisService.set(cacheKey, JSON.stringify({
        result,
        cachedAt: new Date().toISOString(),
        hash: contentHash
      }), ttl);
      
      this.logger.log(`Cached AI result for key: ${key}`);
    } catch (error) {
      this.logger.warn(`Failed to cache AI result: ${error.message}`);
    }
  }

  /**
   * Retrieve cached AI result
   */
  async getCachedResult(contentHash: string, key: string): Promise<any | null> {
    try {
      const cacheKey = `ai_cache:${key}:${contentHash}`;
      const cached = await this.redisService.get(cacheKey);
      
      if (cached) {
        const parsedCache = JSON.parse(cached);
        this.logger.log(`Using cached AI result for key: ${key}`);
        return parsedCache.result;
      }
      
      return null;
    } catch (error) {
      this.logger.warn(`Failed to retrieve cached AI result: ${error.message}`);
      return null;
    }
  }

  /**
   * Generate content hash for caching
   */
  generateContentHash(content: string, additionalData?: any): string {
    const combinedContent = additionalData 
      ? `${content}:${JSON.stringify(additionalData)}`
      : content;
    return HashingUtil.generateSimpleContentHash(combinedContent);
  }

  /**
   * Invalidate old cached results
   */
  async invalidateOldCache(): Promise<{ invalidated: number; errors: number }> {
    let invalidated = 0;
    let errors = 0;

    try {
      // Note: Using client.keys is not recommended in production for performance reasons
      // This should be replaced with SCAN for large datasets
      const keys: string[] = [];
      // For now, skip cache invalidation as RedisService doesn't expose keys method
      // TODO: Implement proper cache invalidation using SCAN pattern
      
      for (const key of keys) {
        try {
          const cached = await this.redisService.get(key);
          if (cached) {
            const parsedCache = JSON.parse(cached);
            const cachedAt = new Date(parsedCache.cachedAt);
            const daysSinceCached = (Date.now() - cachedAt.getTime()) / (1000 * 60 * 60 * 24);
            
            if (daysSinceCached > 30) { // Remove cache older than 30 days
              await this.redisService.del(key);
              invalidated++;
            }
          }
        } catch (keyError) {
          this.logger.warn(`Error processing cache key ${key}: ${keyError.message}`);
          errors++;
        }
      }
      
      this.logger.log(`Cache invalidation completed: ${invalidated} invalidated, ${errors} errors`);
    } catch (error) {
      this.logger.error(`Cache invalidation failed: ${error.message}`);
      errors++;
    }

    return { invalidated, errors };
  }

  /**
   * Get usage statistics
   */
  async getUsageStats(): Promise<any> {
    try {
      // TODO: Implement getRecentRequests method in AiRequestLoggerService
      // For now, return placeholder stats
      const recentRequests: any[] = [];
      
      const stats = {
        totalRequests: recentRequests.length,
        successfulRequests: recentRequests.filter(req => req.success).length,
        averageProcessingTime: 0,
        totalTokensUsed: 0,
        modelUsage: {},
        requestTypeDistribution: {},
      };

      if (recentRequests.length > 0) {
        stats.averageProcessingTime = recentRequests.reduce((sum, req) => sum + (req.processingTime || 0), 0) / recentRequests.length;
        stats.totalTokensUsed = recentRequests.reduce((sum, req) => sum + (req.tokensUsed || 0), 0);
        
        // Count model usage
        recentRequests.forEach(req => {
          stats.modelUsage[req.model] = (stats.modelUsage[req.model] || 0) + 1;
          stats.requestTypeDistribution[req.requestType] = (stats.requestTypeDistribution[req.requestType] || 0) + 1;
        });
      }

      return stats;
    } catch (error) {
      this.logger.error(`Failed to get usage stats: ${error.message}`);
      return { error: error.message };
    }
  }
}