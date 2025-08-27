import { Injectable, Logger } from '@nestjs/common';
import { VacancyExtractionResult } from './ai-vacancy.service';
import { CompanyProfileAnalysisResult } from './ai-company.service';

@Injectable()
export class AIPromptService {
  private readonly logger = new Logger(AIPromptService.name);

  /**
   * Build messages for vacancy extraction
   */
  buildVacancyExtractionMessages(
    content: string,
    sourceUrl?: string,
    existingData?: any,
    _isUnstructuredModel: boolean = false,
  ): any[] {
    const systemPrompt = this.getVacancyExtractionSystemPrompt(_isUnstructuredModel);
    const userPrompt = this.buildVacancyUserPrompt(content, sourceUrl, existingData, _isUnstructuredModel);

    return [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ];
  }

  /**
   * Build messages for company profile analysis
   */
  buildCompanyProfileMessages(
    content: string,
    sourceUrl?: string,
    existingData?: any,
    _isUnstructuredModel: boolean = false,
  ): any[] {
    const systemPrompt = this.getCompanyProfileSystemPrompt(_isUnstructuredModel);
    const userPrompt = this.buildCompanyProfileUserPrompt(content, sourceUrl, existingData, _isUnstructuredModel);

    return [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ];
  }

  /**
   * Build messages for company website analysis
   */
  buildCompanyWebsiteMessages(
    content: string,
    sourceUrl?: string,
    existingData?: any,
    _isUnstructuredModel: boolean = false,
  ): any[] {
    const systemPrompt = this.getCompanyWebsiteSystemPrompt(_isUnstructuredModel);
    const userPrompt = this.buildCompanyWebsiteUserPrompt(content, sourceUrl, existingData, _isUnstructuredModel);

    return [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ];
  }

  /**
   * Build messages for company consolidation
   */
  buildCompanyConsolidationMessages(
    consolidationInput: any,
    _isUnstructuredModel: boolean = false,
  ): any[] {
    const systemPrompt = this.getCompanyConsolidationSystemPrompt(_isUnstructuredModel);
    const userPrompt = this.buildCompanyConsolidationUserPrompt(consolidationInput, _isUnstructuredModel);

    return [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ];
  }

  /**
   * Parse vacancy extraction response
   */
  parseVacancyExtractionResponse(
    response: string | undefined,
    _isUnstructuredModel: boolean = false,
    metadata: any = {},
  ): VacancyExtractionResult | null {
    if (!response) return null;

    try {
      // Try to extract JSON from the response
      const jsonData = this.extractJsonFromText(response);
      
      if (!jsonData) {
        this.logger.warn('Could not extract JSON from AI response');
        return null;
      }

      // Build the result object
      const result: VacancyExtractionResult = {
        title: this.cleanString(jsonData.title),
        company: this.cleanString(jsonData.company),
        location: this.cleanString(jsonData.location),
        salaryMin: this.parseNumber(jsonData.salaryMin),
        salaryMax: this.parseNumber(jsonData.salaryMax),
        currency: this.cleanString(jsonData.currency),
        experienceLevel: this.cleanString(jsonData.experienceLevel),
        employmentType: this.cleanString(jsonData.employmentType),
        workModel: this.cleanString(jsonData.workModel),
        description: this.cleanString(jsonData.description),
        requirements: this.cleanArray(jsonData.requirements),
        responsibilities: this.cleanArray(jsonData.responsibilities),
        technologies: this.cleanArray(jsonData.technologies),
        benefits: this.cleanArray(jsonData.benefits),
        educationLevel: this.cleanString(jsonData.educationLevel),
        industry: this.cleanString(jsonData.industry),
        teamSize: this.cleanString(jsonData.teamSize),
        companySize: this.cleanString(jsonData.companySize),
        applicationDeadline: this.cleanString(jsonData.applicationDeadline),
        postedDate: this.cleanString(jsonData.postedDate),
        confidenceScore: this.parseConfidenceScore(jsonData.confidenceScore),
        qualityScore: metadata.qualityScore || 75,
        extractionMetadata: {
          sourceType: this.inferSourceType(metadata.sourceUrl),
          contentLength: metadata.contentLength || 0,
          hasStructuredData: Boolean(jsonData.hasStructuredData),
          language: this.detectLanguage(response),
        },
      };

      return result;
    } catch (error) {
      this.logger.error(`Failed to parse vacancy extraction response: ${error.message}`);
      return null;
    }
  }

