import {
  Controller,
  Get,
  Patch,
  Delete,
  Post,
  Param,
  Body,
  Query,
  UseGuards,
  Req,
  Res,
  UnauthorizedException,
  UploadedFile,
  UseInterceptors,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Public } from '../auth/decorators/public.decorator';
import { UsersService } from './users.service';
import { UpdateUserDto } from './dto/update-user.dto';
import { PublicProfileDto } from './dto/public-profile.dto';
import { DataExportService } from './data-export/data-export.service';
import {
  DataExportInitiatedDto,
  DataExportStatusResponseDto,
} from './data-export/dto/data-export-response.dto';
import { CloudinaryService } from '../cloudinary/cloudinary.service';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request, Response } from 'express';
import { Throttle } from '@nestjs/throttler';

interface DownloadRequest extends Request {
  user?: {
    userId?: string;
    sub?: string;
    role?: string;
  };
}

interface AuthRequest extends Request {
  user: {
    userId: string;
    sub?: string;
    role: string;
  };
}

@ApiTags('Users')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Controller('users')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly cloudinary: CloudinaryService,
    private readonly dataExportService: DataExportService,
  ) {}

  private checkOwnership(req: AuthRequest, id: string) {
    const currentUserId = req.user.userId || req.user.sub;
    if (currentUserId !== id && req.user.role !== 'ADMIN') {
      throw new UnauthorizedException();
    }
  }

  @Throttle({ default: { ttl: 60000, limit: 5 } })
  @Post('me/data-export')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Request personal data export (async)' })
  @ApiResponse({
    status: 202,
    description: 'Export request accepted and enqueued',
    type: DataExportInitiatedDto,
  })
  @ApiResponse({
    status: 409,
    description: 'Active export request already in progress',
  })
  async requestDataExport(
    @Req() req: AuthRequest,
  ): Promise<DataExportInitiatedDto> {
    const userId = req.user.userId || req.user.sub;
    if (!userId) {
      throw new UnauthorizedException('User not authenticated');
    }
    return this.dataExportService.requestDataExport(userId);
  }

  @Throttle({ default: { ttl: 60000, limit: 10 } })
  @Get('me/data-export/:id')
  @ApiOperation({
    summary: 'Get personal data export status and signed download URL',
  })
  @ApiResponse({
    status: 200,
    description: 'Export status retrieved',
    type: DataExportStatusResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Export request not found' })
  async getDataExportStatus(
    @Param('id') id: string,
    @Req() req: AuthRequest,
  ): Promise<DataExportStatusResponseDto> {
    const userId = req.user.userId || req.user.sub;
    if (!userId) {
      throw new UnauthorizedException('User not authenticated');
    }
    return this.dataExportService.getDataExportStatus(id, userId);
  }

  @Public()
  @Throttle({ default: { ttl: 60000, limit: 10 } })
  @Get('me/data-export/:id/download')
  @ApiOperation({
    summary:
      'Download personal data export ZIP archive via short-lived signed link',
  })
  @ApiResponse({ status: 200, description: 'ZIP archive download stream' })
  @ApiResponse({ status: 410, description: 'Link expired or file purged' })
  @ApiResponse({ status: 404, description: 'Export file not found' })
  async downloadDataExport(
    @Param('id') id: string,
    @Query('expires') expires: string,
    @Query('sig') sig: string,
    @Req() req: DownloadRequest,
    @Res() res: Response,
  ) {
    const authUserId = req.user?.userId || req.user?.sub;
    const { stream, fileSize, fileName } =
      await this.dataExportService.getExportFileForDownload(
        id,
        expires,
        sig,
        authUserId,
      );

    res.set({
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${fileName}"`,
      'Content-Length': fileSize.toString(),
    });

    stream.pipe(res);
  }

  @Public()
  @Throttle({ default: { ttl: 60000, limit: 20 } })
  @Get(':id/public')
  @ApiOperation({ summary: 'Get public user profile' })
  @ApiResponse({
    status: 200,
    description: 'Public profile retrieved',
    type: PublicProfileDto,
  })
  @ApiResponse({
    status: 404,
    description: 'User not found or suspended/deleted',
  })
  async getPublicProfile(@Param('id') id: string): Promise<PublicProfileDto> {
    return this.usersService.getPublicProfile(id);
  }

  @Throttle({ default: { ttl: 60000, limit: 5 } })
  @Get(':id')
  @ApiOperation({ summary: 'Get user profile' })
  async getProfile(@Param('id') id: string, @Req() req: AuthRequest) {
    this.checkOwnership(req, id);
    return this.usersService.getProfile(id);
  }

  @Throttle({ default: { ttl: 60000, limit: 5 } })
  @Patch(':id')
  async updateProfile(
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
    @Req() req: AuthRequest,
  ) {
    this.checkOwnership(req, id);
    return this.usersService.updateProfile(id, dto);
  }

  @Throttle({ default: { ttl: 60000, limit: 5 } })
  @Post(':id/avatar')
  @UseInterceptors(
    FileInterceptor('avatar', {
      limits: { fileSize: 2 * 1024 * 1024 }, // 2MB
      fileFilter: (req, file, cb) => {
        if (!file.mimetype.match(/\/(jpg|jpeg|png)$/)) {
          cb(new BadRequestException('Only JPG/PNG images allowed'), false);
        } else {
          cb(null, true);
        }
      },
    }),
  )
  async uploadAvatar(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @Req() req: AuthRequest,
  ) {
    this.checkOwnership(req, id);

    if (!file) {
      throw new BadRequestException('Avatar file is required');
    }
    const upload = await this.cloudinary.uploadImage(file.buffer, 'users');

    return this.usersService.updateAvatar(id, upload.secure_url);
  }

  @Throttle({ default: { ttl: 60000, limit: 5 } })
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  async deleteProfile(@Param('id') id: string, @Req() req: AuthRequest) {
    this.checkOwnership(req, id);
    return this.usersService.deleteProfile(id);
  }
}
