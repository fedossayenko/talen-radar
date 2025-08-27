import { faker } from '@faker-js/faker';

export class MockDataFactory {
  static createCompanyData(overrides: Partial<any> = {}) {
    return {
      name: faker.company.name(),
      website: faker.internet.url(),
      description: faker.company.catchPhrase(),
      industry: faker.helpers.arrayElement(['Technology', 'Finance', 'Healthcare', 'Education', 'Manufacturing']),
      size: faker.helpers.arrayElement(['1-10', '11-50', '51-200', '201-500', '501-1000', '1000+']),
      location: `${faker.location.city()}, ${faker.location.state()}`,
      logo: faker.image.url(),
      founded: faker.date.past({ years: 30 }).getFullYear(),
      ...overrides,
    };
  }

  static createVacancyData(overrides: Partial<any> = {}) {
    const title = faker.helpers.arrayElement([
      'Senior Software Engineer',
      'Frontend Developer',
      'Backend Engineer',
      'Full Stack Developer',
      'DevOps Engineer',
      'Data Scientist',
      'Product Manager',
      'UX Designer',
    ]);

    return {
      title,
      description: faker.lorem.paragraphs(3),
      requirements: faker.helpers.arrayElements([
        'JavaScript', 'TypeScript', 'React', 'Node.js', 'Python', 'Java',
        'AWS', 'Docker', 'Kubernetes', 'PostgreSQL', 'MongoDB', 'Git',
      ], { min: 3, max: 6 }),
      technologies: faker.helpers.arrayElements([
        'javascript', 'typescript', 'react', 'nodejs', 'python', 'java',
        'aws', 'docker', 'kubernetes', 'postgresql', 'mongodb', 'git',
      ], { min: 3, max: 6 }),
      location: faker.helpers.arrayElement(['Remote', 'Sofia, Bulgaria', 'Plovdiv, Bulgaria', 'Varna, Bulgaria']),
      salaryMin: faker.number.int({ min: 3000, max: 5000 }),
      salaryMax: faker.number.int({ min: 5000, max: 8000 }),
      salaryCurrency: 'BGN',
      experienceLevel: faker.helpers.arrayElement(['Junior', 'Mid-level', 'Senior', 'Lead']),
      employmentType: faker.helpers.arrayElement(['Full-time', 'Part-time', 'Contract']),
      sourceUrl: faker.internet.url(),
      sourceSite: faker.internet.domainName(),
      status: faker.helpers.arrayElement(['active', 'inactive', 'filled']),
      postedAt: faker.date.recent({ days: 30 }),
      ...overrides,
    };
  }

  static createCompanyAnalysisData(companyId: string, overrides: Partial<any> = {}) {
    return {
      companyId,
      cultureScore: faker.number.float({ min: 1, max: 10, fractionDigits: 1 }),
      retentionRate: faker.number.float({ min: 70, max: 95, fractionDigits: 1 }),
      hiringProcess: JSON.stringify(faker.helpers.arrayElements([
        'Application Review',
        'Phone Screening',
        'Technical Interview',
        'System Design Interview',
        'Cultural Fit Interview',
        'Final Interview',
        'Reference Check',
        'Offer',
      ], { min: 3, max: 6 })),
      techStack: JSON.stringify(faker.helpers.arrayElements([
        'React', 'Node.js', 'Python', 'Java', 'Go', 'Rust',
        'PostgreSQL', 'MongoDB', 'Redis', 'Elasticsearch',
        'AWS', 'Docker', 'Kubernetes', 'Terraform',
      ], { min: 4, max: 8 })),
      workLifeBalance: faker.number.float({ min: 1, max: 10, fractionDigits: 1 }),
      careerGrowth: faker.number.float({ min: 1, max: 10, fractionDigits: 1 }),
      salaryCompetitiveness: faker.number.float({ min: 1, max: 10, fractionDigits: 1 }),
      benefitsScore: faker.number.float({ min: 1, max: 10, fractionDigits: 1 }),
      analysisSource: 'ai_generated',
      confidenceScore: faker.number.float({ min: 0.5, max: 1, fractionDigits: 2 }),
      rawData: JSON.stringify({}),
      ...overrides,
    };
  }

