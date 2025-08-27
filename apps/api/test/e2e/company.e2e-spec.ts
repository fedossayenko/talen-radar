import { TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { CompanyController } from './company.controller';
import { CompanyService } from './company.service';
import { TestModule } from '../../../test/test-utils/test.module';
import { MockDataFactory } from '../../../test/test-utils/mock-data.factory';
import { DatabaseHelper } from '../../../test/test-utils/database.helper';

describe('CompanyController (e2e)', () => {
  let app: INestApplication;
  let moduleRef: TestingModule;

  beforeAll(async () => {
    moduleRef = await TestModule.createTestingModule([
      CompanyController,
    ], [
      CompanyService,
    ]);

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await TestModule.closeTestModule(moduleRef);
    await app.close();
  });

  beforeEach(async () => {
    await TestModule.clearTestData();
  });

  describe('/companies (GET)', () => {
    it('should return empty list when no companies exist', async () => {
      const response = await request(app.getHttpServer())
        .get('/companies')
        .expect(200);

      expect(response.body).toBeSuccessfulResponse();
      expect(response.body.data).toEqual([]);
      expect(response.body).toHaveValidPagination();
      expect(response.body.pagination.total).toBe(0);
    });

    it('should return paginated list of companies', async () => {
      // Arrange: Create test companies
      const prisma = DatabaseHelper.getPrismaClient();
      await prisma.company.create({
        data: MockDataFactory.createCompanyData({ name: 'Alpha Corp' }),
      });
      await prisma.company.create({
        data: MockDataFactory.createCompanyData({ name: 'Beta Inc' }),
      });

      // Act & Assert
      const response = await request(app.getHttpServer())
        .get('/companies')
        .expect(200);

      expect(response.body).toBeSuccessfulResponse();
      expect(response.body.data).toHaveLength(2);
      expect(response.body).toHaveValidPagination();
      expect(response.body.pagination.total).toBe(2);

      // Companies should be sorted by name
      expect(response.body.data[0].name).toBe('Alpha Corp');
      expect(response.body.data[1].name).toBe('Beta Inc');
    });

    it('should filter companies by search term', async () => {
      // Arrange
      const prisma = DatabaseHelper.getPrismaClient();
      await prisma.company.create({
        data: MockDataFactory.createCompanyData({ name: 'Tech Solutions' }),
      });
      await prisma.company.create({
        data: MockDataFactory.createCompanyData({ name: 'Marketing Agency' }),
      });

      // Act & Assert
      const response = await request(app.getHttpServer())
        .get('/companies')
        .query({ search: 'tech' })
        .expect(200);

      expect(response.body).toBeSuccessfulResponse();
      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].name).toBe('Tech Solutions');
    });

    it('should filter companies by industry', async () => {
      // Arrange
      const prisma = DatabaseHelper.getPrismaClient();
      await prisma.company.create({
        data: MockDataFactory.createCompanyData({ 
          name: 'Tech Corp',
          industry: 'Technology' 
        }),
      });
      await prisma.company.create({
        data: MockDataFactory.createCompanyData({ 
          name: 'Finance Corp',
          industry: 'Finance' 
        }),
      });

      // Act & Assert
      const response = await request(app.getHttpServer())
        .get('/companies')
        .query({ industry: 'Technology' })
        .expect(200);

      expect(response.body).toBeSuccessfulResponse();
      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].industry).toBe('Technology');
    });

    it('should handle pagination parameters', async () => {
      // Arrange: Create 25 companies
      const prisma = DatabaseHelper.getPrismaClient();
      const companies = Array.from({ length: 25 }, (_, i) =>
        MockDataFactory.createCompanyData({ name: `Company ${i + 1}` })
      );

      for (const companyData of companies) {
        await prisma.company.create({ data: companyData });
      }

      // Act & Assert - Page 1
      const page1Response = await request(app.getHttpServer())
        .get('/companies')
        .query({ page: 1, limit: 10 })
        .expect(200);

      expect(page1Response.body).toBeSuccessfulResponse();
      expect(page1Response.body.data).toHaveLength(10);
      expect(page1Response.body.pagination).toEqual({
        page: 1,
        limit: 10,
        total: 25,
        pages: 3,
      });

      // Act & Assert - Page 2
      const page2Response = await request(app.getHttpServer())
        .get('/companies')
        .query({ page: 2, limit: 10 })
        .expect(200);

      expect(page2Response.body).toBeSuccessfulResponse();
      expect(page2Response.body.data).toHaveLength(10);
      expect(page2Response.body.pagination.page).toBe(2);

      // Ensure different data on different pages
      expect(page1Response.body.data[0].id).not.toBe(page2Response.body.data[0].id);
    });
  });

  describe('/companies/:id (GET)', () => {
    it('should return a company by ID', async () => {
      // Arrange
      const prisma = DatabaseHelper.getPrismaClient();
      const company = await prisma.company.create({
        data: MockDataFactory.createCompanyData({ name: 'Test Company' }),
      });

      // Act & Assert
      const response = await request(app.getHttpServer())
        .get(`/companies/${company.id}`)
        .expect(200);

      expect(response.body).toBeSuccessfulResponse();
      expect(response.body.data.id).toBe(company.id);
      expect(response.body.data.name).toBe('Test Company');
    });

    it('should return 404 for non-existent company', async () => {
      const response = await request(app.getHttpServer())
        .get('/companies/non-existent-id')
        .expect(404);

      expect(response.body).toBeValidApiError();
      expect(response.body.error.message).toContain('not found');
    });
  });

  describe('/companies/:id (PUT)', () => {
    it('should update a company successfully', async () => {
      // Arrange
      const prisma = DatabaseHelper.getPrismaClient();
      const company = await prisma.company.create({
        data: MockDataFactory.createCompanyData({ name: 'Original Name' }),
      });

      const updateData = {
        name: 'Updated Name',
        description: 'Updated description',
      };

      // Act & Assert
      const response = await request(app.getHttpServer())
        .put(`/companies/${company.id}`)
        .send(updateData)
        .expect(200);

      expect(response.body).toBeSuccessfulResponse();
      expect(response.body.data.name).toBe('Updated Name');
      expect(response.body.data.description).toBe('Updated description');
      expect(response.body.message).toBe('Company updated successfully');
    });

    it('should return 404 when updating non-existent company', async () => {
      const updateData = { name: 'Updated Name' };

      const response = await request(app.getHttpServer())
        .put('/companies/non-existent-id')
        .send(updateData)
        .expect(404);

      expect(response.body).toBeValidApiError();
    });
  });

  describe('/companies/:id/analyze (POST)', () => {
    it('should analyze a company successfully', async () => {
      // Arrange
      const prisma = DatabaseHelper.getPrismaClient();
      const company = await prisma.company.create({
        data: MockDataFactory.createCompanyData({ name: 'Analyze Corp' }),
      });

      // Act & Assert
      const response = await request(app.getHttpServer())
        .post(`/companies/${company.id}/analyze`)
        .send({ forceRefresh: true })
        .expect(200);

      expect(response.body).toBeSuccessfulResponse();
      expect(response.body.data).toHaveProperty('cultureScore');
      expect(response.body.data).toHaveProperty('retentionRate');
      expect(response.body.data).toHaveProperty('hiringProcess');
      expect(response.body.data.companyId).toBe(company.id);
      expect(response.body.message).toBe('Company analysis completed');
    });

    it('should return existing analysis when recent and not forced', async () => {
      // Arrange
      const prisma = DatabaseHelper.getPrismaClient();
      const company = await prisma.company.create({
        data: MockDataFactory.createCompanyData({ name: 'Existing Analysis Corp' }),
      });

      // Create recent analysis
      const existingAnalysis = await prisma.companyAnalysis.create({
        data: MockDataFactory.createCompanyAnalysisData(company.id),
      });

      // Act & Assert
      const response = await request(app.getHttpServer())
        .post(`/companies/${company.id}/analyze`)
        .send({ forceRefresh: false })
        .expect(200);

      expect(response.body).toBeSuccessfulResponse();
      expect(response.body.data.id).toBe(existingAnalysis.id);
      expect(response.body.message).toBe('Using existing recent analysis');
    });

    it('should return 404 for non-existent company', async () => {
      const response = await request(app.getHttpServer())
        .post('/companies/non-existent-id/analyze')
        .send({ forceRefresh: true })
        .expect(404);

      expect(response.body).toBeValidApiError();
    });
  });
});