import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AIVacancyService, VacancyExtractionResult } from './services/ai-vacancy.service';
import { AICompanyService, CompanyProfileAnalysisResult } from './services/ai-company.service';
import { AICoreService } from './services/ai-core.service';

// Re-export interfaces for backward compatibility
export type { VacancyExtractionResult, CompanyProfileAnalysisResult };

/**
 * AiService - Facade for AI operations
 * 
 * This service acts as a facade to maintain backward compatibility while 
 * delegating to the new modular AI services:
 * - AIVacancyService: Handles vacancy data extraction
 * - AICompanyService: Handles company analysis
 * - AICoreService: Provides core AI functionality
 */
@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly aiVacancy: AIVacancyService,
    private readonly aiCompany: AICompanyService,
    private readonly aiCore: AICoreService,
  ) {}

  // ============================================================================
  // VACANCY EXTRACTION METHODS
  // ============================================================================

  /**
   * Extract structured vacancy data from HTML content
   */
  async extractVacancyData(
    htmlContent: string,
    sourceUrl?: string,
    existingData?: any,
  ): Promise<VacancyExtractionResult> {
    return this.aiVacancy.extractVacancyData(htmlContent, sourceUrl, existingData);
  }

  /**
   * Extract vacancy data and return raw response for debugging
   */
  async extractVacancyDataWithRawResponse(
    htmlContent: string,
    sourceUrl?: string,
    existingData?: any,
  ): Promise<{ result: VacancyExtractionResult | null; rawResponse: string | null; model: string }> {
    return this.aiVacancy.extractVacancyDataWithRawResponse(htmlContent, sourceUrl, existingData);
  }

  // ============================================================================
  // COMPANY ANALYSIS METHODS
  // ============================================================================

  /**
   * Analyze company profile from structured data or web content
   */
  async analyzeCompanyProfile(
    content: string,
    sourceUrl?: string,
    existingData?: any,
  ): Promise<CompanyProfileAnalysisResult> {
    return this.aiCompany.analyzeCompanyProfile(content, sourceUrl, existingData);
  }

  /**
   * Analyze company website for additional insights
   */
  async analyzeCompanyWebsite(
    content: string,
    sourceUrl?: string,
    existingData?: any,
  ): Promise<CompanyProfileAnalysisResult> {
    return this.aiCompany.analyzeCompanyWebsite(content, sourceUrl, existingData);
  }

  /**
   * Analyze company profile with raw response for debugging
   */
  async analyzeCompanyProfileWithRawResponse(
    content: string,
    sourceUrl?: string,
    existingData?: any,
  ): Promise<{ result: CompanyProfileAnalysisResult | null; rawResponse: string | null; model: string }> {
    return this.aiCompany.analyzeCompanyProfileWithRawResponse(content, sourceUrl, existingData);
  }

  /**
   * Analyze company website with raw response for debugging
   */
  async analyzeCompanyWebsiteWithRawResponse(
    content: string,
    sourceUrl?: string,
    existingData?: any,
  ): Promise<{ result: CompanyProfileAnalysisResult | null; rawResponse: string | null; model: string }> {
    return this.aiCompany.analyzeCompanyWebsiteWithRawResponse(content, sourceUrl, existingData);
  }

  /**
   * Consolidate multiple company analyses into a comprehensive profile
   */
  async consolidateCompanyAnalysis(
    profileAnalysis: CompanyProfileAnalysisResult | null,
    websiteAnalysis: CompanyProfileAnalysisResult | null,
    existingCompanyData?: any,
  ): Promise<CompanyProfileAnalysisResult> {
    return this.aiCompany.consolidateCompanyAnalysis(profileAnalysis, websiteAnalysis, existingCompanyData);
  }

  // ============================================================================
  // CORE UTILITY METHODS
  // ============================================================================

  /**
   * Clean and prepare content for AI processing
   */
  async cleanContent(content: string): Promise<string> {
    return this.aiCore.cleanContent(content);
  }

  /**
   * Assess content quality for AI processing
   */
  async assessContentQuality(content: string): Promise<any> {
    return this.aiCore.assessContentQuality(content);
  }

  // ============================================================================
  // CACHE MANAGEMENT METHODS
  // ============================================================================

  /**
   * Cache extraction result (legacy method name)
   */
  private async cacheExtraction(contentHash: string, extractionResult: VacancyExtractionResult): Promise<void> {
    await this.aiCore.cacheResult(contentHash, 'vacancy_extraction', extractionResult);
  }

  /**
   * Get cached extraction result (legacy method name)
   */
  private async getCachedExtraction(contentHash: string): Promise<VacancyExtractionResult | null> {
    return this.aiCore.getCachedResult(contentHash, 'vacancy_extraction');
  }

  /**
   * Cache company analysis result (legacy method name)
   */
  private async cacheCompanyAnalysis(contentHash: string, analysisType: string, analysisResult: any): Promise<void> {
    await this.aiCore.cacheResult(contentHash, `company_${analysisType}`, analysisResult);
  }

  /**
   * Get cached company analysis result (legacy method name)
   */
  private async getCachedCompanyAnalysis(contentHash: string, analysisType: string): Promise<any | null> {
    return this.aiCore.getCachedResult(contentHash, `company_${analysisType}`);
  }

  /**
   * Invalidate old cached results
   */
  async invalidateOldHashedCache(): Promise<{ invalidated: number; errors: number }> {
    return this.aiCore.invalidateOldCache();
  }

  // ============================================================================
  // STATISTICS AND MONITORING
  // ============================================================================

  /**
   * Get usage statistics
   */
  async getUsageStats(): Promise<any> {
    const coreStats = await this.aiCore.getUsageStats();
    const vacancyStats = await this.aiVacancy.getExtractionStats();
    const companyStats = await this.aiCompany.getAnalysisStats();

    return {
      core: coreStats,
      vacancy: vacancyStats,
      company: companyStats,
      combined: {
        totalRequests: coreStats.totalRequests,
        successfulRequests: coreStats.successfulRequests,
        averageProcessingTime: coreStats.averageProcessingTime,
        totalTokensUsed: coreStats.totalTokensUsed,
        modelUsage: coreStats.modelUsage,
        requestTypeDistribution: coreStats.requestTypeDistribution,
      },
    };
  }

  // ============================================================================
  // DIRECT ACCESS TO MODULAR SERVICES (for advanced usage)
  // ============================================================================

  /**
   * Get direct access to vacancy service for advanced operations
   */
  getVacancyService(): AIVacancyService {
    return this.aiVacancy;
  }

  /**
   * Get direct access to company service for advanced operations
   */
  getCompanyService(): AICompanyService {
    return this.aiCompany;
  }

  /**
   * Get direct access to core service for advanced operations
   */
  getCoreService(): AICoreService {
    return this.aiCore;
  }

  // ============================================================================
  // VALIDATION METHODS
  // ============================================================================

  /**
   * Validate extraction result quality
   */
  validateExtractionResult(result: VacancyExtractionResult): { isValid: boolean; issues: string[] } {
    return this.aiVacancy.validateExtractionResult(result);
  }

  /**
   * Validate company analysis result quality
   */
  validateCompanyAnalysisResult(result: CompanyProfileAnalysisResult): { isValid: boolean; issues: string[] } {
    return this.aiCompany.validateAnalysisResult(result);
  }
}