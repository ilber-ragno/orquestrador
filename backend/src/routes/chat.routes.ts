import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../middleware/auth.js';
import { AppError } from '../middleware/error-handler.js';
import { prisma } from '../lib/prisma.js';
import * as openclaw from '../services/openclaw.service.js';
import { execInContainer } from '../services/lxc.service.js';

const router = Router();

// GET /instances/:id/chat/sessions - List all chat sessions from container
router.get('/:id/chat/sessions', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const instance = await prisma.instance.findUnique({ where: { id: req.params.id as string } });
    if (!instance) return next(new AppError(404, 'NOT_FOUND', 'Instância não encontrada'));
    if (!instance.containerHost || !instance.containerName) {
      return next(new AppError(400, 'NO_CONTAINER', 'Instância sem container mapeado'));
    }

    const sessions = await openclaw.listSessions(instance.containerHost, instance.containerName);
    res.json({ sessions });
  } catch (err) {
    next(err);
  }
});

// GET /instances/:id/chat/sessions/:sessionId - Get messages from a specific session
router.get('/:id/chat/sessions/:sessionId', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const instance = await prisma.instance.findUnique({ where: { id: req.params.id as string } });
    if (!instance) return next(new AppError(404, 'NOT_FOUND', 'Instância não encontrada'));
    if (!instance.containerHost || !instance.containerName) {
      return next(new AppError(400, 'NO_CONTAINER', 'Instância sem container mapeado'));
    }

    const sessionId = req.params.sessionId as string;
    // Validate sessionId format (UUID)
    if (!/^[a-f0-9-]{36}$/.test(sessionId)) {
      return next(new AppError(400, 'INVALID_ID', 'ID de sessão inválido'));
    }

    const messages = await openclaw.getSessionMessages(instance.containerHost, instance.containerName, sessionId);
    // Filter to only return message-type entries (user/assistant messages)
    const chatMessages = messages.filter(m => m.type === 'message' && m.role);

    res.json({ messages: chatMessages, total: chatMessages.length });
  } catch (err) {
    next(err);
  }
});

// GET /instances/:id/chat/audio - Stream audio file from container
router.get('/:id/chat/audio', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const instance = await prisma.instance.findUnique({ where: { id: req.params.id as string } });
    if (!instance) return next(new AppError(404, 'NOT_FOUND', 'Instância não encontrada'));
    if (!instance.containerHost || !instance.containerName) {
      return next(new AppError(400, 'NO_CONTAINER', 'Instância sem container mapeado'));
    }

    const filePath = req.query.path as string;
    if (!filePath) return next(new AppError(400, 'MISSING_PATH', 'Caminho do arquivo não informado'));

    // Security: only allow audio files from /tmp/ paths
    if (!filePath.startsWith('/tmp/') || filePath.includes('..')) {
      return next(new AppError(400, 'INVALID_PATH', 'Caminho não permitido'));
    }

    // Validate extension
    const ext = filePath.split('.').pop()?.toLowerCase();
    const mimeMap: Record<string, string> = {
      mp3: 'audio/mpeg',
      ogg: 'audio/ogg',
      opus: 'audio/opus',
      wav: 'audio/wav',
      m4a: 'audio/mp4',
      aac: 'audio/aac',
    };
    if (!ext || !mimeMap[ext]) {
      return next(new AppError(400, 'INVALID_FORMAT', 'Formato de áudio não suportado'));
    }

    // Get file size first
    const sizeResult = await execInContainer(
      instance.containerHost,
      instance.containerName,
      `stat -c %s "${filePath}" 2>/dev/null`,
      5000,
    );
    if (sizeResult.exitCode !== 0 || !sizeResult.stdout.trim()) {
      return next(new AppError(404, 'NOT_FOUND', 'Arquivo de áudio não encontrado'));
    }
    const fileSize = parseInt(sizeResult.stdout.trim(), 10);
    if (isNaN(fileSize) || fileSize <= 0 || fileSize > 25 * 1024 * 1024) {
      return next(new AppError(400, 'INVALID_SIZE', 'Arquivo inválido ou muito grande'));
    }

    // Read file as base64 from container
    const b64Result = await execInContainer(
      instance.containerHost,
      instance.containerName,
      `base64 -w0 "${filePath}" 2>/dev/null`,
      30000,
    );
    if (b64Result.exitCode !== 0 || !b64Result.stdout) {
      return next(new AppError(404, 'NOT_FOUND', 'Não foi possível ler o arquivo de áudio'));
    }

    const audioBuffer = Buffer.from(b64Result.stdout.trim(), 'base64');
    res.set({
      'Content-Type': mimeMap[ext],
      'Content-Length': audioBuffer.length.toString(),
      'Cache-Control': 'public, max-age=3600',
      'Accept-Ranges': 'bytes',
    });
    res.send(audioBuffer);
  } catch (err) {
    next(err);
  }
});

