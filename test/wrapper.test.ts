import { beforeEach, describe, expect, it, vi } from 'vitest'
import { wrapPubSub } from '../src/index'
import { PubSubInterface } from '../src/types'

// Define test event types
type TestEvents = {
  userLogin: { userId: string; timestamp: number }
  userLogout: { userId: string }
  messageReceived: { from: string; content: string; timestamp: number }
  systemAlert: { level: 'info' | 'warning' | 'error'; message: string }
}

describe('Wrapper Test Suite', () => {
  let mockPublish: ReturnType<typeof vi.fn> & PubSubInterface['publish']
  let mockSubscribe: ReturnType<typeof vi.fn> & PubSubInterface['subscribe']
  let mockUnsubscribe: ReturnType<typeof vi.fn> & PubSubInterface['unsubscribe']
  let mockPubSubInterface: PubSubInterface

  beforeEach(() => {
    mockPublish = vi.fn().mockResolvedValue(undefined)
    mockSubscribe = vi.fn().mockResolvedValue(undefined)
    mockUnsubscribe = vi.fn().mockResolvedValue(undefined)

    mockPubSubInterface = {
      publish: mockPublish,
      subscribe: mockSubscribe,
      unsubscribe: mockUnsubscribe,
    }
  })

  describe('Interface as Direct Object', () => {
    it('should publish events with correct serialization', async () => {
      const wrapper = wrapPubSub<TestEvents>(mockPubSubInterface)

      const userLoginPayload = { userId: 'user123', timestamp: 1640995200000 }
      await wrapper.publish('auth-channel', 'userLogin', userLoginPayload)

      expect(mockPublish).toHaveBeenCalledWith(
        'auth-channel',
        JSON.stringify({ event: 'userLogin', payload: userLoginPayload })
      )
    })

    it('should subscribe to events and handle messages correctly', async () => {
      const wrapper = wrapPubSub<TestEvents>(mockPubSubInterface)
      const handler = vi.fn()

      await wrapper.subscribe('auth-channel', 'userLogin', handler)

      expect(mockSubscribe).toHaveBeenCalledWith('auth-channel', expect.any(Function))

      // Simulate receiving a message
      const subscribeHandler = mockSubscribe.mock.calls[0][1]
      const messagePayload = { userId: 'user123', timestamp: 1640995200000 }
      subscribeHandler(JSON.stringify({ event: 'userLogin', payload: messagePayload }))

      expect(handler).toHaveBeenCalledWith(messagePayload)
    })

    it('should handle multiple subscriptions on the same channel', async () => {
      const wrapper = wrapPubSub<TestEvents>(mockPubSubInterface)
      const loginHandler = vi.fn()
      const logoutHandler = vi.fn()

      await wrapper.subscribe('auth-channel', 'userLogin', loginHandler)
      await wrapper.subscribe('auth-channel', 'userLogout', logoutHandler)

      expect(mockSubscribe).toHaveBeenCalledTimes(2)

      // Simulate receiving different messages
      const subscribeHandler1 = mockSubscribe.mock.calls[0][1]
      const subscribeHandler2 = mockSubscribe.mock.calls[1][1]

      subscribeHandler1(
        JSON.stringify({
          event: 'userLogin',
          payload: { userId: 'user123', timestamp: 1640995200000 },
        })
      )

      subscribeHandler2(
        JSON.stringify({
          event: 'userLogout',
          payload: { userId: 'user123' },
        })
      )

      expect(loginHandler).toHaveBeenCalledWith({ userId: 'user123', timestamp: 1640995200000 })
      expect(logoutHandler).toHaveBeenCalledWith({ userId: 'user123' })
    })

    it('should unsubscribe from specific events and clean up channels', async () => {
      const wrapper = wrapPubSub<TestEvents>(mockPubSubInterface)

      await wrapper.subscribe('auth-channel', 'userLogin', vi.fn())
      await wrapper.subscribe('auth-channel', 'userLogout', vi.fn())

      // Unsubscribe from one event
      await wrapper.unsubscribe('auth-channel', 'userLogin')
      expect(mockUnsubscribe).not.toHaveBeenCalled() // Channel still has other subscriptions

      // Unsubscribe from last event
      await wrapper.unsubscribe('auth-channel', 'userLogout')
      expect(mockUnsubscribe).toHaveBeenCalledWith('auth-channel')
    })

    it('should ignore events that do not match subscription', async () => {
      const wrapper = wrapPubSub<TestEvents>(mockPubSubInterface)
      const handler = vi.fn()

      await wrapper.subscribe('auth-channel', 'userLogin', handler)

      const subscribeHandler = mockSubscribe.mock.calls[0][1]

      // Send different event
      subscribeHandler(
        JSON.stringify({
          event: 'userLogout',
          payload: { userId: 'user123' },
        })
      )

      expect(handler).not.toHaveBeenCalled()
    })

    it('should handle invalid JSON gracefully', async () => {
      const wrapper = wrapPubSub<TestEvents>(mockPubSubInterface)
      const handler = vi.fn()
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      await wrapper.subscribe('auth-channel', 'userLogin', handler)

      const subscribeHandler = mockSubscribe.mock.calls[0][1]
      subscribeHandler('invalid json string')

      expect(handler).not.toHaveBeenCalled()
      expect(consoleSpy).toHaveBeenCalledWith('Error parsing message:', expect.any(Error))

      consoleSpy.mockRestore()
    })

    it('should not call handler for unsubscribed events', async () => {
      const wrapper = wrapPubSub<TestEvents>(mockPubSubInterface)
      const handler = vi.fn()

      await wrapper.subscribe('auth-channel', 'userLogin', handler)
      await wrapper.unsubscribe('auth-channel', 'userLogin')

      const subscribeHandler = mockSubscribe.mock.calls[0][1]
      subscribeHandler(
        JSON.stringify({
          event: 'userLogin',
          payload: { userId: 'user123', timestamp: 1640995200000 },
        })
      )

      expect(handler).not.toHaveBeenCalled()
    })
  })

  describe('Interface as Function', () => {
    let functionCallCount: number
    let mockInterfaceFunction: () => PubSubInterface

    beforeEach(() => {
      functionCallCount = 0
      mockInterfaceFunction = vi.fn(() => {
        functionCallCount++
        return mockPubSubInterface
      })
    })

    it('should call interface function on publish', async () => {
      const wrapper = wrapPubSub<TestEvents>(mockInterfaceFunction)

      await wrapper.publish('auth-channel', 'userLogin', { userId: 'user123', timestamp: 1640995200000 })

      expect(mockInterfaceFunction).toHaveBeenCalledTimes(1)
      expect(mockPublish).toHaveBeenCalledWith(
        'auth-channel',
        JSON.stringify({
          event: 'userLogin',
          payload: { userId: 'user123', timestamp: 1640995200000 },
        })
      )
    })

    it('should call interface function on subscribe', async () => {
      const wrapper = wrapPubSub<TestEvents>(mockInterfaceFunction)

      await wrapper.subscribe('auth-channel', 'userLogin', vi.fn())

      expect(mockInterfaceFunction).toHaveBeenCalledTimes(1)
      expect(mockSubscribe).toHaveBeenCalledWith('auth-channel', expect.any(Function))
    })

    it('should call interface function on unsubscribe', async () => {
      const wrapper = wrapPubSub<TestEvents>(mockInterfaceFunction)

      await wrapper.subscribe('auth-channel', 'userLogin', vi.fn())
      await wrapper.unsubscribe('auth-channel', 'userLogin')

      expect(mockInterfaceFunction).toHaveBeenCalledTimes(2) // Once for subscribe, once for unsubscribe
      expect(mockUnsubscribe).toHaveBeenCalledWith('auth-channel')
    })

    it('should work with lazy client initialization', async () => {
      // Simulate PubSub client that's not immediately available
      let pubSubClient: PubSubInterface | null = null

      const lazyClientFunction = vi.fn(() => {
        if (!pubSubClient) {
          pubSubClient = mockPubSubInterface
        }
        return pubSubClient
      })

      const wrapper = wrapPubSub<TestEvents>(lazyClientFunction)

      await wrapper.publish('test-channel', 'systemAlert', { level: 'info', message: 'Test message' })

      expect(lazyClientFunction).toHaveBeenCalledTimes(1)
      expect(mockPublish).toHaveBeenCalledWith(
        'test-channel',
        JSON.stringify({
          event: 'systemAlert',
          payload: { level: 'info', message: 'Test message' },
        })
      )
    })
  })

  describe('Complex Scenarios', () => {
    it('should handle multiple channels with different event types', async () => {
      const wrapper = wrapPubSub<TestEvents>(mockPubSubInterface)
      const authHandler = vi.fn()
      const messageHandler = vi.fn()
      const alertHandler = vi.fn()

      await wrapper.subscribe('auth-channel', 'userLogin', authHandler)
      await wrapper.subscribe('message-channel', 'messageReceived', messageHandler)
      await wrapper.subscribe('system-channel', 'systemAlert', alertHandler)

      expect(mockSubscribe).toHaveBeenCalledTimes(3)

      // Simulate messages on different channels
      const authSubscribeHandler = mockSubscribe.mock.calls[0][1]
      const messageSubscribeHandler = mockSubscribe.mock.calls[1][1]
      const alertSubscribeHandler = mockSubscribe.mock.calls[2][1]

      authSubscribeHandler(
        JSON.stringify({
          event: 'userLogin',
          payload: { userId: 'user123', timestamp: 1640995200000 },
        })
      )

      messageSubscribeHandler(
        JSON.stringify({
          event: 'messageReceived',
          payload: { from: 'user456', content: 'Hello!', timestamp: 1640995210000 },
        })
      )

      alertSubscribeHandler(
        JSON.stringify({
          event: 'systemAlert',
          payload: { level: 'warning', message: 'High CPU usage detected' },
        })
      )

      expect(authHandler).toHaveBeenCalledWith({ userId: 'user123', timestamp: 1640995200000 })
      expect(messageHandler).toHaveBeenCalledWith({
        from: 'user456',
        content: 'Hello!',
        timestamp: 1640995210000,
      })
      expect(alertHandler).toHaveBeenCalledWith({
        level: 'warning',
        message: 'High CPU usage detected',
      })
    })

    it('should handle partial unsubscription correctly', async () => {
      const wrapper = wrapPubSub<TestEvents>(mockPubSubInterface)

      await wrapper.subscribe('multi-channel', 'userLogin', vi.fn())
      await wrapper.subscribe('multi-channel', 'userLogout', vi.fn())
      await wrapper.subscribe('multi-channel', 'systemAlert', vi.fn())

      // Unsubscribe from one event
      await wrapper.unsubscribe('multi-channel', 'userLogin')
      expect(mockUnsubscribe).not.toHaveBeenCalled()

      // Unsubscribe from another event
      await wrapper.unsubscribe('multi-channel', 'userLogout')
      expect(mockUnsubscribe).not.toHaveBeenCalled()

      // Unsubscribe from last event
      await wrapper.unsubscribe('multi-channel', 'systemAlert')
      expect(mockUnsubscribe).toHaveBeenCalledWith('multi-channel')
      expect(mockUnsubscribe).toHaveBeenCalledTimes(1)
    })

    it('should handle unsubscribe from non-existent channel gracefully', async () => {
      const wrapper = wrapPubSub<TestEvents>(mockPubSubInterface)

      await wrapper.unsubscribe('non-existent-channel', 'userLogin')

      expect(mockUnsubscribe).not.toHaveBeenCalled()
    })

    it('should maintain subscription state across multiple operations', async () => {
      const wrapper = wrapPubSub<TestEvents>(mockPubSubInterface)
      const handler1 = vi.fn()
      const handler2 = vi.fn()

      // Subscribe to different events on same channel to test proper counting
      await wrapper.subscribe('test-channel', 'userLogin', handler1)
      await wrapper.subscribe('test-channel', 'userLogout', handler2)

      const subscribeHandler1 = mockSubscribe.mock.calls[0][1]
      const subscribeHandler2 = mockSubscribe.mock.calls[1][1]

      // Send messages for both events
      const loginPayload = { userId: 'user123', timestamp: 1640995200000 }
      const logoutPayload = { userId: 'user123' }

      subscribeHandler1(JSON.stringify({ event: 'userLogin', payload: loginPayload }))
      subscribeHandler2(JSON.stringify({ event: 'userLogout', payload: logoutPayload }))

      expect(handler1).toHaveBeenCalledWith(loginPayload)
      expect(handler2).toHaveBeenCalledWith(logoutPayload)

      // Unsubscribe from one event - should NOT clean up channel
      await wrapper.unsubscribe('test-channel', 'userLogin')
      expect(mockUnsubscribe).not.toHaveBeenCalled() // Channel still has userLogout subscription

      // Unsubscribe from last event - should clean up channel
      await wrapper.unsubscribe('test-channel', 'userLogout')
      expect(mockUnsubscribe).toHaveBeenCalledWith('test-channel')
    })

    it('should handle multiple handlers for the same event correctly', async () => {
      const wrapper = wrapPubSub<TestEvents>(mockPubSubInterface)
      const handler1 = vi.fn()
      const handler2 = vi.fn()

      // Subscribe to same event twice with different handlers
      await wrapper.subscribe('test-channel', 'userLogin', handler1)
      await wrapper.subscribe('test-channel', 'userLogin', handler2)

      // This creates two separate PubSub subscriptions
      expect(mockSubscribe).toHaveBeenCalledTimes(2)

      const subscribeHandler1 = mockSubscribe.mock.calls[0][1]
      const subscribeHandler2 = mockSubscribe.mock.calls[1][1]

      // Send message to both handlers
      const payload = { userId: 'user123', timestamp: 1640995200000 }
      const message = JSON.stringify({ event: 'userLogin', payload })

      subscribeHandler1(message)
      subscribeHandler2(message)

      expect(handler1).toHaveBeenCalledWith(payload)
      expect(handler2).toHaveBeenCalledWith(payload)

      // Unsubscribe once - removes one event from array, but channel might still be active
      await wrapper.unsubscribe('test-channel', 'userLogin')

      // Based on current implementation: removes one 'userLogin' from array
      // If array still has events, PubSub unsubscribe should not be called
      // If array is empty, PubSub unsubscribe should be called

      // The implementation tracks events, not handlers, so after first unsubscribe:
      // - First unsubscribe removes one 'userLogin', array becomes ['userLogin']
      // - Array is not empty, so no PubSub unsubscribe
      expect(mockUnsubscribe).not.toHaveBeenCalled()

      // Second unsubscribe should clean up the channel
      await wrapper.unsubscribe('test-channel', 'userLogin')
      expect(mockUnsubscribe).toHaveBeenCalledWith('test-channel')
    })
  })
})
