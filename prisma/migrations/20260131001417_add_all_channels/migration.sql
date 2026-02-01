-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ChannelType" ADD VALUE 'SLACK';
ALTER TYPE "ChannelType" ADD VALUE 'DISCORD';
ALTER TYPE "ChannelType" ADD VALUE 'TEAMS';
ALTER TYPE "ChannelType" ADD VALUE 'GOOGLE_CHAT';
ALTER TYPE "ChannelType" ADD VALUE 'SIGNAL';
ALTER TYPE "ChannelType" ADD VALUE 'IMESSAGE';
ALTER TYPE "ChannelType" ADD VALUE 'MATRIX';
ALTER TYPE "ChannelType" ADD VALUE 'MATTERMOST';
ALTER TYPE "ChannelType" ADD VALUE 'NEXTCLOUD';
ALTER TYPE "ChannelType" ADD VALUE 'NOSTR';
ALTER TYPE "ChannelType" ADD VALUE 'LINE';
ALTER TYPE "ChannelType" ADD VALUE 'ZALO';
ALTER TYPE "ChannelType" ADD VALUE 'WEBHOOK';
ALTER TYPE "ChannelType" ADD VALUE 'CLI';
