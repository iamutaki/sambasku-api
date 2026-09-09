import type { Context } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { env } from '@/shared/config/env';
import { UnauthorizedError } from '@/shared/errors/app-error';
import type { AppVariables } from '@/shared/types';
import type { RegisterUserUseCase } from '../../application/use-cases/register-user.use-case';
import type { LoginUserUseCase } from '../../application/use-cases/login-user.use-case';
import type { RefreshTokenUseCase } from '../../application/use-cases/refresh-token.use-case';
import type { LogoutUserUseCase } from '../../application/use-cases/logout-user.use-case';
import type { LogoutAllDevicesUseCase } from '../../application/use-cases/logout-all-devices.use-case';
import type { ForgotPasswordUseCase } from '../../application/use-cases/forgot-password.use-case';
import type { ResetPasswordUseCase } from '../../application/use-cases/reset-password.use-case';
import type { RegisterBody } from './validators/register.validator';
import type { LoginBody } from './validators/login.validator';
import type { ForgotPasswordBody } from './validators/forgot-password.validator';
import type { ResetPasswordBody } from './validators/reset-password.validator';

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
    },
  ) {}

  async register(c: Context, body: RegisterBody) {
    const user = await this.deps.register.execute(body);
    return c.json(
      {
        success: true as const,
        data: { user_id: user.id, username: user.username, email: user.email },
      },
      201,
    );
  }

  async login(c: Context, body: LoginBody) {
    const result = await this.deps.login.execute(body, {
      deviceInfo: c.req.header('User-Agent'),
      ipAddress: c.req.header('x-forwarded-for') ?? null,
    });
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

  async refresh(c: Context) {
    const token = getCookie(c, REFRESH_TOKEN_COOKIE);
    if (!token) throw new UnauthorizedError('UNAUTHORIZED', 'Refresh token tidak ada');
    const result = await this.deps.refresh.execute(token);
    this.setRefreshCookie(c, result.refreshToken);
    return c.json({
      success: true as const,
      data: { access_token: result.accessToken, expires_in: result.expiresIn },
    });
  }

  async logout(c: Context) {
    const token = getCookie(c, REFRESH_TOKEN_COOKIE);
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
    // Response SAMA persis baik email terdaftar atau tidak — cegah enumeration
    return c.json({
      success: true as const,
      data: { message: 'Jika email terdaftar, link reset telah dikirim' },
    });
  }

  async reset(c: Context, body: ResetPasswordBody) {
    await this.deps.reset.execute({ token: body.token, newPassword: body.new_password });
    return c.json({ success: true as const, data: { message: 'Password berhasil direset' } });
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
