import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import helmet from 'helmet';
import compression from 'compression';
import { AppModule } from '../../src/app.module';
import { RedisService } from '../../src/common/redis/redis.service';
import { RedisMockService } from '../test-utils/redis-mock.service';
import { AICoreService } from '../../src/modules/ai/services/ai-core.service';
import { AiRequestLoggerService } from '../../src/common/ai-logging/ai-request-logger.service';
import { AICoreServiceMock, AiRequestLoggerServiceMock } from '../test-utils/ai-core-mock.service';
import { MockDataFactory } from '../test-utils/mock-data.factory';
import { DatabaseHelper } from '../test-utils/database.helper';

describe('CVController (e2e)', () => {
  let app: INestApplication;
  let moduleRef: TestingModule;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
    .overrideProvider(RedisService)
    .useClass(RedisMockService)
    .overrideProvider(AICoreService)
    .useClass(AICoreServiceMock)
    .overrideProvider(AiRequestLoggerService)
    .useClass(AiRequestLoggerServiceMock)
    .compile();

    app = moduleRef.createNestApplication();
    
    if (!app) {
      throw new Error('Failed to create NestJS application for testing');
    }
    
    // Configure the app like in main.ts for tests
    app.use(helmet());
    app.use(compression());
    
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: {
          enableImplicitConversion: true,
        },
      }),
    );
    
    app.setGlobalPrefix('api/v1');
    app.enableCors({
      origin: true, // Allow all origins in test environment
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
      allowedHeaders: ['Content-Type', 'Authorization'],
    });
    
    await app.init();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
    if (moduleRef) {
      await moduleRef.close();
    }
  });

  beforeEach(async () => {
    await DatabaseHelper.clearDatabase();
  });

  describe('GET /api/v1/cvs', () => {
    it('should return empty list when no CVs exist', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/cvs')
        .expect(200);

      expect(response.body).toHaveProperty('data');
      expect(response.body.data).toEqual([]);
      expect(response.body).toHaveProperty('pagination');
      expect(response.body.pagination.total).toBe(0);
    });

    it('should return paginated list of CVs', async () => {
      // Arrange: Create test CVs
      const prisma = DatabaseHelper.getPrismaClient();
      
      await prisma.cv.createMany({
        data: [
          MockDataFactory.createCVData({ 
            candidateName: 'John Doe',
            email: 'john.doe@example.com',
            title: 'Senior Java Developer',
          }),
          MockDataFactory.createCVData({ 
            candidateName: 'Jane Smith',
            email: 'jane.smith@example.com',
            title: 'React Frontend Developer',
          }),
        ],
      });

      // Act & Assert
      const response = await request(app.getHttpServer())
        .get('/api/v1/cvs')
        .expect(200);

      expect(response.body).toHaveProperty('data');
      expect(response.body.data).toHaveLength(2);
      expect(response.body).toHaveProperty('pagination');
      expect(response.body.pagination.total).toBe(2);
      expect(response.body.data[0]).toHaveProperty('candidateName');
      expect(response.body.data[0]).toHaveProperty('email');
      expect(response.body.data[0]).toHaveProperty('title');
    });

    it('should filter CVs by skills', async () => {
      // Arrange
      const prisma = DatabaseHelper.getPrismaClient();
      
      await prisma.cv.createMany({
        data: [
          MockDataFactory.createCVData({ 
            candidateName: 'John Doe',
            skills: ['Java', 'Spring Boot', 'MySQL'],
            title: 'Java Developer',
          }),
          MockDataFactory.createCVData({ 
            candidateName: 'Jane Smith',
            skills: ['React', 'TypeScript', 'Node.js'],
            title: 'Frontend Developer',
          }),
        ],
      });

      // Act & Assert - filter by Java skill
      const response = await request(app.getHttpServer())
        .get('/api/v1/cvs')
        .query({ skills: 'Java' })
        .expect(200);

      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].candidateName).toBe('John Doe');
      expect(response.body.data[0].skills).toContain('Java');
    });

    it('should filter CVs by experience level', async () => {
      // Arrange
      const prisma = DatabaseHelper.getPrismaClient();
      
      await prisma.cv.createMany({
        data: [
          MockDataFactory.createCVData({ 
            candidateName: 'Senior Dev',
            experienceLevel: 'Senior',
            yearsOfExperience: 7,
          }),
          MockDataFactory.createCVData({ 
            candidateName: 'Junior Dev',
            experienceLevel: 'Junior',
            yearsOfExperience: 2,
          }),
        ],
      });

      // Act & Assert
      const response = await request(app.getHttpServer())
        .get('/api/v1/cvs')
        .query({ experienceLevel: 'Senior' })
        .expect(200);

      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].candidateName).toBe('Senior Dev');
      expect(response.body.data[0].experienceLevel).toBe('Senior');
    });
  });

  describe('POST /api/v1/cvs', () => {
    it('should create new CV', async () => {
      const cvData = {
        candidateName: 'John Doe',
        email: 'john.doe@example.com',
        phone: '+359123456789',
        title: 'Senior Java Developer',
        summary: 'Experienced Java developer with 5+ years of experience...',
        skills: ['Java', 'Spring Boot', 'MySQL', 'Docker'],
        experience: [
          {
            company: 'Tech Corp',
            position: 'Java Developer',
            startDate: '2019-01-01',
            endDate: '2023-12-31',
            description: 'Developed microservices using Spring Boot',
          },
        ],
        education: [
          {
            institution: 'Sofia University',
            degree: 'Bachelor in Computer Science',
            startDate: '2015-09-01',
            endDate: '2019-06-01',
          },
        ],
        experienceLevel: 'Senior',
        yearsOfExperience: 5,
      };

      // Act & Assert
      const response = await request(app.getHttpServer())
        .post('/api/v1/cvs')
        .send(cvData)
        .expect(201);

      expect(response.body).toHaveProperty('id');
      expect(response.body).toHaveProperty('candidateName', 'John Doe');
      expect(response.body).toHaveProperty('email', 'john.doe@example.com');
      expect(response.body).toHaveProperty('title', 'Senior Java Developer');
      expect(response.body).toHaveProperty('skills');
      expect(response.body.skills).toContain('Java');
      expect(response.body).toHaveProperty('experience');
      expect(response.body.experience).toHaveLength(1);
      expect(response.body).toHaveProperty('education');
      expect(response.body.education).toHaveLength(1);
    });

    it('should validate required fields when creating CV', async () => {
      const incompleteData = {
        candidateName: 'John Doe',
        // Missing required fields like email
      };

      const response = await request(app.getHttpServer())
        .post('/api/v1/cvs')
        .send(incompleteData)
        .expect(400);

      expect(response.body).toHaveProperty('statusCode', 400);
      expect(response.body).toHaveProperty('message');
    });

    it('should validate email format', async () => {
      const cvData = {
        candidateName: 'John Doe',
        email: 'invalid-email-format',
        title: 'Developer',
      };

      const response = await request(app.getHttpServer())
        .post('/api/v1/cvs')
        .send(cvData)
        .expect(400);

      expect(response.body).toHaveProperty('statusCode', 400);
    });
  });

  describe('GET /api/v1/cvs/:id', () => {
    it('should return CV details by ID', async () => {
      // Arrange
      const prisma = DatabaseHelper.getPrismaClient();
      
      const cv = await prisma.cv.create({
        data: MockDataFactory.createCVData({ 
          candidateName: 'John Doe',
          email: 'john.doe@example.com',
          title: 'Senior Java Developer',
          skills: ['Java', 'Spring Boot'],
        }),
      });

      // Act & Assert
      const response = await request(app.getHttpServer())
        .get(`/api/v1/cvs/${cv.id}`)
        .expect(200);

      expect(response.body).toHaveProperty('id', cv.id);
      expect(response.body).toHaveProperty('candidateName', 'John Doe');
      expect(response.body).toHaveProperty('email', 'john.doe@example.com');
      expect(response.body).toHaveProperty('title', 'Senior Java Developer');
      expect(response.body).toHaveProperty('skills');
      expect(response.body.skills).toContain('Java');
    });

    it('should return 404 for non-existent CV', async () => {
      const nonExistentId = 'non-existent-id';
      
      const response = await request(app.getHttpServer())
        .get(`/api/v1/cvs/${nonExistentId}`)
        .expect(404);

      expect(response.body).toHaveProperty('statusCode', 404);
    });
  });

  describe('PUT /api/v1/cvs/:id', () => {
    it('should update CV successfully', async () => {
      // Arrange
      const prisma = DatabaseHelper.getPrismaClient();
      
      const cv = await prisma.cv.create({
        data: MockDataFactory.createCVData({ 
          candidateName: 'John Doe',
          title: 'Java Developer',
          experienceLevel: 'Mid-level',
        }),
      });

      const updateData = {
        title: 'Senior Java Developer',
        experienceLevel: 'Senior',
        yearsOfExperience: 6,
        skills: ['Java', 'Spring Boot', 'Kubernetes', 'AWS'],
      };

      // Act & Assert
      const response = await request(app.getHttpServer())
        .put(`/api/v1/cvs/${cv.id}`)
        .send(updateData)
        .expect(200);

      expect(response.body).toHaveProperty('id', cv.id);
      expect(response.body).toHaveProperty('title', 'Senior Java Developer');
      expect(response.body).toHaveProperty('experienceLevel', 'Senior');
      expect(response.body).toHaveProperty('yearsOfExperience', 6);
      expect(response.body.skills).toContain('Kubernetes');
      expect(response.body.skills).toContain('AWS');
    });

    it('should return 404 when updating non-existent CV', async () => {
      const nonExistentId = 'non-existent-id';
      const updateData = { title: 'Updated Title' };

      const response = await request(app.getHttpServer())
        .put(`/api/v1/cvs/${nonExistentId}`)
        .send(updateData)
        .expect(404);

      expect(response.body).toHaveProperty('statusCode', 404);
    });
  });

  describe('DELETE /api/v1/cvs/:id', () => {
    it('should delete CV successfully', async () => {
      // Arrange
      const prisma = DatabaseHelper.getPrismaClient();
      
      const cv = await prisma.cv.create({
        data: MockDataFactory.createCVData({ 
          candidateName: 'John Doe',
        }),
      });

      // Act & Assert
      const response = await request(app.getHttpServer())
        .delete(`/api/v1/cvs/${cv.id}`)
        .expect(200);

      expect(response.body).toHaveProperty('message');
      
      // Verify CV is deleted
      const deletedCV = await prisma.cv.findUnique({
        where: { id: cv.id },
      });
      expect(deletedCV).toBeNull();
    });

    it('should return 404 when deleting non-existent CV', async () => {
      const nonExistentId = 'non-existent-id';

      const response = await request(app.getHttpServer())
        .delete(`/api/v1/cvs/${nonExistentId}`)
        .expect(404);

      expect(response.body).toHaveProperty('statusCode', 404);
    });
  });

  describe('POST /api/v1/cvs/:id/match', () => {
    it('should match CV with job vacancies', async () => {
      // Arrange
      const prisma = DatabaseHelper.getPrismaClient();
      
      // Create company and vacancy
      await prisma.company.create({
        data: MockDataFactory.createCompanyData({ name: 'Tech Corp' }),
      });

      const company = await prisma.company.findFirst({ where: { name: 'Tech Corp' } });
      
      const vacancy = await prisma.vacancy.create({
        data: MockDataFactory.createVacancyData({ 
          title: 'Java Developer',
          companyId: company.id,
          technologies: ['java', 'spring'],
          experienceLevel: 'Mid-level',
        }),
      });

      // Create CV
      const cv = await prisma.cv.create({
        data: MockDataFactory.createCVData({ 
          candidateName: 'John Doe',
          skills: ['Java', 'Spring Boot', 'MySQL'],
          experienceLevel: 'Mid-level',
          yearsOfExperience: 4,
        }),
      });

      // Act & Assert
      const response = await request(app.getHttpServer())
        .post(`/api/v1/cvs/${cv.id}/match`)
        .send({ 
          preferences: {
            location: 'Sofia',
            salaryExpectation: { min: 4000, max: 6000 },
            remoteWork: false,
          }
        })
        .expect(200);

      expect(response.body).toHaveProperty('matches');
      expect(Array.isArray(response.body.matches)).toBe(true);
      expect(response.body).toHaveProperty('totalMatches');
      
      if (response.body.matches.length > 0) {
        const match = response.body.matches[0];
        expect(match).toHaveProperty('vacancy');
        expect(match).toHaveProperty('matchScore');
        expect(match).toHaveProperty('breakdown');
        expect(match.matchScore).toBeGreaterThanOrEqual(0);
        expect(match.matchScore).toBeLessThanOrEqual(100);
      }
    });

    it('should return empty matches when no suitable vacancies exist', async () => {
      // Arrange
      const prisma = DatabaseHelper.getPrismaClient();
      
      const cv = await prisma.cv.create({
        data: MockDataFactory.createCVData({ 
          candidateName: 'John Doe',
          skills: ['Rare Technology'],
          experienceLevel: 'Expert',
        }),
      });

      // Act & Assert
      const response = await request(app.getHttpServer())
        .post(`/api/v1/cvs/${cv.id}/match`)
        .send({ 
          preferences: {
            location: 'Remote',
          }
        })
        .expect(200);

      expect(response.body).toHaveProperty('matches');
      expect(response.body.matches).toEqual([]);
      expect(response.body).toHaveProperty('totalMatches', 0);
    });
  });

  describe('POST /api/v1/cvs/upload', () => {
    it('should handle CV file upload (mock)', async () => {
      // Note: This test would require actual file upload in real implementation
      // For now, testing the endpoint structure
      
      const response = await request(app.getHttpServer())
        .post('/api/v1/cvs/upload')
        .attach('file', Buffer.from('fake pdf content'), 'resume.pdf')
        .expect(400); // Expecting validation error in mock environment

      // In real implementation, this would:
      // 1. Accept file upload
      // 2. Parse PDF/DOC content
      // 3. Extract information using AI
      // 4. Create CV record
      // 5. Return structured data
    });
  });

  describe('GET /api/v1/cvs/:id/analysis', () => {
    it('should return CV analysis with AI insights', async () => {
      // Arrange
      const prisma = DatabaseHelper.getPrismaClient();
      
      const cv = await prisma.cv.create({
        data: MockDataFactory.createCVData({ 
          candidateName: 'John Doe',
          title: 'Java Developer',
          skills: ['Java', 'Spring Boot', 'MySQL'],
          summary: 'Experienced Java developer with strong problem-solving skills...',
          yearsOfExperience: 5,
        }),
      });

      // Act & Assert
      const response = await request(app.getHttpServer())
        .get(`/api/v1/cvs/${cv.id}/analysis`)
        .expect(200);

      expect(response.body).toHaveProperty('analysis');
      expect(response.body.analysis).toHaveProperty('strengths');
      expect(response.body.analysis).toHaveProperty('improvements');
      expect(response.body.analysis).toHaveProperty('skillsAssessment');
      expect(response.body.analysis).toHaveProperty('marketFit');
      expect(response.body.analysis).toHaveProperty('recommendations');
      
      expect(Array.isArray(response.body.analysis.strengths)).toBe(true);
      expect(Array.isArray(response.body.analysis.improvements)).toBe(true);
      expect(Array.isArray(response.body.analysis.recommendations)).toBe(true);
    });

    it('should return 404 for analysis of non-existent CV', async () => {
      const nonExistentId = 'non-existent-id';

      const response = await request(app.getHttpServer())
        .get(`/api/v1/cvs/${nonExistentId}/analysis`)
        .expect(404);

      expect(response.body).toHaveProperty('statusCode', 404);
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid UUID format in params', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/cvs/invalid-uuid')
        .expect(400);

      expect(response.body).toHaveProperty('statusCode', 400);
    });

    it('should validate JSON structure in request body', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/cvs')
        .set('Content-Type', 'application/json')
        .send('invalid json')
        .expect(400);

      expect(response.body).toHaveProperty('statusCode', 400);
    });

    it('should handle large payload gracefully', async () => {
      const largeData = {
        candidateName: 'John Doe',
        email: 'john.doe@example.com',
        summary: 'x'.repeat(50000), // Very long summary
        skills: Array.from({ length: 1000 }, (_, i) => `skill-${i}`), // Many skills
      };

      const response = await request(app.getHttpServer())
        .post('/api/v1/cvs')
        .send(largeData)
        .expect(400); // Should validate and reject oversized payloads

      expect(response.body).toHaveProperty('statusCode', 400);
    });
  });
});