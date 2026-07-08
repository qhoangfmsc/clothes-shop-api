import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { User } from '../user/user.entity';
import { GoogleAuthService } from './google-auth.service';

interface JwtPayload {
  sub: string;
  email: string;
  role: string;
}

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly jwtService: JwtService,
    private readonly googleAuthService: GoogleAuthService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Google login: accepts idToken, auth_code, or access_token
   * Auto-detects the type and verifies accordingly → upsert user → return JWT
   */
  async googleLogin(credential: string) {
    // Detect credential type:
    // - auth_code: typically short (e.g. "4/0A..."), contains "/" 
    // - idToken: JWT format (3 dot-separated parts)
    // - access_token: starts with "ya29."
    let googleUser;

    const isJwt = credential.split('.').length === 3;
    const isAuthCode = credential.startsWith('4/') || (credential.length < 200 && !isJwt);

    if (isAuthCode) {
      googleUser = await this.googleAuthService.exchangeAuthCode(credential);
    } else if (isJwt) {
      googleUser = await this.googleAuthService.verifyIdToken(credential);
    } else {
      googleUser = await this.googleAuthService.fetchUserInfo(credential);
    }

    // Upsert user by email
    let user = await this.userRepo.findOne({ where: { email: googleUser.email } });

    if (!user) {
      user = this.userRepo.create({
        email: googleUser.email,
        name: googleUser.name,
        image: googleUser.picture,
        provider: 'google',
        providerId: googleUser.sub,
        role: 'user',
        status: 'active',
      });
      user = await this.userRepo.save(user);
    } else {
      // Update Google info on each login
      user.name = googleUser.name || user.name;
      user.image = googleUser.picture || user.image;
      user.provider = 'google';
      user.providerId = googleUser.sub;
      user = await this.userRepo.save(user);
    }

    const tokens = this.generateTokens(user);

    return {
      ...tokens,
      user: this.sanitizeUser(user),
    };
  }

  /**
   * Get current user info by ID
   */
  async getMe(userId: string) {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException('User not found');
    }
    return { user: this.sanitizeUser(user) };
  }

  /**
   * Refresh access token using refresh token
   */
  async refreshToken(refreshToken: string) {
    try {
      const payload = this.jwtService.verify<JwtPayload>(refreshToken, {
        secret: this.configService.get<string>('JWT_SECRET'),
      });

      const user = await this.userRepo.findOne({ where: { id: payload.sub } });
      if (!user || user.status !== 'active') {
        throw new UnauthorizedException('User not found or disabled');
      }

      const accessToken = this.generateAccessToken(user);
      return { accessToken, user: this.sanitizeUser(user) };
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  private generateTokens(user: User) {
    const accessToken = this.generateAccessToken(user);
    const refreshToken = this.jwtService.sign(
      { sub: user.id, email: user.email, role: user.role },
      {
        secret: this.configService.get<string>('JWT_SECRET'),
        expiresIn: this.configService.get('JWT_REFRESH_EXPIRES_IN', '30d') as any,
      },
    );
    return { accessToken, refreshToken };
  }

  private generateAccessToken(user: User): string {
    return this.jwtService.sign(
      { sub: user.id, email: user.email, role: user.role },
      {
        secret: this.configService.get<string>('JWT_SECRET'),
        expiresIn: this.configService.get('JWT_EXPIRES_IN', '1d') as any,
      },
    );
  }

  private sanitizeUser(user: User) {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      image: user.image,
      role: user.role,
      status: user.status,
      createdAt: user.createdAt,
    };
  }
}