  /**
   * Parse company analysis response
   */
  parseCompanyAnalysisResponse(
    response: string | undefined,
    _isUnstructuredModel: boolean = false,
    analysisType: 'profile' | 'website' | 'consolidated' = 'profile',
    metadata: any = {},
  ): CompanyProfileAnalysisResult | null {
    if (!response) return null;

    try {
      const jsonData = this.extractJsonFromText(response);
      
      if (!jsonData) {
        this.logger.warn('Could not extract JSON from company analysis response');
        return null;
      }

      const result: CompanyProfileAnalysisResult = {
        name: this.cleanString(jsonData.name),
        description: this.cleanString(jsonData.description),
        industry: this.cleanString(jsonData.industry),
        size: this.cleanString(jsonData.size),
        location: this.cleanString(jsonData.location),
        website: this.cleanString(jsonData.website),
        employeeCount: this.parseNumber(jsonData.employeeCount),
        founded: this.parseNumber(jsonData.founded),
        technologies: this.cleanArray(jsonData.technologies),
        benefits: this.cleanArray(jsonData.benefits),
        culture: this.cleanString(jsonData.culture),
        values: this.cleanArray(jsonData.values),
        workEnvironment: this.cleanString(jsonData.workEnvironment),
        careerOpportunities: this.cleanArray(jsonData.careerOpportunities),
        socialImpact: this.cleanString(jsonData.socialImpact),
        financialHealth: this.cleanString(jsonData.financialHealth),
        recentNews: this.cleanArray(jsonData.recentNews),
        competitiveAdvantages: this.cleanArray(jsonData.competitiveAdvantages),
        challenges: this.cleanArray(jsonData.challenges),
        confidenceScore: this.parseConfidenceScore(jsonData.confidenceScore),
        analysisMetadata: {
          sourceType: this.inferSourceType(metadata.sourceUrl),
          contentLength: metadata.contentLength || 0,
          hasStructuredData: Boolean(jsonData.hasStructuredData),
          language: this.detectLanguage(response),
          analysisDepth: this.determineAnalysisDepth(analysisType, metadata.contentLength || 0),
        },
      };

      return result;
    } catch (error) {
      this.logger.error(`Failed to parse company analysis response: ${error.message}`);
      return null;
    }
  }

  // System prompts
  private getVacancyExtractionSystemPrompt(isUnstructured: boolean): string {
    const basePrompt = `You are a job vacancy data extraction specialist. Your task is to extract structured information from job postings and vacancy content.

Key requirements:
- Extract information accurately from various job posting formats
- Handle multiple languages (primarily English and Bulgarian)
- Provide confidence scores based on data clarity
- Return proper JSON format
- Use null for missing information rather than empty strings or placeholders`;

    if (isUnstructured) {
      return basePrompt + `

Response format: Provide your analysis in JSON format with the following structure:
{
  "title": "Job title",
  "company": "Company name",
  "location": "Location",
  "salaryMin": number or null,
  "salaryMax": number or null,
  "currency": "Currency code",
  "description": "Job description",
  "requirements": ["requirement1", "requirement2"],
  "technologies": ["tech1", "tech2"],
  "confidenceScore": 0.85
}`;
    }

    return basePrompt + `

Please respond with valid JSON only. No additional text or explanations.`;
  }

  private getCompanyProfileSystemPrompt(isUnstructured: boolean): string {
    const basePrompt = `You are a company profile analysis expert. Extract comprehensive company information from various sources including job postings, company pages, and structured data.

Focus areas:
- Company identity and basic information
- Business model and industry positioning
- Culture and work environment
- Employee benefits and opportunities
- Technology stack and competitive advantages
- Growth stage and financial indicators

Provide confidence scores based on information quality and completeness.`;

    if (isUnstructured) {
      return basePrompt + `

Response format: Provide your analysis in JSON format with company details and confidence score.`;
    }

    return basePrompt + `

Please respond with valid JSON only. No additional text or explanations.`;
  }