// GET /instances/:id/chat/contacts - Get cached contact profiles for session list
router.get('/:id/chat/contacts', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const instance = await prisma.instance.findUnique({ where: { id: req.params.id as string } });
    if (!instance) return next(new AppError(404, 'NOT_FOUND', 'Instância não encontrada'));

    // Return all cached contacts for this instance
    const contacts = await prisma.contactCache.findMany({
      where: { instanceId: instance.id },
      select: { contactId: true, displayName: true, profilePicUrl: true, phone: true, lastFetched: true },
    });

    const map: Record<string, { displayName: string | null; profilePicUrl: string | null; phone: string | null }> = {};
    for (const c of contacts) {
      map[c.contactId] = { displayName: c.displayName, profilePicUrl: c.profilePicUrl, phone: c.phone };
    }
    res.json(map);
  } catch (err) {
    next(err);
  }
});

// POST /instances/:id/chat/contacts/fetch - Fetch profile from WhatsApp and cache it
router.post('/:id/chat/contacts/fetch', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const instance = await prisma.instance.findUnique({ where: { id: req.params.id as string } });
    if (!instance) return next(new AppError(404, 'NOT_FOUND', 'Instância não encontrada'));
    if (!instance.containerHost || !instance.containerName) {
      return next(new AppError(400, 'NO_CONTAINER', 'Instância sem container mapeado'));
    }

    const contactIds: string[] = req.body.contactIds;
    if (!Array.isArray(contactIds) || contactIds.length === 0 || contactIds.length > 50) {
      return next(new AppError(400, 'INVALID_INPUT', 'Envie de 1 a 50 contactIds'));
    }

    // Check TTL — only fetch contacts not cached in last 24h
    const TTL_HOURS = 24;
    const ttlThreshold = new Date(Date.now() - TTL_HOURS * 3600 * 1000);
    const existing = await prisma.contactCache.findMany({
      where: { instanceId: instance.id, contactId: { in: contactIds }, lastFetched: { gte: ttlThreshold } },
    });
    const freshIds = new Set(existing.map(c => c.contactId));
    const staleIds = contactIds.filter(id => !freshIds.has(id));

    const results: Record<string, { displayName: string | null; profilePicUrl: string | null; phone: string | null }> = {};

    // Return cached data for fresh entries
    for (const c of existing) {
      results[c.contactId] = { displayName: c.displayName, profilePicUrl: c.profilePicUrl, phone: c.phone };
    }

    // Fetch stale entries from container
    for (const contactId of staleIds) {
      try {
        // Try to get contact info via openclaw gateway API or baileys
        // Format: contactId might be "whatsapp:+5511987654321" or just "+5511987654321"
        const phone = contactId.replace('whatsapp:', '').replace('@s.whatsapp.net', '');
        const jid = phone.includes('@') ? phone : `${phone.replace('+', '')}@s.whatsapp.net`;

        // Try fetching profile pic from WhatsApp via gateway
        let displayName: string | null = null;
        let profilePicUrl: string | null = null;

        // Method 1: Try openclaw contact-info command
        const infoResult = await execInContainer(
          instance.containerHost!,
          instance.containerName!,
          `openclaw whatsapp contact ${jid} --json 2>/dev/null || echo '{}'`,
          10000,
        );
        if (infoResult.stdout) {
          try {
            const info = JSON.parse(infoResult.stdout.trim());
            displayName = info.pushName || info.name || info.notify || null;
            profilePicUrl = info.imgUrl || info.profilePicUrl || null;
          } catch {}
        }

        // Method 2: If no displayName, try reading from store
        if (!displayName) {
          const storeResult = await execInContainer(
            instance.containerHost!,
            instance.containerName!,
            `cat /root/.openclaw/store/contacts.json 2>/dev/null | node -e "
              const fs=require('fs');
              const d=JSON.parse(fs.readFileSync('/dev/stdin','utf8'));
              const c=d['${jid}']||d['${phone}']||{};
              console.log(JSON.stringify({name:c.pushName||c.name||c.notify||null,pic:c.imgUrl||null}))
            " 2>/dev/null || echo '{}'`,
            10000,
          );
          if (storeResult.stdout) {
            try {
              const info = JSON.parse(storeResult.stdout.trim());
              if (info.name) displayName = info.name;
              if (info.pic) profilePicUrl = info.pic;
            } catch {}
          }
        }

        // Upsert to cache
        await prisma.contactCache.upsert({
          where: { instanceId_contactId: { instanceId: instance.id, contactId } },
          create: { instanceId: instance.id, contactId, displayName, profilePicUrl, phone, lastFetched: new Date() },
          update: { displayName, profilePicUrl, phone, lastFetched: new Date() },
        });

        results[contactId] = { displayName, profilePicUrl, phone };
      } catch {
        // If fetching fails, cache with null values to avoid retrying too soon
        await prisma.contactCache.upsert({
          where: { instanceId_contactId: { instanceId: instance.id, contactId } },
          create: { instanceId: instance.id, contactId, phone: contactId.replace('whatsapp:', ''), lastFetched: new Date() },
          update: { lastFetched: new Date() },
        });
        results[contactId] = { displayName: null, profilePicUrl: null, phone: contactId.replace('whatsapp:', '') };
      }
    }

    res.json(results);
  } catch (err) {
    next(err);
  }
});

export { router as chatRoutes };
