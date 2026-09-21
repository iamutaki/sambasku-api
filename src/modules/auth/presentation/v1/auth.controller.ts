import type { Context } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { env } from '@/shared/config/env';
import { UnauthorizedError } from '@/shared/errors/app-error';
import type { AppVariables } from '@/shared/types';
import type { RegisterUserUseCase } from '../../application/use-cases/register-user.use-case';
import type { LoginUserUseCase, LoginResult } from '../../application/use-cases/login-user.use-case';
import type { RefreshTokenUseCase } from '../../application/use-cases/refresh-token.use-case';
import type { LogoutUserUseCase } from '../../application/use-cases/logout-user.use-case';
import type { LogoutAllDevicesUseCase } from '../../application/use-cases/logout-all-devices.use-case';
import type { ForgotPasswordUseCase } from '../../application/use-cases/forgot-password.use-case';
import type { ResetPasswordUseCase } from '../../application/use-cases/reset-password.use-case';
import type { ChangePasswordUseCase } from '../../application/use-cases/change-password.use-case';
import type { VerifyEmailUseCase } from '../../application/use-cases/verify-email.use-case';
import type { ResendOtpUseCase } from '../../application/use-cases/resend-otp.use-case';
import type { LoginWithGoogleUseCase } from '../../application/use-cases/login-with-google.use-case';
import type { LoginWithFacebookUseCase } from '../../application/use-cases/login-with-facebook.use-case';
import type { RegisterBody } from './validators/register.validator';
import type { LoginBody } from './validators/login.validator';
import type { GoogleLoginBody } from './validators/google-login.validator';
import type { FacebookLoginBody } from './validators/facebook-login.validator';
import type { ForgotPasswordBody } from './validators/forgot-password.validator';
import type { ResetPasswordBody } from './validators/reset-password.validator';
import type { ChangePasswordBody } from './validators/change-password.validator';
import type { VerifyEmailBody, ResendOtpBody } from './validators/verify-email.validator';

const REFRESH_TOKEN_COOKIE = 'refresh_token';
const COOKIE_PATH = '/api/v1/auth'; // cookie hanya dikirim ke endpoint auth

export class AuthController {
  constructor(
    private readonly deps: {
      register: RegisterUserUseCase;
      login: LoginUserUseCase;
      refresh: RefreshTokenUseCase;
      logout: LogoutUserUseCase;
      logoutAll: LogoutAllDevicesUseCase;
      forgot: ForgotPasswordUseCase;
      reset: ResetPasswordUseCase;
      changePassword: ChangePasswordUseCase;
      verifyEmail: VerifyEmailUseCase;
      resendOtp: ResendOtpUseCase;
      google: LoginWithGoogleUseCase;
      facebook: LoginWithFacebookUseCase;
    },
  ) {}

  async register(c: Context, body: RegisterBody) {
    const requestId = (c as Context<{ Variables: AppVariables }>).get('requestId');
    const user = await this.deps.register.execute(
      {
        name: body.name,
        email: body.email,
        phone: body.phone,
        password: body.password,
      },
      requestId,
    );
    return c.json(
      {
        success: true as const,
        data: {
          user_id: user.id,
          username: user.username,
          email: user.email,
          phone: user.phone,
          verification_required: true as const,
        },
      },
      201,
    );
  }

  async login(c: Context, body: LoginBody) {
    const result = await this.deps.login.execute(body, this.loginMeta(c));
    return this.loginJson(c, body.client_type, result);
  }

  async google(c: Context, body: GoogleLoginBody) {
    const requestId = (c as Context<{ Variables: AppVariables }>).get('requestId');
    const result = await this.deps.google.execute(
      { idToken: body.id_token },
      this.loginMeta(c),
      requestId,
    );
    return this.loginJson(c, body.client_type, result);
  }

  async facebook(c: Context, body: FacebookLoginBody) {
    const requestId = (c as Context<{ Variables: AppVariables }>).get('requestId');
    const result = await this.deps.facebook.execute(
      { accessToken: body.access_token },
      this.loginMeta(c),
      requestId,
    );
    return this.loginJson(c, body.client_type, result);
  }

  async verifyEmail(c: Context, body: VerifyEmailBody) {
    const result = await this.deps.verifyEmail.execute(
      { email: body.email, code: body.code },
      this.loginMeta(c),
    );
    return this.loginJson(c, body.client_type, result);
  }

  async resendOtp(c: Context, body: ResendOtpBody) {
    await this.deps.resendOtp.execute(body.email);
    return c.json({
      success: true as const,
      data: {
        message: 'Jika email terdaftar dan belum diverifikasi, kode baru sudah dikirim.',
      },
    });
  }

