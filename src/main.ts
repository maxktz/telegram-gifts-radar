import { GiftsRadar } from './gifts-radar'
import { startTelegramClient } from './utils'
import { PrismaClient } from '@prisma/client'
import * as Joi from 'joi'
import { TelegramClient } from 'telegram'

const envSchema = Joi.object({
  CHAT_IDS: Joi.string().required(),
  TELEGRAM_SESSION: Joi.string().required(),
  TELEGRAM_API_ID: Joi.number().required(),
  TELEGRAM_API_HASH: Joi.string().required(),
  TELEGRAM_APP_VERSION: Joi.string().required(),
  TELEGRAM_DEVICE_MODEL: Joi.string().required(),
  TELEGRAM_SYSTEM_VERSION: Joi.string().required(),
  // optional:
  PROXY: Joi.string().optional(),
})

async function bootstrap() {
  require('dotenv').config()
  const { error, value: env } = envSchema.validate(process.env, {
    allowUnknown: true,
  })
  if (error) throw error

  const proxyUrl: undefined | URL = env.PROXY && new URL(env.PROXY)
  const telegramClient = new TelegramClient(
    env.TELEGRAM_SESSION,
    env.TELEGRAM_API_ID,
    env.TELEGRAM_API_HASH,
    {
      appVersion: env.TELEGRAM_APP_VERSION,
      deviceModel: env.TELEGRAM_DEVICE_MODEL,
      systemVersion: env.TELEGRAM_SYSTEM_VERSION,
      langCode: 'en',
      systemLangCode: 'en',
      proxy: env.PROXY && {
        socksType: proxyUrl!.protocol === 'socks5:' ? 5 : 4,
        ip: proxyUrl!.hostname,
        port: Number(proxyUrl!.port),
        password: proxyUrl!.password || undefined,
        username: proxyUrl!.username || undefined,
      },
    },
  )
  await startTelegramClient(telegramClient)

  const prisma = new PrismaClient()

  const chatIds: string[] = env.CHAT_IDS.split(',').map((id: string) =>
    id.trim(),
  )

  const app = new GiftsRadar(telegramClient, prisma, chatIds)

  await app.run()
}
bootstrap()
