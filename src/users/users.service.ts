import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EventsService } from '../events/events.service';
import { UpdateUserDto } from './dto/update-user.dto';
import { ListUsersDto } from './dto/list-users.dto';
import {
  PaginatedResponseDto,
  PaginationMetaDto,
} from '../common/dto/paginated-response.dto';
import { Prisma } from '@prisma/client';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventsService: EventsService,
  ) {}

  async getProfile(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
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

    if (!user) throw new NotFoundException('User not found');

    return user;
  }

  async updateProfile(id: string, dto: UpdateUserDto) {
    return this.prisma.user.update({
      where: { id },
      data: dto,
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
  }

  async deleteProfile(id: string) {
    await this.prisma.user.delete({ where: { id } });
    return { message: 'User deleted successfully' };
  }

  async updateAvatar(id: string, avatarUrl: string) {
    return this.prisma.user.update({
      where: { id },
      data: { avatarUrl },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        avatarUrl: true,
      },
    });
  }

  async listUsers(query: ListUsersDto) {
    const { page = 1, pageSize = 20, q, role, status, sort } = query;

    const limit = Math.min(pageSize || 20, 100);
    const skip = (page - 1) * limit;

    const where: Prisma.UserWhereInput = {
      ...(role && { role: role as any }),
    };

    if (q) {
      where.OR = [
        { email: { contains: q, mode: 'insensitive' } },
        { firstName: { contains: q, mode: 'insensitive' } },
        { lastName: { contains: q, mode: 'insensitive' } },
      ];
    }

    // Handle status if it exists as a field
    if (status) {
      (where as any).status = status;
    }

    let orderBy: Prisma.UserOrderByWithRelationInput = { createdAt: 'desc' };
    if (sort) {
      if (sort.includes(':')) {
        const [field, direction] = sort.split(':');
        orderBy = { [field]: direction === 'asc' ? 'asc' : 'desc' } as any;
      } else {
        orderBy = { [sort]: 'asc' } as any;
      }
    }

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip,
        take: limit,
        orderBy,
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          role: true,
          trustScore: true,
          stellarPublicKey: true,
          avatarUrl: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      this.prisma.user.count({ where }),
    ]);

    const meta = new PaginationMetaDto(page, limit, total);
    return new PaginatedResponseDto(users, meta);
  }

  async updateTrustScore(userId: string, delta: number) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, trustScore: true },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const newScore = Math.max(0, Math.min(100, user.trustScore + delta));

    const updatedUser = await this.prisma.user.update({
      where: { id: userId },
      data: { trustScore: newScore },
      select: {
        id: true,
        trustScore: true,
      },
    });

    await this.eventsService.logEvent({
      entityType: 'USER',
      entityId: userId,
      eventType: 'TRUST_SCORE_UPDATED',
      payload: {
        previousScore: user.trustScore,
        newScore,
        delta,
      },
    });

    return updatedUser;
  }
}
