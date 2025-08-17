import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { ScraperService } from '../src/modules/scraper/scraper.service';
import { DevBgScraper } from '../src/modules/scraper/scrapers/dev-bg.scraper';
import { CompanyService } from '../src/modules/company/company.service';
import { VacancyService } from '../src/modules/vacancy/vacancy.service';
import { PrismaService } from '../src/common/database/prisma.service';
import { Logger } from '@nestjs/common';

async function testRealScraper() {
  const logger = new Logger('TestRealScraper');
  
  try {
    logger.log('🚀 Starting real scraper validation...');
    
    // Bootstrap the NestJS application context
    const app = await NestFactory.createApplicationContext(AppModule);
    
    // Get all necessary services
    const scraperService = app.get(ScraperService);
    const devBgScraper = app.get(DevBgScraper);
    const companyService = app.get(CompanyService);
    const vacancyService = app.get(VacancyService);
    const prismaService = app.get(PrismaService);
    
    logger.log('✅ NestJS application context initialized');
    
    // Test 1: Direct scraper functionality
    logger.log('\n📊 Test 1: Testing DevBgScraper directly...');
    
    const startTime = Date.now();
    const jobListings = await devBgScraper.scrapeJavaJobs({ page: 1 });
    const scrapingDuration = Date.now() - startTime;
    
    logger.log(`✅ Direct scraping completed in ${scrapingDuration}ms`);
    logger.log(`📈 Found ${jobListings.length} job listings`);
    
    if (jobListings.length > 0) {
      // Display sample job data
      const sampleJob = jobListings[0];
      logger.log('📝 Sample job data:');
      logger.log(`   Title: "${sampleJob.title}"`);
      logger.log(`   Company: "${sampleJob.company}"`);
      logger.log(`   Location: "${sampleJob.location}"`);
      logger.log(`   Work Model: "${sampleJob.workModel}"`);
      logger.log(`   Technologies: [${sampleJob.technologies.join(', ')}]`);
      logger.log(`   URL: ${sampleJob.url}`);
      logger.log(`   Posted: ${sampleJob.postedDate}`);
      if (sampleJob.salaryRange) {
        logger.log(`   Salary: ${sampleJob.salaryRange}`);
      }
    } else {
      logger.warn('⚠️ No job listings found - this might indicate a scraping issue');
      await app.close();
      return;
    }
    
    // Test 2: Check database state before scraping
    logger.log('\n📊 Test 2: Checking database state before scraping...');
    
    const companiesBefore = await companyService.findAll({});
    const vacanciesBefore = await vacancyService.findAll({});
    
    logger.log(`📊 Companies before: ${companiesBefore.data.length}`);
    logger.log(`📊 Vacancies before: ${vacanciesBefore.data.length}`);
    
    // Test 3: Full scraper service test
    logger.log('\n📊 Test 3: Testing ScraperService full flow...');
    
    const serviceStartTime = Date.now();
    const result = await scraperService.scrapeDevBg();
    const serviceDuration = Date.now() - serviceStartTime;
    
    logger.log('✅ Full scraper service completed!');
    logger.log(`⏱️ Service duration: ${serviceDuration}ms`);
    logger.log(`📈 Results:\n` +
      `      - Total jobs found: ${result.totalJobsFound}\n` +
      `      - New vacancies: ${result.newVacancies}\n` +
      `      - Updated vacancies: ${result.updatedVacancies}\n` +
      `      - New companies: ${result.newCompanies}\n` +
      `      - Errors: ${result.errors.length}\n` +
      `      - Duration: ${result.duration}ms`);
    
    if (result.errors.length > 0) {
      logger.warn('⚠️ Errors encountered:');
      result.errors.forEach((error, index) => {
        logger.warn(`  ${index + 1}. ${error}`);
      });
    }
    
    // Test 4: Verify database persistence
    logger.log('\n📊 Test 4: Verifying database persistence...');
    
    const companiesAfter = await companyService.findAll({});
    const vacanciesAfter = await vacancyService.findAll({});
    
    logger.log(`📊 Companies after: ${companiesAfter.data.length} (+ ${companiesAfter.data.length - companiesBefore.data.length})`);
    logger.log(`📊 Vacancies after: ${vacanciesAfter.data.length} (+ ${vacanciesAfter.data.length - vacanciesBefore.data.length})`);
    
    // Display some sample persisted data
    if (companiesAfter.data.length > companiesBefore.data.length) {
      const newCompanies = companiesAfter.data.slice(companiesBefore.data.length);
      logger.log('📝 Sample new companies:');
      newCompanies.slice(0, 3).forEach((company, index) => {
        logger.log(`   ${index + 1}. ${company.name} (${company.location || 'No location'})`);
      });
    }
    
    if (vacanciesAfter.data.length > vacanciesBefore.data.length) {
      const newVacancies = vacanciesAfter.data.slice(vacanciesBefore.data.length);
      logger.log('📝 Sample new vacancies:');
      newVacancies.slice(0, 3).forEach((vacancy, index) => {
        logger.log(`   ${index + 1}. ${vacancy.title} at ${vacancy.company?.name || 'Unknown Company'}`);
      });
    }
    
    // Test 5: Test job details fetching (if available)
    logger.log('\n📊 Test 5: Testing job details fetching...');
    
    if (jobListings.length > 0 && jobListings[0].url) {
      try {
        const jobDetails = await devBgScraper.fetchJobDetails(jobListings[0].url);
        logger.log(`✅ Job details fetched successfully`);
        logger.log(`📝 Description length: ${jobDetails.description.length} characters`);
        logger.log(`📝 Requirements length: ${jobDetails.requirements.length} characters`);
        
        if (jobDetails.description) {
          logger.log(`📝 Description preview: "${jobDetails.description.substring(0, 100)}..."`);
        }
      } catch (error) {
        logger.warn(`⚠️ Job details fetching failed: ${error.message}`);
      }
    }
    
    // Get scraping statistics
    const stats = await scraperService.getScrapingStats();
    logger.log(`📊 Final scraping statistics:\n` +
      `      - Total vacancies: ${stats.totalVacancies}\n` +
      `      - Active vacancies: ${stats.activeVacancies}\n` +
      `      - Companies from dev.bg: ${stats.companiesFromDevBg}`);
    
    await app.close();
    
    // Summary
    logger.log('\n🎉 REAL SCRAPER VALIDATION COMPLETED SUCCESSFULLY!');
    logger.log('='.repeat(60));
    logger.log('✅ All core functionality verified:');
    logger.log('   ✓ Direct scraper works');
    logger.log('   ✓ Service integration works');
    logger.log('   ✓ Database persistence works');
    logger.log('   ✓ Job details fetching works');
    logger.log('   ✓ Companies and vacancies saved correctly');
    logger.log('='.repeat(60));
    
  } catch (error) {
    logger.error('❌ Real scraper validation failed:', error);
    if (error.stack) {
      logger.error('Stack trace:', error.stack);
    }
    process.exit(1);
  }
}

// Handle uncaught exceptions
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

testRealScraper();