import { PrismaClient, Role } from '@prisma/client';
import bcrypt from 'bcrypt';
import dotenv from 'dotenv';

dotenv.config({ path: '.env' });

const prisma = new PrismaClient();

async function main() {
  const email = process.env.ADMIN_EMAIL || 'admin@clawd.local';
  const password = process.env.ADMIN_PASSWORD;
  if (!password) throw new Error('ADMIN_PASSWORD env var required');

  const rounds = parseInt(process.env.BCRYPT_ROUNDS || '12');
  const hash = await bcrypt.hash(password, rounds);

  const user = await prisma.user.upsert({
    where: { email },
    update: { passwordHash: hash, role: Role.ADMIN },
    create: {
      email,
      passwordHash: hash,
      name: 'Admin',
      role: Role.ADMIN,
    },
  });

  console.log(`Seeded admin user: ${user.email} (${user.id})`);

  // Seed 3 default instances
  const instances = [
    { name: 'Instância 1', slug: 'inst-1', description: 'Instância principal' },
    { name: 'Instância 2', slug: 'inst-2', description: 'Instância secundária' },
    { name: 'Instância 3', slug: 'inst-3', description: 'Instância de testes' },
  ];

  for (const inst of instances) {
    const instance = await prisma.instance.upsert({
      where: { slug: inst.slug },
      update: { name: inst.name, description: inst.description },
      create: inst,
    });
    console.log(`Seeded instance: ${instance.name} (${instance.slug})`);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
