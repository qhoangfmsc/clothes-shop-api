import { throwAppError } from '@common/exceptions/app.exception';
import { EUserErrorCode } from '@common/exceptions/error-codes';
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UpdateUserDto } from './dtos/user.dto';
import { User } from './user.entity';

@Injectable()
export class UserService {
  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

  async findAll(query?: { role?: string; status?: string; page?: number; limit?: number }) {
    const qb = this.userRepo.createQueryBuilder('u');

    if (query?.role) {
      qb.andWhere('u.role = :role', { role: query.role });
    }

    if (query?.status) {
      qb.andWhere('u.status = :status', { status: query.status });
    }

    qb.orderBy('u.created_at', 'DESC');

    const page = query?.page || 1;
    const limit = query?.limit || 25;
    qb.skip((page - 1) * limit).take(limit);

    const [data, total] = await qb.getManyAndCount();

    // Sanitize user output (không trả về password)
    const sanitized = data.map((user) => ({
      id: user.id,
      email: user.email,
      name: user.name,
      image: user.image,
      provider: user.provider,
      role: user.role,
      permissions: user.permissions,
      status: user.status,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    }));

    return { data: sanitized, total, page, limit };
  }

  async findOne(id: string) {
    const user = await this.userRepo.findOne({ where: { id } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    return {
      data: {
        id: user.id,
        email: user.email,
        name: user.name,
        image: user.image,
        provider: user.provider,
        role: user.role,
        permissions: user.permissions,
        status: user.status,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      },
    };
  }

  async update(id: string, dto: UpdateUserDto, currentUserId?: string) {
    const user = await this.userRepo.findOne({ where: { id } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Không cho admin tự sửa role hoặc disable chính mình
    if (currentUserId && id === currentUserId) {
      if (dto.role !== undefined || dto.status !== undefined) {
        throwAppError(EUserErrorCode.USER_CANNOT_MODIFY_SELF);
      }
    }

    if (dto.role !== undefined) user.role = dto.role;
    if (dto.status !== undefined) user.status = dto.status;
    if (dto.permissions !== undefined) user.permissions = dto.permissions;

    const saved = await this.userRepo.save(user);

    return {
      data: {
        id: saved.id,
        email: saved.email,
        name: saved.name,
        image: saved.image,
        provider: saved.provider,
        role: saved.role,
        permissions: saved.permissions,
        status: saved.status,
        createdAt: saved.createdAt,
        updatedAt: saved.updatedAt,
      },
    };
  }
}
