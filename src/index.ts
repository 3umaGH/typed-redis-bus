import { RedisInterface, WrapperEvents } from './types/redis'

const wrapRedis = <E extends WrapperEvents>(clientInterface: RedisInterface | (() => RedisInterface)) => {
  return {
    publish: async <K extends keyof E>(channel: string, event: K, payload: E[K]) => {
      const client = typeof clientInterface === 'function' ? clientInterface() : clientInterface
      const message = JSON.stringify({ event, payload })
      await client.publish(channel, message)
    },
    subscribe: async <K extends keyof E>(channel: string, event: K, handler: (message: E[K]) => void) => {
      const client = typeof clientInterface === 'function' ? clientInterface() : clientInterface
      await client.subscribe(channel, (message: string) => {
        try {
          const parsed: { event: K; payload: E[K] } = JSON.parse(message)
          if (parsed.event === event) {
            handler(parsed.payload)
          }
        } catch (error) {
          console.error('Error parsing message:', error)
        }
      })
    },
  }
}
