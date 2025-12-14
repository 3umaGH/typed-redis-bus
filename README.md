# Typed PubSub Bus

A type-safe wrapper for pub/sub operations with TypeScript support. This library provides a strongly-typed interface for Redis-like and other publish/subscribe systems, ensuring type safety for your event payloads.

## Features

- **Type Safety**: Full TypeScript support with strongly-typed event payloads
- **Flexible Client Support**: Works with any pub/sub client that implements the basic pub/sub interface
- **Event Management**: Automatic subscription tracking and cleanup
- **Error Handling**: Graceful handling of malformed messages
- **Lazy Client Support**: Support for lazy client initialization through function factories

## Installation

```bash
npm install typed-pubsub-bus
```

## Basic Usage

### Define Your Event Types

First, define the structure of your events:

```typescript
import { wrapPubSub } from 'typed-pubsub-bus'

// Define your event types
type MyEvents = {
  userLogin: { userId: string; timestamp: number }
  userLogout: { userId: string }
  messageReceived: { from: string; content: string; timestamp: number }
  systemAlert: { level: 'info' | 'warning' | 'error'; message: string }
}
```

### With Redis Client

```typescript
import { createClient } from 'redis'
import { wrapPubSub } from 'typed-pubsub-bus'

// Create and configure your Redis client
const redisClient = createClient({
  url: 'redis://localhost:6379',
})

await redisClient.connect()

// Create a Redis adapter
const redisAdapter = {
  publish: async (channel: string, message: string) => {
    await redisClient.publish(channel, message)
  },
  subscribe: async (channel: string, handler: (message: string) => void) => {
    await redisClient.subscribe(channel, handler)
  },
  unsubscribe: async (channel: string) => {
    await redisClient.unsubscribe(channel)
  },
}

// Wrap the Redis client
const bus = wrapPubSub<MyEvents>(redisAdapter)

// Publish events with type safety
await bus.publish('auth-channel', 'userLogin', {
  userId: 'user123',
  timestamp: Date.now(),
})

// Subscribe to events with type safety
await bus.subscribe('auth-channel', 'userLogin', payload => {
  // payload is automatically typed as { userId: string; timestamp: number }
  console.log(`User ${payload.userId} logged in at ${payload.timestamp}`)
})

// Unsubscribe from events
await bus.unsubscribe('auth-channel', 'userLogin')
```

### With EventEmitter (for testing or local development)

```typescript
import { EventEmitter } from 'events'
import { wrapPubSub } from 'typed-pubsub-bus'

// Create an EventEmitter adapter
const eventEmitter = new EventEmitter()

const eventEmitterAdapter = {
  publish: async (channel: string, message: string) => {
    eventEmitter.emit(channel, message)
  },
  subscribe: async (channel: string, handler: (message: string) => void) => {
    eventEmitter.on(channel, handler)
  },
  unsubscribe: async (channel: string) => {
    eventEmitter.removeAllListeners(channel)
  },
}

// Wrap the EventEmitter
const bus = wrapPubSub<MyEvents>(eventEmitterAdapter)

// Use it the same way as with Redis
await bus.publish('notifications', 'systemAlert', {
  level: 'warning',
  message: 'High memory usage detected',
})

await bus.subscribe('notifications', 'systemAlert', payload => {
  console.log(`Alert [${payload.level}]: ${payload.message}`)
})
```

### Lazy Client Initialization

You can also provide a function that returns the client interface, useful for lazy initialization:

```typescript
import { createClient } from 'redis'

let redisClient: any = null

const getRedisAdapter = () => {
  if (!redisClient) {
    redisClient = createClient({ url: 'redis://localhost:6379' })
    redisClient.connect()
  }

  return {
    publish: async (channel: string, message: string) => {
      await redisClient.publish(channel, message)
    },
    subscribe: async (channel: string, handler: (message: string) => void) => {
      await redisClient.subscribe(channel, handler)
    },
    unsubscribe: async (channel: string) => {
      await redisClient.unsubscribe(channel)
    },
  }
}

// Pass the function instead of the object
const bus = wrapPubSub<MyEvents>(getRedisAdapter)
```

## API Reference

### `wrapPubSub<E>(clientInterface)`

Creates a typed pub/sub bus wrapper.

**Parameters:**

- `clientInterface`: `PubSubInterface | (() => PubSubInterface)` - Either a pub/sub client object or a function that returns one

**Returns:** `WrapperReturnType<E>` - A typed wrapper with publish, subscribe, and unsubscribe methods

### `publish<K>(channel, event, payload)`

Publishes an event to a channel.

**Parameters:**

- `channel`: `string` - The channel name
- `event`: `K extends keyof E` - The event type (must be a key from your event types)
- `payload`: `E[K]` - The event payload (automatically typed based on the event)

**Returns:** `Promise<void>`

### `subscribe<K>(channel, event, handler)`

Subscribes to an event on a channel.

**Parameters:**

- `channel`: `string` - The channel name
- `event`: `K extends keyof E` - The event type to subscribe to
- `handler`: `(payload: E[K]) => void` - Handler function that receives the typed payload

**Returns:** `Promise<void>`

### `unsubscribe<K>(channel, event)`

Unsubscribes from an event on a channel.

**Parameters:**

- `channel`: `string` - The channel name
- `event`: `K extends keyof E` - The event type to unsubscribe from

**Returns:** `Promise<void>`

## Type Definitions

### `PubSubInterface`

The interface your pub/sub client must implement:

```typescript
type PubSubInterface = {
  publish: (channel: string, message: string) => Promise<void>
  subscribe: (channel: string, handler: (message: string) => void) => Promise<void>
  unsubscribe: (channel: string) => Promise<void>
}
```

### `WrapperEvents`

Base type for your event definitions:

```typescript
type WrapperEvents = Record<string, unknown>
```

## Advanced Usage

### Multiple Channels

```typescript
// Subscribe to different events on different channels
await bus.subscribe('auth', 'userLogin', handleLogin)
await bus.subscribe('auth', 'userLogout', handleLogout)
await bus.subscribe('messaging', 'messageReceived', handleMessage)

// Publish to different channels
await bus.publish('auth', 'userLogin', { userId: 'user123', timestamp: Date.now() })
await bus.publish('messaging', 'messageReceived', {
  from: 'user456',
  content: 'Hello World!',
  timestamp: Date.now(),
})
```

### Multiple Handlers for Same Event

```typescript
// Multiple handlers can subscribe to the same event
await bus.subscribe('notifications', 'systemAlert', logAlert)
await bus.subscribe('notifications', 'systemAlert', sendEmailAlert)
await bus.subscribe('notifications', 'systemAlert', updateDashboard)

// All handlers will receive the event when published
await bus.publish('notifications', 'systemAlert', {
  level: 'error',
  message: 'Database connection failed',
})
```

### Error Handling

The wrapper automatically handles JSON parsing errors and logs them to the console. Invalid messages are ignored and don't trigger handlers.

```typescript
// This will be logged as an error and ignored
// (simulating a malformed message from Redis)
eventEmitter.emit('test-channel', 'invalid json')
```

## Best Practices

1. **Define Clear Event Types**: Use descriptive names and well-structured payloads
2. **Use Channels Logically**: Group related events on the same channel
3. **Handle Cleanup**: Always unsubscribe when you no longer need to listen to events
4. **Error Handling**: Implement proper error handling in your event handlers
5. **Type Safety**: Let TypeScript guide you - if it compiles, your events are properly typed

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
