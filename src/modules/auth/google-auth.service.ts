import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OAuth2Client } from 'google-auth-library';

export interface GoogleUserPayload {
  email: string;
  name: string;
  picture: string;
  sub: string; // Google user ID
}

@Injectable()
export class GoogleAuthService {
  private client: OAuth2Client;
  private clientId: string;
  private clientSecret: string;

  constructor(private readonly configService: ConfigService) {
    this.clientId = this.configService.get<string>('GOOGLE_CLIENT_ID', '');
    this.clientSecret = this.configService.get<string>('GOOGLE_CLIENT_SECRET', '');
    this.client = new OAuth2Client(this.clientId, this.clientSecret);
  }

  /**
   * Verify Google idToken and extract user payload.
   */
  async verifyIdToken(idToken: string): Promise<GoogleUserPayload> {
    try {
      const ticket = await this.client.verifyIdToken({
        idToken,
        audience: this.clientId,
      });

      const payload = ticket.getPayload();
      if (!payload || !payload.email) {
        throw new UnauthorizedException('Invalid Google token: missing email');
      }

      return {
        email: payload.email,
        name: payload.name || '',
        picture: payload.picture || '',
        sub: payload.sub,
      };
    } catch (error) {
      if (error instanceof UnauthorizedException) throw error;
      throw new UnauthorizedException('Invalid Google token');
    }
  }

  /**
   * Exchange authorization code for tokens, then extract user info.
   * Used when FE sends auth_code from @react-oauth/google.
   */
  async exchangeAuthCode(code: string): Promise<GoogleUserPayload> {
    try {
      const { tokens } = await this.client.getToken({
        code,
        redirect_uri: 'postmessage', // Required for @react-oauth/google popup flow
      });

      if (tokens.id_token) {
        // Verify the id_token from the exchange
        return this.verifyIdToken(tokens.id_token);
      }

      // Fallback: use access_token to fetch userinfo
      if (tokens.access_token) {
        return this.fetchUserInfo(tokens.access_token);
      }

      throw new UnauthorizedException('No token received from Google');
    } catch (error) {
      if (error instanceof UnauthorizedException) throw error;
      throw new UnauthorizedException('Failed to exchange authorization code');
    }
  }

  /**
   * Fetch user info using access_token from Google's userinfo endpoint.
   */
  async fetchUserInfo(accessToken: string): Promise<GoogleUserPayload> {
    try {
      const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!res.ok) {
        throw new UnauthorizedException('Failed to fetch Google user info');
      }

      const data = await res.json();
      if (!data.email) {
        throw new UnauthorizedException('Google user info missing email');
      }

      return {
        email: data.email,
        name: data.name || '',
        picture: data.picture || '',
        sub: data.sub,
      };
    } catch (error) {
      if (error instanceof UnauthorizedException) throw error;
      throw new UnauthorizedException('Failed to verify Google access token');
    }
  }
}