  async refresh(c: Context, body: { refresh_token?: string } = {}) {
    const token = body.refresh_token ?? getCookie(c, REFRESH_TOKEN_COOKIE);
    if (!token) throw new UnauthorizedError('UNAUTHORIZED', 'Refresh token tidak ada');
    const result = await this.deps.refresh.execute(token);

    if (body.refresh_token !== undefined) {
      // Klien mobile: kembalikan token rotasi via body juga
      return c.json({
        success: true as const,
        data: {
          access_token: result.accessToken,
          expires_in: result.expiresIn,
          refresh_token: result.refreshToken,
        },
      });
    }

    this.setRefreshCookie(c, result.refreshToken);
    return c.json({
      success: true as const,
      data: { access_token: result.accessToken, expires_in: result.expiresIn },
    });
  }

  async logout(c: Context, body: { refresh_token?: string } = {}) {
    const token = body.refresh_token ?? getCookie(c, REFRESH_TOKEN_COOKIE);
    if (token) await this.deps.logout.execute(token);
    deleteCookie(c, REFRESH_TOKEN_COOKIE, { path: COOKIE_PATH });
    return c.json({ success: true as const, data: null });
  }

  async logoutAll(c: Context) {
    const user = (c as Context<{ Variables: AppVariables }>).get('user');
    if (!user) throw new UnauthorizedError('UNAUTHORIZED', 'Token tidak disertakan');
    await this.deps.logoutAll.execute(user.user_id);
    deleteCookie(c, REFRESH_TOKEN_COOKIE, { path: COOKIE_PATH });
    return c.json({ success: true as const, data: null });
  }

  async forgot(c: Context, body: ForgotPasswordBody) {
    await this.deps.forgot.execute(body);
    // Response SAMA persis baik email terdaftar atau tidak - cegah enumeration
    return c.json({
      success: true as const,
      data: { message: 'Jika email terdaftar, kode reset telah dikirim' },
    });
  }

  async reset(c: Context, body: ResetPasswordBody) {
    const requestId = (c as Context<{ Variables: AppVariables }>).get('requestId');
    await this.deps.reset.execute(
      {
        token: body.token,
        email: body.email,
        code: body.code,
        newPassword: body.new_password,
      },
      requestId,
    );
    return c.json({ success: true as const, data: { message: 'Password berhasil direset' } });
  }

  async changePassword(c: Context, body: ChangePasswordBody) {
    // user_id SELALU dari token (bukan body) - user hanya bisa mengganti
    // password sendiri. Semua session di-revoke use case; client wajib
    // clear sesi lokal + redirect ke login.
    const typed = c as Context<{ Variables: AppVariables }>;
    const user = typed.get('user');
    if (!user) throw new UnauthorizedError('UNAUTHORIZED', 'Token tidak disertakan');
    const requestId = typed.get('requestId');

    await this.deps.changePassword.execute(
      { oldPassword: body.old_password, newPassword: body.new_password },
      user.user_id,
      requestId,
    );
    return c.json({
      success: true as const,
      data: { message: 'Password berhasil diubah. Silakan login kembali.' },
    });
  }

  private loginMeta(c: Context) {
    return {
      deviceInfo: c.req.header('User-Agent'),
      ipAddress: c.req.header('x-forwarded-for') ?? c.req.header('cf-connecting-ip') ?? null,
    };
  }

  // Dua kanal refresh token: web via httpOnly cookie (XSS-safe),
  // mobile via response body (client simpan di Keychain/Keystore)
  private loginJson(c: Context, clientType: 'web' | 'mobile', result: LoginResult) {
    if (clientType === 'mobile') {
      return c.json({
        success: true as const,
        data: {
          access_token: result.accessToken,
          expires_in: result.expiresIn,
          refresh_token: result.refreshToken,
          user: result.user,
        },
      });
    }

    this.setRefreshCookie(c, result.refreshToken);
    return c.json({
      success: true as const,
      data: {
        access_token: result.accessToken,
        expires_in: result.expiresIn,
        user: result.user,
      },
    });
  }

  private setRefreshCookie(c: Context, token: string) {
    setCookie(c, REFRESH_TOKEN_COOKIE, token, {
      httpOnly: true,
      secure: env.NODE_ENV === 'production',
      sameSite: 'Strict',
      path: COOKIE_PATH,
      maxAge: env.JWT_REFRESH_TOKEN_TTL,
    });
  }
}