  private getCompanyWebsiteSystemPrompt(isUnstructured: boolean): string {
    const basePrompt = `You are analyzing company website content to extract business insights and company characteristics.

Focus on:
- Mission, vision, and values
- Products and services
- Company culture and work environment
- Recent developments and news
- Market position and competitive advantages
- Employee value propositions

Analyze the content depth and provide confidence scores accordingly.`;

    if (isUnstructured) {
      return basePrompt + `

Response format: Provide your analysis in JSON format with detailed company insights.`;
    }

    return basePrompt + `

Please respond with valid JSON only. No additional text or explanations.`;
  }

  private getCompanyConsolidationSystemPrompt(isUnstructured: boolean): string {
    const basePrompt = `You are consolidating multiple company analyses into a comprehensive company profile.

Your task:
- Merge information from different sources intelligently
- Resolve conflicts by prioritizing more reliable/recent data
- Fill gaps using complementary information
- Maintain data consistency and accuracy
- Provide a unified confidence score based on overall data quality`;

    if (isUnstructured) {
      return basePrompt + `

Response format: Provide the consolidated analysis in JSON format.`;
    }

    return basePrompt + `

Please respond with valid JSON only. No additional text or explanations.`;
  }

  // User prompt builders
  private buildVacancyUserPrompt(
    content: string,
    sourceUrl?: string,
    existingData?: any,
    _isUnstructured: boolean = false,
  ): string {
    let prompt = `Please extract job vacancy information from the following content:\n\n${content}`;

    if (sourceUrl) {
      prompt += `\n\nSource URL: ${sourceUrl}`;
    }

    if (existingData) {
      prompt += `\n\nExisting data for reference: ${JSON.stringify(existingData, null, 2)}`;
    }

    prompt += `\n\nExtract the following information:
- Job title and company name
- Location and work model (remote/hybrid/onsite)
- Salary range and currency
- Experience level and employment type
- Job description and key requirements
- Required technologies and skills
- Benefits and company information
- Application details and deadlines

Provide a confidence score (0.0 to 1.0) based on information clarity and completeness.`;

    return prompt;
  }

  private buildCompanyProfileUserPrompt(
    content: string,
    sourceUrl?: string,
    existingData?: any,
    _isUnstructured: boolean = false,
  ): string {
    let prompt = `Analyze the following company information and extract structured data:\n\n${content}`;

    if (sourceUrl) {
      prompt += `\n\nSource URL: ${sourceUrl}`;
    }

    if (existingData) {
      prompt += `\n\nExisting company data: ${JSON.stringify(existingData, null, 2)}`;
    }

    prompt += `\n\nExtract and analyze:
- Basic company information (name, description, industry)
- Company size, location, and founding details
- Technology stack and technical focus
- Company culture and values
- Employee benefits and career opportunities
- Recent developments and market position
- Challenges and competitive advantages

Provide a confidence score based on data quality and completeness.`;

    return prompt;
  }

  private buildCompanyWebsiteUserPrompt(
    content: string,
    sourceUrl?: string,
    existingData?: any,
    _isUnstructured: boolean = false,
  ): string {
    let prompt = `Analyze this company website content for business insights:\n\n${content}`;

    if (sourceUrl) {
      prompt += `\n\nWebsite URL: ${sourceUrl}`;
    }

    if (existingData) {
      prompt += `\n\nExisting company knowledge: ${JSON.stringify(existingData, null, 2)}`;
    }

    prompt += `\n\nFocus on extracting:
- Mission, vision, and core values
- Product/service offerings
- Company culture and employee experience
- Recent news, achievements, or developments
- Market positioning and competitive advantages
- Growth indicators and business model insights
- Technology leadership and innovation focus

Provide detailed analysis with confidence scoring.`;

    return prompt;
  }

