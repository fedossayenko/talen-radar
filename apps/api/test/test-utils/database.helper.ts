import { PrismaClient } from '@prisma/client';
import { execSync } from 'child_process';

export class DatabaseHelper {
  private static prisma: PrismaClient;

  static async initializeTestDatabase(): Promise<PrismaClient> {
    const workerId = process.env.JEST_WORKER_ID || '1';
    // Use PostgreSQL for tests with worker-specific database names
    const databaseUrl = process.env.DATABASE_URL || `postgresql://postgres:dev_postgres_password_change_in_production@localhost:5432/talent_radar_test_${workerId}`;

    if (!this.prisma) {
      this.prisma = new PrismaClient({
        datasources: {
          db: {
            url: databaseUrl,
          },
        },
      });

      await this.prisma.$connect();

      // Create test database if it doesn't exist and run migrations
      try {
        execSync(`DATABASE_URL="${databaseUrl}" npx prisma migrate dev --name test_init`, {
          stdio: 'inherit',
          timeout: 30000,
        });
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      } catch (_error) {
        // If migrations fail, try db push instead
        try {
          execSync(`DATABASE_URL="${databaseUrl}" npx prisma db push --force-reset --skip-generate`, {
            stdio: 'inherit',
            timeout: 30000,
          });
        } catch (pushError) {
          // eslint-disable-next-line no-console
          console.warn('Database setup warning:', pushError.message);
          // Continue anyway - tables might already exist
        }
      }
    }

    return this.prisma;
  }

  static async clearDatabase(): Promise<void> {
    if (!this.prisma) return;

    try {
      // Clear all tables in the correct order for PostgreSQL (respecting foreign key constraints)
      // Use try-catch for each table to handle missing tables gracefully
      try {
        await this.prisma.application.deleteMany();
      } catch {
        // Table might not exist yet, ignore
      }

      try {
        await this.prisma.vacancyScore.deleteMany();
      } catch {
        // Table might not exist yet, ignore
      }

      try {
        await this.prisma.vacancy.deleteMany();
      } catch {
        // Table might not exist yet, ignore
      }

      try {
        await this.prisma.companyAnalysis.deleteMany();
      } catch {
        // Table might not exist yet, ignore
      }

      try {
        await this.prisma.companySource.deleteMany();
      } catch {
        // Table might not exist yet, ignore
      }

      try {
        await this.prisma.company.deleteMany();
      } catch {
        // Table might not exist yet, ignore
      }

      try {
        await this.prisma.cV.deleteMany();
      } catch {
        // Table might not exist yet, ignore
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.warn('Database clearing warning:', error.message);
    }
  }

  static async seedTestData(): Promise<void> {
    if (!this.prisma) return;

    // Create test companies
    const testCompany = await this.prisma.company.create({
      data: {
        name: 'Test Tech Company',
        website: 'https://test-tech.com',
        description: 'A test technology company',
        industry: 'Technology',
        size: '100-500',
        location: 'San Francisco, CA',
      },
    });

    // Create test vacancies
    await this.prisma.vacancy.create({
      data: {
        title: 'Senior Frontend Developer',
        description: 'Looking for a senior frontend developer with React experience',
        requirements: JSON.stringify(['React', 'TypeScript', '3+ years experience']),
        location: 'Remote',
        salaryMin: 80000,
        salaryMax: 120000,
        experienceLevel: 'senior',
        employmentType: 'full-time',
        companyId: testCompany.id,
        sourceUrl: 'https://example.com/job/1',
        sourceSite: 'example.com',
        status: 'active',
      },
    });

    await this.prisma.vacancy.create({
      data: {
        title: 'Backend Engineer',
        description: 'Backend engineer position for Node.js development',
        requirements: JSON.stringify(['Node.js', 'PostgreSQL', '2+ years experience']),
        location: 'New York, NY',
        salaryMin: 90000,
        salaryMax: 140000,
        experienceLevel: 'mid',
        employmentType: 'full-time',
        companyId: testCompany.id,
        sourceUrl: 'https://example.com/job/2',
        sourceSite: 'example.com',
        status: 'active',
      },
    });
  }

  static async closeDatabase(): Promise<void> {
    if (this.prisma) {
      await this.prisma.$disconnect();
      this.prisma = null;
    }
  }

  static getPrismaClient(): PrismaClient {
    return this.prisma;
  }
}