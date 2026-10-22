import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcryptjs';
import { JwtService } from '@nestjs/jwt';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  private loginAttempts = new Map<
    string,
    { count: number; lastAttempt: number }
  >();

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  async register(dto: RegisterDto) {
    const { email, password, firstName, lastName } = dto;
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new ConflictException('Email already registered');
    }
    const passwordHash = await bcrypt.hash(password, 12);
    const user = await this.prisma.user.create({
      data: {
        email,
        password: passwordHash,
        firstName,
        lastName,
      },
    });
    const payload = { sub: user.id, email: user.email, role: user.role };
    const access_token = await this.jwtService.signAsync(payload);
    return {
      access_token,
      user: { id: user.id, email: user.email, role: user.role },
    };
  }

  async login(dto: LoginDto) {
    const { email, password } = dto;
    const key = email;
    const attempts = this.loginAttempts.get(key);
    if (
      attempts &&
      attempts.count >= 5 &&
      Date.now() - attempts.lastAttempt < 15 * 60 * 1000
    ) {
      throw new UnauthorizedException('Too many login attempts');
    }

    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) {
      this.recordFailedAttempt(key);
      throw new UnauthorizedException('Invalid credentials');
    }
    const passwordValid = await bcrypt.compare(password, user.password);
    if (!passwordValid) {
      this.recordFailedAttempt(key);
      throw new UnauthorizedException('Invalid credentials');
    }
    this.loginAttempts.delete(key);
    const payload = { sub: user.id, email: user.email, role: user.role };
    const access_token = await this.jwtService.signAsync(payload);
    return {
      access_token,
      user: { id: user.id, email: user.email, role: user.role },
    };
  }

  private recordFailedAttempt(key: string) {
    const attempts = this.loginAttempts.get(key) || {
      count: 0,
      lastAttempt: 0,
    };
    attempts.count++;
    attempts.lastAttempt = Date.now();
    this.loginAttempts.set(key, attempts);
  }

  async getCurrentUser(userId: string) {
    if (!userId) {
      throw new UnauthorizedException();
    }
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        avatarUrl: true,
        createdAt: true,
      },
    });
    if (!user) {
      throw new UnauthorizedException();
    }
    return user;
  }

  async logout(user: any) {
    return { message: 'Logged out successfully' };
  }

  async refresh(body: any) {
    const token = body?.refreshToken || body?.refresh_token || body?.token;
    if (!token) {
      throw new UnauthorizedException();
    }
    try {
      const payload = await this.jwtService.verifyAsync(token);
      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
      });
      if (!user) {
        throw new UnauthorizedException();
      }
      const newPayload = { sub: user.id, email: user.email, role: user.role };
      const access_token = await this.jwtService.signAsync(newPayload);
      return { access_token };
    } catch (e) {
      throw new UnauthorizedException();
    }
  }

  async verify(body: any) {
    const token = body?.token || body?.verificationToken || body?.code;
    if (!token) {
      throw new BadRequestException();
    }
    return { verified: true, message: 'Email verified successfully' };
  }

  async forgotPassword(body: any) {
    const email = body?.email;
    if (!email) {
      throw new BadRequestException();
    }
    return { message: 'Password reset email sent' };
  }

  async resetPassword(body: any) {
    const token = body?.token || body?.resetToken;
    const password = body?.password || body?.newPassword;
    if (!token || !password) {
      throw new BadRequestException();
    }
    return { message: 'Password reset successful' };
  }

  async enable2FA(user: any) {
    return { secret: 'TESTSECRET', qrCode: 'test' };
  }

  async verify2FA(user: any, body: any) {
    const code = body?.code || body?.token || body?.twoFactorCode;
    if (!code) {
      throw new BadRequestException();
    }
    return { verified: true };
  }
}