  private buildCompanyConsolidationUserPrompt(
    consolidationInput: any,
    _isUnstructured: boolean = false,
  ): string {
    let prompt = `Consolidate the following company analyses into a comprehensive profile:\n\n`;

    if (consolidationInput.profileAnalysis) {
      prompt += `Profile Analysis:\n${JSON.stringify(consolidationInput.profileAnalysis, null, 2)}\n\n`;
    }

    if (consolidationInput.websiteAnalysis) {
      prompt += `Website Analysis:\n${JSON.stringify(consolidationInput.websiteAnalysis, null, 2)}\n\n`;
    }

    if (consolidationInput.existingCompanyData) {
      prompt += `Existing Data:\n${JSON.stringify(consolidationInput.existingCompanyData, null, 2)}\n\n`;
    }

    prompt += `Instructions:
- Merge complementary information intelligently
- Resolve conflicts by choosing more reliable/recent data
- Fill information gaps using available sources
- Maintain consistency across all fields
- Calculate overall confidence based on source reliability
- Prioritize factual information over subjective assessments`;

    return prompt;
  }

  // Utility methods
  private extractJsonFromText(text: string): any | null {
    try {
      // First try to parse as direct JSON
      return JSON.parse(text);
    } catch {
      // Try to find JSON within the text
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          return JSON.parse(jsonMatch[0]);
        } catch {
          // Try to clean and parse
          const cleaned = jsonMatch[0]
            .replace(/,\s*}/g, '}')
            .replace(/,\s*]/g, ']')
            .replace(/([{,]\s*)(\w+)(\s*:)/g, '$1"$2"$3');
          
          try {
            return JSON.parse(cleaned);
          } catch {
            return null;
          }
        }
      }
      return null;
    }
  }

  private cleanString(value: any): string | null {
    if (!value || typeof value !== 'string') return null;
    const cleaned = value.trim();
    return cleaned === '' || cleaned.toLowerCase() === 'null' || cleaned.toLowerCase() === 'n/a' ? null : cleaned;
  }

  private cleanArray(value: any): string[] | null {
    if (!value || !Array.isArray(value)) return null;
    const cleaned = value
      .map(item => typeof item === 'string' ? item.trim() : String(item).trim())
      .filter(item => item && item.toLowerCase() !== 'null' && item.toLowerCase() !== 'n/a');
    return cleaned.length > 0 ? cleaned : null;
  }

  private parseNumber(value: any): number | null {
    if (typeof value === 'number') return value;
    if (typeof value === 'string') {
      const num = parseFloat(value.replace(/[^\d.-]/g, ''));
      return isNaN(num) ? null : num;
    }
    return null;
  }

  private parseConfidenceScore(value: any): number {
    const score = this.parseNumber(value);
    if (score === null) return 0.5;
    return Math.max(0, Math.min(1, score));
  }

  private inferSourceType(sourceUrl?: string): string {
    if (!sourceUrl) return 'unknown';
    if (sourceUrl.includes('dev.bg')) return 'dev.bg';
    if (sourceUrl.includes('jobs.bg')) return 'jobs.bg';
    if (sourceUrl.includes('linkedin')) return 'linkedin';
    return 'web';
  }

  private detectLanguage(content: string): string {
    // Simple language detection based on common words
    const bgWords = ['в', 'на', 'за', 'от', 'до', 'със', 'или', 'като', 'кандидатствай'];
    const enWords = ['the', 'and', 'or', 'to', 'in', 'at', 'for', 'with', 'apply'];
    
    const words = content.toLowerCase().split(/\s+/);
    const bgCount = bgWords.reduce((count, word) => count + (words.includes(word) ? 1 : 0), 0);
    const enCount = enWords.reduce((count, word) => count + (words.includes(word) ? 1 : 0), 0);
    
    if (bgCount > enCount) return 'bg';
    if (enCount > 0) return 'en';
    return 'unknown';
  }

  private determineAnalysisDepth(analysisType: string, contentLength: number): 'basic' | 'detailed' | 'comprehensive' {
    if (analysisType === 'consolidated') return 'comprehensive';
    if (contentLength > 5000) return 'detailed';
    if (contentLength > 1500) return 'detailed';
    return 'basic';
  }
}