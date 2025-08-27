# Generic Job Scraping Architecture

## Overview

The enhanced scraping architecture provides a generic, multi-site job scraping system that supports:

- **Multiple job sites** (dev.bg, jobs.bg, easily extensible)
- **Cross-site duplicate detection** using fuzzy matching algorithms
- **Company deduplication** with intelligent name matching
- **Plugin architecture** for adding new scrapers
- **API v2 routes** (`/api/v2/scraper/*`)

## Architecture Components

### 1. Core Interfaces

```
interfaces/job-scraper.interface.ts
```

- `IJobScraper` - Base interface all scrapers must implement
- `JobListing` - Standardized job data structure across sites
- `ScrapingResult` - Standardized result format
- `JobDetails` - Detailed job information structure

### 2. Base Scraper Class

```
scrapers/base.scraper.ts
```

Abstract base class providing common functionality:
- Rate limiting and retry logic
- Request handling with proper headers
- Salary parsing across different formats
- Technology extraction from job text
- Work model and experience level normalization

### 3. Site-Specific Scrapers

```
scrapers/dev-bg-v2.scraper.ts    # Enhanced dev.bg scraper
scrapers/jobs-bg.scraper.ts      # New jobs.bg scraper
```

Each scraper extends `BaseScraper` and implements site-specific:
- HTML parsing logic
- URL pattern handling
- Site-specific field extraction

### 4. Duplicate Detection System

```
services/duplicate-detector.service.ts
```

Uses multiple signals to detect duplicates:
- **Exact matching**: by URL or external ID
- **Fuzzy matching**: using Jaro-Winkler string similarity
- **Cross-site tracking**: via `externalIds` JSON field
- **Technology overlap**: bonus scoring for common tech stacks
- **Temporal proximity**: jobs posted around same time

### 5. Company Matching System

```
services/company-matcher.service.ts
```

Intelligently matches companies across sites:
- **Domain matching**: most reliable signal
- **Name normalization**: removes suffixes, common words
- **Alias tracking**: stores all known company name variations
- **Fuzzy name matching**: handles typos and variations

### 6. Registry & Factory Pattern

```
services/scraper-registry.service.ts    # Manages available scrapers
services/scraper-factory.service.ts     # Orchestrates multi-site scraping
```

- Dynamic scraper registration
- Site-specific configuration management
- Multi-site scraping coordination
- Cross-site result aggregation

### 7. Enhanced Main Service

```
scraper-v2.service.ts
```

New main service that:
- Orchestrates multi-site scraping
- Handles duplicate detection and company matching
- Integrates with existing AI extraction and analysis
- Maintains backward compatibility

## Database Schema Changes

### New Fields in `Vacancy` Table

```sql
-- Cross-site duplicate detection fields
externalIds          JSONB    -- {"dev.bg": "job-123", "jobs.bg": "8102284"}
scrapedSites         JSONB    -- Track all sites where job was found
originalJobId        VARCHAR  -- Original job ID from source site
lastSeenAt           JSONB    -- Last seen timestamp for each site
```

### New Fields in `Company` Table

```sql
-- Company deduplication
companyAliases       JSONB    -- Array of all known company name variations
```

### Indexes Added

```sql
-- Vacancy indexes
CREATE INDEX ON vacancies USING GIN (externalIds);
CREATE INDEX ON vacancies USING GIN (scrapedSites);
CREATE INDEX ON vacancies (originalJobId);

-- Company indexes  
CREATE INDEX ON companies USING GIN (companyAliases);
```

## Configuration

### Environment Variables

```bash
# Global settings
SCRAPER_ENABLED=true
SCRAPER_ENABLED_SITES=dev.bg,jobs.bg

# Site-specific settings
DEV_BG_ENABLED=true
DEV_BG_REQUEST_DELAY=2000
DEV_BG_MAX_PAGES=10

JOBS_BG_ENABLED=true
JOBS_BG_REQUEST_DELAY=3000
JOBS_BG_MAX_PAGES=10

# Duplicate detection
DUPLICATE_DETECTION_ENABLED=true
FUZZY_MATCH_THRESHOLD=0.8
COMPANY_MATCH_THRESHOLD=0.8
CROSS_SITE_DEDUPLICATION=true
```

### Configuration Structure

```typescript
// scraper.config.ts
export default registerAs('scraper', () => ({
  enabled: true,
  enabledSites: ['dev.bg', 'jobs.bg'],
  sites: {
    devBg: { /* dev.bg config */ },
    jobsBg: { /* jobs.bg config */ },
  },
  duplicateDetection: {
    enabled: true,
    fuzzyMatchThreshold: 0.8,
    // ...
  },
}));
```

## API Endpoints

### Enhanced API v2 Endpoints

```
POST /api/v2/scraper/scrape                # Multi-site scraping
POST /api/v2/scraper/sites/{site}/scrape   # Single site scraping  
POST /api/v2/scraper/jobs/check-duplicates # Check for duplicates
GET  /api/v2/scraper/stats                 # Enhanced statistics
GET  /api/v2/scraper/scrapers              # Available scrapers info
POST /api/v2/scraper/jobs/{url}/details    # Fetch job details
```

### Query Parameters

```
?sites=dev.bg,jobs.bg        # Specific sites to scrape
?limit=50                    # Max jobs per site
?enableAI=true              # Enable AI extraction
?enableCompanyAnalysis=true  # Enable company analysis
?enableDuplicateDetection=true # Enable duplicate detection
?force=false                # Force re-scraping
```

### Example Requests

