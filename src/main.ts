import { GiftsRadar } from './gifts-radar'
import { NotificationsService } from './notifications-service'
import type { CallRecipient } from './types'
import { startTelegramClient } from './utils'
import { PrismaClient } from '@prisma/client'
import * as Joi from 'joi'
import * as path from 'path'
import { TelegramClient } from 'telegram'
import twilio, { Twilio } from 'twilio'

const envSchema = Joi.object({
  CHAT_IDS: Joi.string().required(),
  TELEGRAM_SESSION_FILENAME: Joi.string().required(),
  TELEGRAM_API_ID: Joi.number().required(),
  TELEGRAM_API_HASH: Joi.string().required(),
  TELEGRAM_APP_VERSION: Joi.string().required(),
  TELEGRAM_DEVICE_MODEL: Joi.string().required(),
  TELEGRAM_SYSTEM_VERSION: Joi.string().required(),
  // optional:
  PROXY: Joi.string().optional(),
  TWILIO_ACCOUNT_SID: Joi.string().optional(),
  TWILIO_AUTH_TOKEN: Joi.string().optional(),
  TWILIO_PHONE_NUMBER: Joi.string().optional(),
  CALL_RECIPIENTS: Joi.string().optional(),
})

async function bootstrap() {
  require('dotenv').config()
  const { error, value: env } = envSchema.validate(process.env, {
    allowUnknown: true,
  })
  if (error) throw error

  const chatIdsToSend: string[] = env.CHAT_IDS.split(',').map((id: string) =>
    id.trim(),
  )

  const callRecipients: CallRecipient[] = env.CALL_RECIPIENTS
    ? JSON.parse(env.CALL_RECIPIENTS).map(
        (v: { id: string; phone: string }) => ({
          telegramId: v.id,
          phoneNumber: v.phone,
        }),
      )
    : []

  const proxyUrl: undefined | URL = env.PROXY && new URL(env.PROXY)
  const sessionFile = path.join('sessions', env.TELEGRAM_SESSION_FILENAME)

  const telegramClient = new TelegramClient(
    sessionFile,
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

  const twilioClient: Twilio | undefined =
    env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN && callRecipients.length
      ? twilio(env.TWILIO_ACCOUNT_SID, env.TWILIO_AUTH_TOKEN)
      : undefined

  const notificationService = new NotificationsService(
    telegramClient,
    twilioClient,
    env.TWILIO_PHONE_NUMBER,
    callRecipients,
  )

  const prisma = new PrismaClient()
  const app = new GiftsRadar(
    notificationService,
    telegramClient,
    prisma,
    chatIdsToSend,
  )
  await app.run()
}
bootstrap()
