import { Router, Request, Response, NextFunction } from 'express';
import { authenticate, requireRole } from '../middleware/auth.js';
import { prisma } from '../lib/prisma.js';
import bcrypt from 'bcrypt';
import { generateSecret, generateURI, verifySync } from 'otplib';

const router = Router();

// ══════════════════════════════════════
// USER MANAGEMENT (Admin only)
// ══════════════════════════════════════

// GET /security/users - List all users
router.get('/users', authenticate, requireRole('ADMIN'), async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const users = await prisma.user.findMany({
      select: { id: true, email: true, name: true, role: true, isActive: true, twoFactorEnabled: true, lastLoginAt: true, failedAttempts: true, lockedUntil: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    });
    res.json(users);
  } catch (err) {
    next(err);
  }
});

// POST /security/users - Create user
router.post('/users', authenticate, requireRole('ADMIN'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, name, password, role } = req.body;
    if (!email || !name || !password) {
      return res.status(400).json({ error: { message: 'email, name and password are required' } });
    }

    const exists = await prisma.user.findUnique({ where: { email } });
    if (exists) return res.status(409).json({ error: { message: 'Email already exists' } });

    // Password policy: min 8 chars, 1 upper, 1 lower, 1 digit
    if (password.length < 8 || !/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password)) {
      return res.status(400).json({ error: { message: 'Senha deve ter 8+ caracteres com maiúscula, minúscula e número' } });
    }

    const hash = await bcrypt.hash(password, 12);
    const user = await prisma.user.create({
      data: { email, name, passwordHash: hash, role: role || 'CLIENT' },
      select: { id: true, email: true, name: true, role: true, isActive: true, createdAt: true },
    });

    await prisma.auditLog.create({
      data: {
        userId: req.user!.sub,
        action: 'user.create',
        resource: 'user',
        resourceId: user.id,
        details: { email, role: role || 'CLIENT' } as any,
        ipAddress: req.ip,
        correlationId: req.correlationId,
      },
    });

    res.status(201).json(user);
  } catch (err) {
    next(err);
  }
});

// PUT /security/users/:id - Update user
router.put('/users/:id', authenticate, requireRole('ADMIN'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name, role, isActive } = req.body;
    const data: Record<string, unknown> = {};
    if (name) data.name = name;
    if (role) data.role = role;
    if (typeof isActive === 'boolean') data.isActive = isActive;

    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: data as any,
      select: { id: true, email: true, name: true, role: true, isActive: true },
    });

    await prisma.auditLog.create({
      data: {
        userId: req.user!.sub,
        action: 'user.update',
        resource: 'user',
        resourceId: user.id,
        details: data as any,
        ipAddress: req.ip,
        correlationId: req.correlationId,
      },
    });

    res.json(user);
  } catch (err) {
    next(err);
  }
});

