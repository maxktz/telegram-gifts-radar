import { input } from '@inquirer/prompts'
import { TelegramClient } from 'telegram'

export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function startTelegramClient(
  client: TelegramClient,
): Promise<void> {
  return await client.start({
    phoneNumber: async () =>
      await input({ message: 'Please enter your number: ' }),
    password: async () =>
      await input({ message: 'Please enter your password: ' }),
    phoneCode: async () =>
      await input({ message: 'Please enter the code you received: ' }),
    onError: (err) => {
      throw err
    },
  })
}

export function int256ToBytes(int: any) {
  const bytesArray: number[] = []
  for (let i = 0; i < 32; i++) {
    let shift = int >> BigInt(8 * i)
    shift &= BigInt(255)
    bytesArray[i] = Number(String(shift))
  }
  return Buffer.from(bytesArray)
}
