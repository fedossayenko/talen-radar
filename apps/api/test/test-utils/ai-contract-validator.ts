import Ajv, { JSONSchemaType } from 'ajv';
import { VacancyExtractionResult } from '../../src/modules/ai/ai.service';
import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * AI Contract Validator
 * 
 * Validates AI response schemas using JSON Schema validation.
 * Ensures all AI responses conform to expected structure and types.
 */
export class AiContractValidator {
  private ajv: Ajv;
  private vacancyExtractionSchema: JSONSchemaType<VacancyExtractionResult>;

  constructor() {
    this.ajv = new Ajv({ allErrors: true, strict: false });
    this.vacancyExtractionSchema = this.createVacancyExtractionSchema();
  }

  /**
   * Validate vacancy extraction result against schema
   */
  validateVacancyExtraction(data: any): { isValid: boolean; errors: string[] } {
    const validate = this.ajv.compile(this.vacancyExtractionSchema);
    const isValid = validate(data);
    
    const errors = validate.errors?.map(error => 
      `${error.instancePath} ${error.message}`
    ) || [];

    return { isValid, errors };
  }

  /**
   * Validate all fixture files against schemas
   */
  validateAllFixtures(): { 
    valid: string[];
    invalid: Array<{ file: string; errors: string[] }>;
  } {
    const fixturesDir = join(__dirname, '../fixtures/ai-responses');
    const valid: string[] = [];
    const invalid: Array<{ file: string; errors: string[] }> = [];

    try {
      const fixtures = [
        'high-quality-vacancy.json',
        'medium-quality-vacancy.json',
        'low-quality-vacancy.json'
      ];

      for (const fixture of fixtures) {
        try {
          const filePath = join(fixturesDir, fixture);
          const data = JSON.parse(readFileSync(filePath, 'utf8'));
          const result = this.validateVacancyExtraction(data);
          
          if (result.isValid) {
            valid.push(fixture);
          } else {
            invalid.push({ file: fixture, errors: result.errors });
          }
        } catch (error) {
          invalid.push({ 
            file: fixture, 
            errors: [`Failed to load or parse fixture: ${error.message}`] 
          });
        }
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to validate fixtures:', error);
    }

    return { valid, invalid };
  }

  /**
   * Validate response structure for specific quality thresholds
   */
  validateQualityThresholds(data: VacancyExtractionResult): {
    meetsMinimumQuality: boolean;
    qualityIssues: string[];
  } {
    const issues: string[] = [];

    // Check confidence score
    if (data.confidenceScore < 70) {
      issues.push(`Low confidence score: ${data.confidenceScore}`);
    }

    // Check quality score
    if (data.qualityScore < 60) {
      issues.push(`Low quality score: ${data.qualityScore}`);
    }

    // Check essential fields
    if (!data.title) {
      issues.push('Missing job title');
    }

    if (!data.description || data.description.length < 50) {
      issues.push('Missing or insufficient job description');
    }

    if (!data.requirements || data.requirements.length === 0) {
      issues.push('Missing job requirements');
    }

    if (!data.technologies || data.technologies.length === 0) {
      issues.push('Missing technology stack information');
    }

    return {
      meetsMinimumQuality: issues.length === 0,
      qualityIssues: issues
    };
  }

  /**
   * Validate extraction metadata
   */
  validateExtractionMetadata(data: VacancyExtractionResult): {
    isValid: boolean;
    metadataIssues: string[];
  } {
    const issues: string[] = [];

    if (!data.extractionMetadata) {
      issues.push('Missing extraction metadata');
      return { isValid: false, metadataIssues: issues };
    }

    const { extractionMetadata } = data;

    // Check content length
    if (extractionMetadata.contentLength <= 0) {
      issues.push('Invalid content length');
    }

    // Check source type
    const validSourceTypes = ['job_board', 'company_website', 'social_media', 'other'];
    if (!validSourceTypes.includes(extractionMetadata.sourceType)) {
      issues.push(`Invalid source type: ${extractionMetadata.sourceType}`);
    }

    // Check language
    if (!extractionMetadata.language || extractionMetadata.language.length !== 2) {
      issues.push('Invalid language code');
    }

    return {
      isValid: issues.length === 0,
      metadataIssues: issues
    };
  }

  /**
   * Create JSON schema for vacancy extraction result
   */
  private createVacancyExtractionSchema(): any {
    return {
      type: 'object',
      required: [
        'confidenceScore',
        'qualityScore',
        'extractionMetadata'
      ],
      properties: {
        title: { type: 'string', nullable: true },
        company: { type: 'string', nullable: true },
        location: { type: 'string', nullable: true },
        salaryMin: { type: 'number', nullable: true },
        salaryMax: { type: 'number', nullable: true },
        currency: { type: 'string', nullable: true },
        experienceLevel: { type: 'string', nullable: true },
        employmentType: { type: 'string', nullable: true },
        workModel: { type: 'string', nullable: true },
        description: { type: 'string', nullable: true },
        requirements: {
          type: 'array',
          items: { type: 'string' },
          nullable: true
        },
        responsibilities: {
          type: 'array',
          items: { type: 'string' },
          nullable: true
        },
        technologies: {
          type: 'array',
          items: { type: 'string' },
          nullable: true
        },
        benefits: {
          type: 'array',
          items: { type: 'string' },
          nullable: true
        },
        educationLevel: { type: 'string', nullable: true },
        industry: { type: 'string', nullable: true },
        teamSize: { type: 'string', nullable: true },
        companySize: { type: 'string', nullable: true },
        applicationDeadline: { type: 'string', nullable: true },
        postedDate: { type: 'string', nullable: true },
        confidenceScore: { 
          type: 'number',
          minimum: 0,
          maximum: 100
        },
        qualityScore: { 
          type: 'number',
          minimum: 0,
          maximum: 100
        },
        extractionMetadata: {
          type: 'object',
          required: ['sourceType', 'contentLength', 'hasStructuredData', 'language'],
          properties: {
            sourceType: { type: 'string' },
            contentLength: { type: 'number', minimum: 0 },
            hasStructuredData: { type: 'boolean' },
            language: { type: 'string' }
          },
          additionalProperties: false
        }
      },
      additionalProperties: false
    };
  }
}

/**
 * Utility function to load and validate a specific fixture
 */
export function loadAndValidateFixture(fixtureName: string): {
  data: VacancyExtractionResult | null;
  isValid: boolean;
  errors: string[];
} {
  const validator = new AiContractValidator();
  
  try {
    const fixturesDir = join(__dirname, '../fixtures/ai-responses');
    const filePath = join(fixturesDir, fixtureName);
    const data = JSON.parse(readFileSync(filePath, 'utf8'));
    
    const validation = validator.validateVacancyExtraction(data);
    
    return {
      data: validation.isValid ? data : null,
      isValid: validation.isValid,
      errors: validation.errors
    };
  } catch (error) {
    return {
      data: null,
      isValid: false,
      errors: [`Failed to load fixture: ${error.message}`]
    };
  }
}