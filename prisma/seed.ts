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

  // Seed LXC container instances
  const instances = [
    { name: 'Titan', slug: 'titan', description: 'Container principal de produção', containerName: 'titan', containerHost: '145.223.31.7', containerType: 'production' },
    { name: 'Orquestrador', slug: 'orquestrador', description: 'Container de orquestração', containerName: 'orquestrador', containerHost: '145.223.31.7', containerType: 'production' },
    { name: 'Mars', slug: 'mars', description: 'Container Mars', containerName: 'mars', containerHost: '145.223.31.7', containerType: 'staging' },
    { name: 'Nova', slug: 'nova', description: 'Container Nova', containerName: 'nova', containerHost: '145.223.31.7', containerType: 'staging' },
  ];

  for (const inst of instances) {
    const instance = await prisma.instance.upsert({
      where: { slug: inst.slug },
      update: { name: inst.name, description: inst.description, containerName: inst.containerName, containerHost: inst.containerHost, containerType: inst.containerType },
      create: inst,
    });
    console.log(`Seeded instance: ${instance.name} (${instance.slug}) -> LXC: ${instance.containerName}@${instance.containerHost}`);
  }

  // Seed default plan
  const plan = await prisma.plan.upsert({
    where: { name: 'Starter' },
    update: {},
    create: {
      name: 'Starter',
      description: 'Plano inicial com limites básicos',
      maxMessages: 1000,
      maxSessions: 10,
      maxTokens: 500000,
      maxCostCents: 5000,
      maxChannels: 2,
      maxProviders: 2,
      blockOnExceed: false,
      fallbackAction: 'throttle',
    },
  });
  console.log(`Seeded plan: ${plan.name} (${plan.id})`);

  const proPlan = await prisma.plan.upsert({
    where: { name: 'Professional' },
    update: {},
    create: {
      name: 'Professional',
      description: 'Plano profissional com limites expandidos',
      maxMessages: 10000,
      maxSessions: 50,
      maxTokens: 5000000,
      maxCostCents: 50000,
      maxChannels: 10,
      maxProviders: 5,
      blockOnExceed: true,
      fallbackAction: 'block',
    },
  });
  console.log(`Seeded plan: ${proPlan.name} (${proPlan.id})`);

  const unlimitedPlan = await prisma.plan.upsert({
    where: { name: 'Enterprise' },
    update: {},
    create: {
      name: 'Enterprise',
      description: 'Plano empresarial sem limites',
      maxMessages: null,
      maxSessions: null,
      maxTokens: null,
      maxCostCents: null,
      maxChannels: null,
      maxProviders: null,
      blockOnExceed: false,
      fallbackAction: 'notify',
    },
  });
  console.log(`Seeded plan: ${unlimitedPlan.name} (${unlimitedPlan.id})`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
