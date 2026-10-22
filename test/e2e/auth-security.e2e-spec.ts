import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';

describe('Auth Security E2E', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwtService: JwtService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
    prisma = app.get(PrismaService);
    jwtService = app.get(JwtService);
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await app.close();
  });

  beforeEach(async () => {
    await prisma.user.deleteMany({});
  });

  describe('JWT Security', () => {
    it('should reject expired token', async () => {
      const user = await prisma.user.create({
        data: {
          email: 'expired@example.com',
          password: 'hashed',
          firstName: 'Expired',
          lastName: 'User',
        },
      });
      const token = await jwtService.signAsync(
        { sub: user.id, email: user.email, role: user.role },
        { expiresIn: -10 },
      );
      const res = await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(401);
    });

    it('should reject tampered token', async () => {
      const res = await request(app.getHttpServer())
        .get('/auth/me')
        .set(
          'Authorization',
          'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U',
        );
      expect(res.status).toBe(401);
    });

    it('should reject token with alg:none', async () => {
      const token =
        'eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.eyJzdWIiOiIxMjM0NTY3ODkwIiwicm9sZSI6IkFETUlOIn0.';
      const res = await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(401);
    });
  });

  describe('Deleted user token', () => {
    it('should reject token for deleted user', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          email: 'deleted@example.com',
          password: 'StrongPass123',
          firstName: 'Deleted',
          lastName: 'User',
        });
      const token = res.body.access_token;
      const user = await prisma.user.findUnique({
        where: { email: 'deleted@example.com' },
      });
      if (!user) {
        fail('User not found');
      }
      await prisma.user.delete({ where: { id: user.id } });

      const meRes = await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', `Bearer ${token}`);
      expect(meRes.status).toBe(401);
    });
  });
});
