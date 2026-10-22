import {
  Controller,
  Post,
  Body,
  Get,
  UseGuards,
  Req,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import type { Request } from 'express';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Throttle({ default: { ttl: 60000, limit: 3 } }) // 3 requests per minute
  @Post('register')
  @ApiOperation({ summary: 'User Registration' })
  @ApiResponse({ status: 200, description: 'Registration successful' })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  async register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Throttle({ default: { ttl: 60000, limit: 5 } }) // 5 requests per minute
  @Post('login')
  @ApiOperation({ summary: 'User login' })
  @ApiResponse({ status: 200, description: 'Login successful' })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  async login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Get current user profile' })
  async me(
    @Req()
    req: {
      user: { sub?: string; userId?: string; id?: string; role?: string };
    },
  ) {
    const user = req.user;
    const userId = user?.sub || user?.userId || user?.id || 'unknown';
    return this.authService.getCurrentUser(userId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Logout' })
  async logout(
    @Req()
    req: {
      user: { sub?: string; userId?: string; id?: string; role?: string };
    },
  ) {
    return this.authService.logout(req.user);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@Body() body: { refreshToken?: string }) {
    return this.authService.refresh(body);
  }

  @Post('verify')
  @HttpCode(HttpStatus.OK)
  async verify(@Body() body: any) {
    return this.authService.verify(body);
  }

  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  async forgotPassword(@Body() body: any) {
    return this.authService.forgotPassword(body);
  }

  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  async resetPassword(@Body() body: any) {
    return this.authService.resetPassword(body);
  }

  @Post('password-reset/request')
  @HttpCode(HttpStatus.OK)
  async requestPasswordReset(@Body() body: any) {
    return this.authService.forgotPassword(body);
  }

  @Post('password-reset/confirm')
  @HttpCode(HttpStatus.OK)
  async confirmPasswordReset(@Body() body: any) {
    return this.authService.resetPassword(body);
  }

  @UseGuards(JwtAuthGuard)
  @Post('2fa/enable')
  @HttpCode(HttpStatus.OK)
  async enable2FA(
    @Req()
    req: {
      user: { sub?: string; userId?: string; id?: string; role?: string };
    },
  ) {
    return this.authService.enable2FA(req.user);
  }

  @UseGuards(JwtAuthGuard)
  @Post('2fa/verify')
  @HttpCode(HttpStatus.OK)
  async verify2FA(
    @Req()
    req: {
      user: { sub?: string; userId?: string; id?: string; role?: string };
    },
    @Body() body: { code?: string },
  ) {
    return this.authService.verify2FA(req.user, body);
  }

  @Post('2fa/verify')
  @HttpCode(HttpStatus.OK)
  async verify2FAPublic(@Body() body: any) {
    return this.authService.verify2FA(null, body);
  }
}
