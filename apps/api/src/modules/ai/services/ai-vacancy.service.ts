import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AICoreService } from './ai-core.service';
import { AIPromptService } from './ai-prompt.service';

export interface VacancyExtractionResult {
  title: string | null;
  company: string | null;
  location: string | null;
  salaryMin: number | null;
  salaryMax: number | null;
  currency: string | null;
  experienceLevel: string | null;
  employmentType: string | null;
  workModel: string | null;
  description: string | null;
  requirements: string[] | null;
  responsibilities: string[] | null;
  technologies: string[] | null;
  benefits: string[] | null;
  educationLevel: string | null;
  industry: string | null;
  teamSize: string | null;
  companySize: string | null;
  applicationDeadline: string | null;
  postedDate: string | null;
  confidenceScore: number;
  qualityScore: number;
  extractionMetadata: {
    sourceType: string;
    contentLength: number;
    hasStructuredData: boolean;
    language: string;
  };
}

@Injectable()
export class AIVacancyService {
  private readonly logger = new Logger(AIVacancyService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly aiCore: AICoreService,
    private readonly aiPrompt: AIPromptService,
  ) {}

  /**
   * Extract structured vacancy data from HTML content
   */
  async extractVacancyData(
    htmlContent: string,
    sourceUrl?: string,
    existingData?: any,
  ): Promise<VacancyExtractionResult> {
    const contentHash = this.aiCore.generateContentHash(htmlContent, { sourceUrl, existingData });

    // Check cache first
    if (this.configService.get<boolean>('ai.enableCaching')) {
      const cached = await this.aiCore.getCachedResult(contentHash, 'vacancy_extraction');
      if (cached) {
        return cached;
      }
    }

    try {
      // Clean and assess content
      const cleanedContent = await this.aiCore.cleanContent(htmlContent);
      const contentQuality = await this.aiCore.assessContentQuality(cleanedContent);

      // Determine the best model based on content complexity and quality
      const model = this.selectModelForExtraction(contentQuality);
      const isUnstructuredModel = model.includes('gpt-3.5') || model.includes('gpt-4-mini');

      this.logger.log(`Extracting vacancy data with ${model} (quality: ${contentQuality.qualityScore})`);

      // Build messages with context
      const messages = this.aiPrompt.buildVacancyExtractionMessages(
        cleanedContent,
        sourceUrl,
        existingData,
        isUnstructuredModel
      );

      // Make AI request
      const response = await this.aiCore.callOpenAiWithLogging(
        messages,
        model,
        0.1,
        2000,
        'vacancy_extraction',
        sourceUrl,
      );

      // Parse response
      const extractionResult = this.aiPrompt.parseVacancyExtractionResponse(
        response,
        isUnstructuredModel,
        {
          contentLength: cleanedContent.length,
          qualityScore: contentQuality.qualityScore,
          sourceUrl,
        }
      );

      if (!extractionResult) {
        throw new Error('Failed to parse AI response for vacancy extraction');
      }

      // Cache result
      if (this.configService.get<boolean>('ai.enableCaching')) {
        await this.aiCore.cacheResult(contentHash, 'vacancy_extraction', extractionResult);
      }

      return extractionResult;

    } catch (error) {
      this.logger.error(`Vacancy extraction failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Extract vacancy data and return raw response for debugging
   */
  async extractVacancyDataWithRawResponse(
    htmlContent: string,
    sourceUrl?: string,
    existingData?: any,
  ): Promise<{ result: VacancyExtractionResult | null; rawResponse: string | null; model: string }> {
    try {
      const cleanedContent = await this.aiCore.cleanContent(htmlContent);
      const contentQuality = await this.aiCore.assessContentQuality(cleanedContent);
      
      const model = this.selectModelForExtraction(contentQuality);
      const isUnstructuredModel = model.includes('gpt-3.5') || model.includes('gpt-4-mini');

      this.logger.log(`Extracting vacancy data (with raw response) using ${model}`);

      const messages = this.aiPrompt.buildVacancyExtractionMessages(
        cleanedContent,
        sourceUrl,
        existingData,
        isUnstructuredModel
      );

      const rawResponse = await this.aiCore.callOpenAiWithLogging(
        messages,
        model,
        0.1,
        2000,
        'vacancy_extraction_debug',
        sourceUrl,
      );

      const result = this.aiPrompt.parseVacancyExtractionResponse(
        rawResponse,
        isUnstructuredModel,
        {
          contentLength: cleanedContent.length,
          qualityScore: contentQuality.qualityScore,
          sourceUrl,
        }
      );

      return {
        result,
        rawResponse: rawResponse || null,
        model,
      };

    } catch (error) {
      this.logger.error(`Vacancy extraction with raw response failed: ${error.message}`);
      return {
        result: null,
        rawResponse: null,
        model: 'error',
      };
    }
  }

  /**
   * Select the best AI model based on content characteristics
   */
  private selectModelForExtraction(contentQuality: any): string {
    const defaultModel = this.configService.get<string>('ai.defaultModel') || 'gpt-4-mini';
    
    // For high-quality, structured content, use faster models
    if (contentQuality.qualityScore >= 80 && contentQuality.hasStructuredContent) {
      return 'gpt-4-mini';
    }
    
    // For complex or low-quality content, use more powerful models
    if (contentQuality.qualityScore < 50 || contentQuality.wordCount > 2000) {
      return 'gpt-4-turbo';
    }

    // Use default model for average cases
    return defaultModel;
  }

  /**
   * Validate extraction result quality
   */
  validateExtractionResult(result: VacancyExtractionResult): { isValid: boolean; issues: string[] } {
    const issues: string[] = [];

    // Check required fields
    if (!result.title) issues.push('Missing job title');
    if (!result.company) issues.push('Missing company name');
    if (!result.description || result.description.length < 50) {
      issues.push('Missing or insufficient job description');
    }

    // Check data consistency
    if (result.salaryMin && result.salaryMax && result.salaryMin > result.salaryMax) {
      issues.push('Minimum salary is greater than maximum salary');
    }

    if (result.confidenceScore < 0.3) {
      issues.push('Low confidence score in extraction');
    }

    return {
      isValid: issues.length === 0,
      issues,
    };
  }

  /**
   * Get extraction statistics
   */
  async getExtractionStats(): Promise<any> {
    const baseStats = await this.aiCore.getUsageStats();
    
    // Filter for vacancy extraction requests
    const vacancyRequests = baseStats.requestTypeDistribution?.['vacancy_extraction'] || 0;
    const debugRequests = baseStats.requestTypeDistribution?.['vacancy_extraction_debug'] || 0;

    return {
      ...baseStats,
      vacancyExtractions: vacancyRequests,
      debugExtractions: debugRequests,
      totalVacancyRequests: vacancyRequests + debugRequests,
    };
  }
}