```bash
# Scrape all sites with duplicate detection
curl -X POST "http://localhost:3001/api/v1/scraper/v2/scrape?limit=10"

# Scrape only jobs.bg
curl -X POST "http://localhost:3001/api/v1/scraper/v2/sites/jobs.bg/scrape?limit=5"

# Check duplicates for a job
curl -X POST "http://localhost:3001/api/v1/scraper/v2/jobs/check-duplicates" \
  -H "Content-Type: application/json" \
  -d '{"title":"Senior Java Developer","company":"UKG","sourceSite":"dev.bg"}'
```

## Adding New Job Sites

### 1. Create Scraper Class

```typescript
// scrapers/new-site.scraper.ts
import { BaseScraper } from './base.scraper';

@Injectable()
export class NewSiteScraper extends BaseScraper {
  constructor(configService: ConfigService) {
    super(configService, 'new-site.com');
  }

  async scrapeJobs(options): Promise<ScrapingResult> {
    // Implement site-specific scraping logic
  }

  async fetchJobDetails(jobUrl): Promise<JobDetails> {
    // Implement job details fetching
  }

  getSiteConfig() {
    return {
      name: 'new-site.com',
      baseUrl: 'https://new-site.com',
      supportedLocations: ['Sofia', 'Remote'],
      supportedCategories: ['Java', 'JavaScript'],
    };
  }

  canHandle(url: string): boolean {
    return url.includes('new-site.com');
  }
}
```

### 2. Register in Module

```typescript
// scraper-v2.module.ts
@Module({
  providers: [
    // ... existing providers
    NewSiteScraper,
  ],
})
```

### 3. Add to Registry

```typescript
// scraper-registry.service.ts
private registerScrapers(): void {
  // ... existing scrapers
  
  if (this.isScraperEnabled('new-site.com')) {
    this.scrapers.set('new-site.com', this.newSiteScraper);
  }
}
```

### 4. Add Configuration

```typescript
// scraper.config.ts
sites: {
  // ... existing sites
  newSite: {
    enabled: process.env.NEW_SITE_ENABLED !== 'false',
    baseUrl: process.env.NEW_SITE_BASE_URL || 'https://new-site.com',
    // ... site-specific config
  },
}
```

## Migration Guide

### For Existing Code

The V2 architecture maintains backward compatibility. Existing code using `ScraperService` will continue to work.

### Recommended Migration Path

1. **Phase 1**: Deploy V2 alongside V1 (both available)
2. **Phase 2**: Update consumers to use V2 endpoints gradually  
3. **Phase 3**: Deprecate V1 endpoints (keep for emergency)
4. **Phase 4**: Remove V1 code after confidence period

### Testing Migration

```bash
# Test V1 (legacy)
curl -X POST "http://localhost:3001/api/v1/scraper/dev-bg/test?limit=1"

# Test V2 (new)
curl -X POST "http://localhost:3001/api/v1/scraper/v2/scrape?sites=dev.bg&limit=1"

# Compare results - should be similar but V2 includes duplicate detection
```

## Benefits of V2 Architecture

### 1. Scalability
- Easy to add new job sites
- Plugin-based architecture
- Site-independent core logic

### 2. Data Quality
- Cross-site duplicate elimination
- Company name standardization  
- Better data completeness through merging

### 3. Maintainability
- Shared common functionality
- Consistent interfaces
- Clear separation of concerns

### 4. Robustness
- Fault isolation per site
- Retry and error handling
- Rate limiting built-in

### 5. Observability
- Enhanced statistics and metrics
- Per-site performance tracking
- Detailed error reporting

## Performance Considerations

### 1. Database Queries
- GIN indexes on JSON fields for fast lookups
- Efficient duplicate detection queries
- Pagination for large result sets

### 2. Memory Usage
- Streaming job processing (not loading all in memory)
- Configurable batch sizes
- Proper cleanup of processed data

### 3. Rate Limiting
- Per-site request delays
- Exponential backoff on failures
- Respectful scraping practices

### 4. Caching
- AI extraction result caching
- Company analysis caching
- HTTP response caching where appropriate

## Monitoring and Debugging

### Logs to Monitor

```
# Successful scraping
✅ Multi-site scraping completed. Total: 156 jobs, New: 23 jobs, Duplicates: 8

# Duplicate detection
🔍 Found 3 potential duplicates for: Senior Java Developer at UKG

# Company matching  
🏢 Merging with existing company abc123 (score: 0.92)

# Site errors
❌ dev.bg: Failed to parse job listing: Invalid HTML structure
```

### Key Metrics

- Jobs found vs. jobs created (duplicate detection effectiveness)
- Company match rate (deduplication success)
- Per-site success rates
- Processing time per site
- Error rates by type

## Future Enhancements

### Planned Features

1. **ML-based duplicate detection** - Replace string similarity with ML models
2. **Real-time scraping** - WebSocket-based live job updates
3. **Scraper marketplace** - Community-contributed scrapers
4. **Advanced filtering** - Location-based, skill-based job filtering
5. **Data validation** - Automatic job posting quality scoring

### Integration Points

1. **Notification system** - Alert on duplicate jobs, new companies
2. **Analytics dashboard** - Visualize scraping effectiveness  
3. **Admin interface** - Manage scrapers, view duplicates
4. **API rate limiting** - Prevent abuse of scraping endpoints

---

## Quick Start

1. **Enable V2 module** in `app.module.ts`
2. **Run database migration** to add new fields
3. **Configure environment variables** for enabled sites
4. **Test with single site** before enabling all sites
5. **Monitor logs** for duplicate detection effectiveness
6. **Gradually migrate** existing scraping jobs to V2

The V2 architecture provides a solid foundation for scaling job data collection across multiple sites while maintaining data quality and system reliability.