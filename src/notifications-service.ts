import type { CallRecipient } from './types'
import { int256ToBytes } from './utils'
import { Api, type TelegramClient } from 'telegram'
import { generateRandomBytes, sha256, sleep } from 'telegram/Helpers'
import type { Twilio } from 'twilio'

export class NotificationsService {
  callDeclineDelay = 30_000

  constructor(
    private readonly telegramClient: TelegramClient,
    private readonly twilioClient?: Twilio,
    private readonly twilioFromPhone?: string,
    private readonly recipients?: CallRecipient[],
  ) {}

  async sendCallNotifications() {
    // call telegrams
    await Promise.all([
      this.recipients?.map((r) => this.sendCallNotificationsToRecipient(r)),
    ])
  }

  async sendCallNotificationsToRecipient(recipient: CallRecipient) {
    let attention = false
    if (recipient.telegramId) {
      attention = await this.sendTelegramCallNotification(recipient.telegramId)
    }
    if (!attention && recipient.telegramId) {
      await sleep(3_000)
      attention = await this.sendTelegramCallNotification(recipient.telegramId)
    }
    if (!attention && recipient.phoneNumber) {
      await this.sendPhoneCallNotification(recipient.phoneNumber)
    }
  }

  /** returns true if user has paid attention to the call, declined/answerd */
  async sendTelegramCallNotification(userId: string): Promise<boolean> {
    console.debug(`Calling tg user ${userId}`)
    let call
    try {
      call = await this.telegramClient.invoke(
        new Api.phone.RequestCall({
          userId: userId,
          randomId: Math.floor(Math.random() * 10000),
          gAHash: await this.getShagA(this.telegramClient),
          protocol: new Api.PhoneCallProtocol({
            minLayer: 92,
            maxLayer: 92,
            libraryVersions: ['3.0.0'],
            udpP2p: true,
            udpReflector: true,
          }),
          video: false,
        }),
      )
    } catch (e) {
      console.error(`Error calling tg user ${userId}`, e)
      return false
    }

    if ('accessHash' in call.phoneCall) {
      await sleep(this.callDeclineDelay)
      try {
        const decline = await this.telegramClient.invoke(
          new Api.phone.DiscardCall({
            video: false,
            peer: new Api.InputPhoneCall({
              accessHash: call.phoneCall.accessHash,
              id: call.phoneCall.id,
            }),
            duration: 1,
            reason: new Api.PhoneCallDiscardReasonHangup(),
          }),
        )
        const phoneCall: Api.PhoneCall | undefined =
          // @ts-ignore
          decline.updates?.[0]?.phoneCall

        if (phoneCall === undefined) {
          console.log(`Call to ${userId} got declined by user`)
          return true // user paid attention and declined
        }
        console.log(`Call to ${userId} got unanswered`)
      } catch (e) {
        console.error(`Error declining call to ${userId}`, e)
      }
    }
    return false // user has not paid attention
  }

  async sendPhoneCallNotification(phoneNumber: string): Promise<boolean> {
    if (!this.canCallPhone()) return false

    try {
      const call = await this.twilioClient!.calls.create({
        from: this.twilioFromPhone!,
        to: phoneNumber,
        twiml:
          '<Response><Say>New Telegram Gifts Notification.</Say></Response>',
      })
      return true
    } catch (e) {
      console.error(`Error calling phone ${phoneNumber}`, e)
    }
    return false
  }

  private canCallPhone() {
    return Boolean(
      this.twilioClient && this.twilioFromPhone && this.recipients?.length,
    )
  }

  private async getShagA(client: TelegramClient) {
    const dhc = (await client.invoke(
      new Api.messages.GetDhConfig({
        version: 0,
        randomLength: 256,
      }),
    )) as any

    const g = BigInt(dhc.g)
    const p = BigInt(`0x${dhc.p.toString('hex')}`)

    let a = BigInt(0)
    while (a <= 1 && a >= p) {
      a = BigInt(`0x${generateRandomBytes(256).toString('hex')}`)
    }

    const g_a = g ** a % p

    return await sha256(int256ToBytes(g_a))
  }
}
