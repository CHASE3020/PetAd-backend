import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EventsService } from '../events/events.service';
import { UpdateUserDto } from './dto/update-user.dto';
import { PublicProfileDto } from './dto/public-profile.dto';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventsService: EventsService,
  ) {}

  async getPublicProfile(id: string): Promise<PublicProfileDto> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        avatarUrl: true,
        role: true,
        trustScore: true,
        stellarPublicKey: true,
        status: true,
        deletedAt: true,
        createdAt: true,
      },
    });

    if (
      !user ||
      user.status === 'SUSPENDED' ||
      user.status === 'DELETED' ||
      user.deletedAt
    ) {
      throw new NotFoundException('User not found');
    }

    const first = user.firstName ? user.firstName.trim() : '';
    const last = user.lastName ? user.lastName.trim() : '';
    const lastInitial = last ? `${last.charAt(0).toUpperCase()}.` : '';
    const displayName =
      [first, lastInitial].filter(Boolean).join(' ') || 'Anonymous';

    const verifiedBadges: string[] = [];
    if (user.role === 'SHELTER') {
      verifiedBadges.push('VERIFIED_SHELTER');
    }
    if (user.stellarPublicKey) {
      verifiedBadges.push('STELLAR_VERIFIED');
    }
    if (user.trustScore && user.trustScore >= 80) {
      verifiedBadges.push('TOP_RATED');
    }

    const [completedAdoptions, completedCustodies] = await Promise.all([
      this.prisma.adoption.count({
        where: {
          status: 'COMPLETED',
          OR: [{ adopterId: id }, { ownerId: id }],
        },
      }),
      this.prisma.custody.count({
        where: {
          status: 'COMPLETED',
          holderId: id,
        },
      }),
    ]);
    const completedAgreements = completedAdoptions + completedCustodies;

    const ratingSummary = {
      average: user.trustScore ? Number((user.trustScore / 20).toFixed(1)) : 0,
      count: completedAgreements,
    };

    return {
      id: user.id,
      displayName,
      avatarUrl: user.avatarUrl ?? null,
      memberSince: user.createdAt.toISOString(),
      verifiedBadges,
      completedAgreements,
      ratingSummary,
    };
  }

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