  static createCVData(overrides: Partial<any> = {}) {
    return {
      candidateName: faker.person.fullName(),
      email: faker.internet.email(),
      phone: faker.phone.number(),
      title: faker.helpers.arrayElement([
        'Senior Java Developer',
        'React Frontend Developer',
        'Full Stack Developer',
        'DevOps Engineer',
        'Data Scientist'
      ]),
      summary: faker.lorem.paragraphs(2),
      skills: faker.helpers.arrayElements([
        'JavaScript', 'TypeScript', 'React', 'Node.js', 'Python', 'Java',
        'AWS', 'Docker', 'Kubernetes', 'PostgreSQL', 'MongoDB', 'Git',
      ], { min: 5, max: 10 }),
      experience: [
        {
          company: faker.company.name(),
          position: faker.person.jobTitle(),
          startDate: faker.date.past({ years: 5 }).toISOString().split('T')[0],
          endDate: faker.date.recent({ days: 365 }).toISOString().split('T')[0],
          description: faker.lorem.paragraph(),
        }
      ],
      education: [
        {
          institution: faker.helpers.arrayElement([
            'Sofia University',
            'Technical University of Sofia',
            'Plovdiv University',
            'New Bulgarian University'
          ]),
          degree: faker.helpers.arrayElement([
            'Bachelor in Computer Science',
            'Master of Software Engineering',
            'Bachelor of Information Technology',
            'Master of Computer Science',
          ]),
          startDate: faker.date.past({ years: 10 }).toISOString().split('T')[0],
          endDate: faker.date.past({ years: 6 }).toISOString().split('T')[0],
        }
      ],
      experienceLevel: faker.helpers.arrayElement(['Junior', 'Mid-level', 'Senior', 'Lead']),
      yearsOfExperience: faker.number.int({ min: 1, max: 15 }),
      filename: faker.system.fileName({ extensionCount: 1 }) + '.pdf',
      originalName: faker.person.fullName() + '_CV.pdf',
      mimeType: 'application/pdf',
      size: faker.number.int({ min: 100000, max: 2000000 }),
      path: `/uploads/cv/${faker.string.uuid()}.pdf`,
      ...overrides,
    };
  }

  static createApplicationData(overrides: Partial<any> = {}) {
    return {
      applicantName: faker.person.fullName(),
      applicantEmail: faker.internet.email(),
      coverLetter: faker.lorem.paragraphs(3),
      resumeUrl: faker.internet.url(),
      status: faker.helpers.arrayElement(['pending', 'applied', 'interview', 'approved', 'rejected', 'offered', 'accepted']),
      appliedAt: faker.date.recent({ days: 7 }),
      notes: faker.lorem.paragraph(),
      ...overrides,
    };
  }

  static createVacancyScoreData(vacancyId: string, overrides: Partial<any> = {}) {
    return {
      vacancyId,
      overallScore: faker.number.float({ min: 1, max: 10, fractionDigits: 1 }),
      salaryScore: faker.number.float({ min: 1, max: 10, fractionDigits: 1 }),
      locationScore: faker.number.float({ min: 1, max: 10, fractionDigits: 1 }),
      companyScore: faker.number.float({ min: 1, max: 10, fractionDigits: 1 }),
      roleScore: faker.number.float({ min: 1, max: 10, fractionDigits: 1 }),
      techStackScore: faker.number.float({ min: 1, max: 10, fractionDigits: 1 }),
      workLifeBalanceScore: faker.number.float({ min: 1, max: 10, fractionDigits: 1 }),
      careerGrowthScore: faker.number.float({ min: 1, max: 10, fractionDigits: 1 }),
      scoringCriteria: JSON.stringify({
        salaryRange: `${faker.number.int({ min: 80000, max: 120000 })}-${faker.number.int({ min: 120000, max: 180000 })}`,
        preferredLocation: faker.helpers.arrayElement(['Remote', 'San Francisco', 'New York']),
        requiredSkills: faker.helpers.arrayElements(['React', 'Node.js', 'TypeScript'], { min: 2, max: 3 }),
        experienceLevel: faker.helpers.arrayElement(['mid', 'senior']),
      }),
      scoredAt: new Date(),
      ...overrides,
    };
  }
}