// POST /security/users/:id/unlock - Unlock user account
router.post('/users/:id/unlock', authenticate, requireRole('ADMIN'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    await prisma.user.update({
      where: { id: req.params.id },
      data: { failedAttempts: 0, lockedUntil: null },
    });
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// POST /security/users/:id/reset-password - Reset password (admin)
router.post('/users/:id/reset-password', authenticate, requireRole('ADMIN'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { newPassword } = req.body;
    if (!newPassword || newPassword.length < 8) {
      return res.status(400).json({ error: { message: 'Senha deve ter 8+ caracteres' } });
    }

    const hash = await bcrypt.hash(newPassword, 12);
    await prisma.user.update({
      where: { id: req.params.id },
      data: { passwordHash: hash, failedAttempts: 0, lockedUntil: null },
    });

    await prisma.auditLog.create({
      data: {
        userId: req.user!.sub,
        action: 'user.password_reset',
        resource: 'user',
        resourceId: req.params.id,
        ipAddress: req.ip,
        correlationId: req.correlationId,
      },
    });

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// ══════════════════════════════════════
// 2FA TOTP
// ══════════════════════════════════════

// POST /security/2fa/setup - Generate 2FA secret
router.post('/2fa/setup', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const secret = generateSecret();
    const otpauth = generateURI({ issuer: 'Clawdbot Panel', label: req.user!.email, secret });

    // Store secret temporarily (not enabled yet)
    await prisma.user.update({
      where: { id: req.user!.sub },
      data: { twoFactorSecret: secret },
    });

    res.json({ secret, otpauth, message: 'Escaneie o QR Code no app autenticador e confirme com o código' });
  } catch (err) {
    next(err);
  }
});

// POST /security/2fa/verify - Verify and enable 2FA
router.post('/2fa/verify', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { code } = req.body;
    if (!code) return res.status(400).json({ error: { message: 'code is required' } });

    const user = await prisma.user.findUnique({ where: { id: req.user!.sub } });
    if (!user?.twoFactorSecret) return res.status(400).json({ error: { message: 'Setup 2FA first' } });

    const isValid = verifySync({ token: code, secret: user.twoFactorSecret });
    if (!isValid) return res.status(400).json({ error: { message: 'Código inválido' } });

    await prisma.user.update({
      where: { id: req.user!.sub },
      data: { twoFactorEnabled: true },
    });

    await prisma.auditLog.create({
      data: {
        userId: req.user!.sub,
        action: 'security.2fa_enabled',
        resource: 'user',
        resourceId: req.user!.sub,
        ipAddress: req.ip,
        correlationId: req.correlationId,
      },
    });

    res.json({ success: true, message: '2FA habilitado com sucesso' });
  } catch (err) {
    next(err);
  }
});

// POST /security/2fa/disable - Disable 2FA
router.post('/2fa/disable', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { code } = req.body;
    const user = await prisma.user.findUnique({ where: { id: req.user!.sub } });
    if (!user?.twoFactorSecret || !user.twoFactorEnabled) {
      return res.status(400).json({ error: { message: '2FA not enabled' } });
    }

    if (code) {
      const isValid = verifySync({ token: code, secret: user.twoFactorSecret });
      if (!isValid) return res.status(400).json({ error: { message: 'Código inválido' } });
    }

    await prisma.user.update({
      where: { id: req.user!.sub },
      data: { twoFactorEnabled: false, twoFactorSecret: null },
    });

    res.json({ success: true, message: '2FA desabilitado' });
  } catch (err) {
    next(err);
  }
});

// ══════════════════════════════════════
// PASSWORD CHANGE (self)
// ══════════════════════════════════════

router.post('/change-password', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: { message: 'currentPassword and newPassword required' } });
    }

    if (newPassword.length < 8 || !/[A-Z]/.test(newPassword) || !/[a-z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
      return res.status(400).json({ error: { message: 'Senha deve ter 8+ caracteres com maiúscula, minúscula e número' } });
    }

    const user = await prisma.user.findUnique({ where: { id: req.user!.sub } });
    if (!user) return res.status(404).json({ error: { message: 'User not found' } });

    const valid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!valid) return res.status(401).json({ error: { message: 'Senha atual incorreta' } });

    const hash = await bcrypt.hash(newPassword, 12);
    await prisma.user.update({ where: { id: user.id }, data: { passwordHash: hash } });

    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: 'security.password_changed',
        resource: 'user',
        resourceId: user.id,
        ipAddress: req.ip,
        correlationId: req.correlationId,
      },
    });

    res.json({ success: true, message: 'Senha alterada com sucesso' });
  } catch (err) {
    next(err);
  }
});

// GET /security/sessions - Active sessions for current user
router.get('/sessions', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const sessions = await prisma.session.findMany({
      where: { userId: req.user!.sub, expiresAt: { gt: new Date() } },
      select: { id: true, ipAddress: true, userAgent: true, createdAt: true, expiresAt: true },
      orderBy: { createdAt: 'desc' },
    });
    res.json(sessions);
  } catch (err) {
    next(err);
  }
});

// DELETE /security/sessions/:id - Revoke a session
router.delete('/sessions/:id', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    await prisma.session.deleteMany({
      where: { id: req.params.id, userId: req.user!.sub },
    });
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

export { router as securityRoutes };
