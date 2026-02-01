import { prisma } from '../lib/prisma.js';
import { verifyPassword } from '../utils/password.js';
import { signAccessToken, signRefreshToken, verifyRefreshToken, hashToken } from './token.service.js';
import { AppError } from '../middleware/error-handler.js';
import { verifySync } from 'otplib';

const LOCK_DURATION_MS = 15 * 60 * 1000; // 15 min
const MAX_FAILED_ATTEMPTS = 5;

export async function login(
  email: string,
  password: string,
  totpCode?: string,
  userAgent?: string,
  ipAddress?: string,
  correlationId?: string,
) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.isActive) {
    throw new AppError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');
  }

  // Check lock
  if (user.lockedUntil && user.lockedUntil > new Date()) {
    throw new AppError(423, 'ACCOUNT_LOCKED', 'Account locked due to too many failed attempts');
  }

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    const attempts = user.failedAttempts + 1;
    const update: Record<string, unknown> = { failedAttempts: attempts };
    if (attempts >= MAX_FAILED_ATTEMPTS) {
      update.lockedUntil = new Date(Date.now() + LOCK_DURATION_MS);
    }
    await prisma.user.update({ where: { id: user.id }, data: update });

    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: 'auth.login_failed',
        ipAddress,
        userAgent,
        correlationId,
        details: { reason: 'invalid_password', attempts },
      },
    });

    throw new AppError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');
  }

  // Check 2FA if enabled
  if (user.twoFactorEnabled && user.twoFactorSecret) {
    if (!totpCode) {
      // Password is valid but 2FA code is required — return special response
      throw new AppError(403, 'TOTP_REQUIRED', '2FA code required');
    }
    const isValidTotp = verifySync({ token: totpCode, secret: user.twoFactorSecret });
    if (!isValidTotp) {
      await prisma.auditLog.create({
        data: {
          userId: user.id,
          action: 'auth.login_failed',
          ipAddress,
          userAgent,
          correlationId,
          details: { reason: 'invalid_totp' },
        },
      });
      throw new AppError(401, 'INVALID_TOTP', 'Invalid 2FA code');
    }
  }

  // Reset failed attempts, update last login
  await prisma.user.update({
    where: { id: user.id },
    data: { failedAttempts: 0, lockedUntil: null, lastLoginAt: new Date() },
  });

  const accessToken = signAccessToken({ sub: user.id, email: user.email, role: user.role });
  const refreshToken = signRefreshToken({ sub: user.id });

  // Store session with hashed refresh token
  await prisma.session.create({
    data: {
      userId: user.id,
      refreshTokenHash: hashToken(refreshToken),
      userAgent,
      ipAddress,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
  });

  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: 'auth.login',
      ipAddress,
      userAgent,
      correlationId,
    },
  });

  return {
    accessToken,
    refreshToken,
    user: { id: user.id, email: user.email, name: user.name, role: user.role },
  };
}

export async function logout(refreshToken: string, correlationId?: string) {
  const hash = hashToken(refreshToken);
  const session = await prisma.session.findUnique({ where: { refreshTokenHash: hash } });
  if (session) {
    await prisma.session.delete({ where: { id: session.id } });
    await prisma.auditLog.create({
      data: {
        userId: session.userId,
        action: 'auth.logout',
        correlationId,
      },
    });
  }
}

export async function refresh(refreshToken: string) {
  let payload: { sub: string };
  try {
    payload = verifyRefreshToken(refreshToken);
  } catch {
    throw new AppError(401, 'INVALID_TOKEN', 'Invalid or expired refresh token');
  }

  const hash = hashToken(refreshToken);
  const session = await prisma.session.findUnique({ where: { refreshTokenHash: hash } });
  if (!session || session.expiresAt < new Date()) {
    throw new AppError(401, 'INVALID_TOKEN', 'Session expired or not found');
  }

  const user = await prisma.user.findUnique({ where: { id: payload.sub } });
  if (!user || !user.isActive) {
    throw new AppError(401, 'INVALID_TOKEN', 'User not found or inactive');
  }

  // Rotate refresh token
  const newRefreshToken = signRefreshToken({ sub: user.id });
  await prisma.session.update({
    where: { id: session.id },
    data: {
      refreshTokenHash: hashToken(newRefreshToken),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
  });

  const accessToken = signAccessToken({ sub: user.id, email: user.email, role: user.role });

  return {
    accessToken,
    refreshToken: newRefreshToken,
    user: { id: user.id, email: user.email, name: user.name, role: user.role },
  };
}

export async function me(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, name: true, role: true, lastLoginAt: true, createdAt: true },
  });
  if (!user) {
    throw new AppError(404, 'NOT_FOUND', 'User not found');
  }
  return user;
}
