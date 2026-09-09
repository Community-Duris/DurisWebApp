import { describe, expect, it } from 'vitest'

import {
  FrontendConfigurationError,
  parsePublicFrontendEnvironment,
  parseViteEnvironment,
} from '../../../config/environment'

describe('frontend environment configuration', () => {
  it('parses browser-visible endpoints and Vite server settings', () => {
    const configuration = parseViteEnvironment({
      VITE_BASE_URL: '/',
      VITE_API_URL: 'https://api.example.invalid',
      VITE_WS_URL: 'wss://socket.example.invalid/ws',
      VITE_STATIC_URL: 'https://static.example.invalid',
      FRONTEND_DEV_HOST: '127.0.0.1',
      FRONTEND_DEV_PORT: '5173',
      FRONTEND_PREVIEW_HOST: '127.0.0.1',
      FRONTEND_PREVIEW_PORT: '4173',
      FRONTEND_ALLOWED_HOSTS: 'localhost,.example.invalid',
    })

    expect(configuration).toMatchObject({
      baseUrl: '/',
      apiUrl: 'https://api.example.invalid',
      websocketUrl: 'wss://socket.example.invalid/ws',
      developmentPort: 5173,
      previewPort: 4173,
      allowedHosts: ['localhost', '.example.invalid'],
    })
  })

  it('reports all missing public endpoint keys', () => {
    expect(() => parsePublicFrontendEnvironment({})).toThrowError(
      new FrontendConfigurationError([
        'VITE_BASE_URL is required',
        'VITE_API_URL is required',
        'VITE_WS_URL is required',
        'VITE_STATIC_URL is required',
      ]),
    )
  })

  it('rejects invalid protocols, ports, and allowed-host entries', () => {
    expect(() =>
      parseViteEnvironment({
        VITE_BASE_URL: 'invalid',
        VITE_API_URL: 'ws://api.example.invalid',
        VITE_WS_URL: 'https://socket.example.invalid/ws',
        VITE_STATIC_URL: 'not-a-url',
        FRONTEND_DEV_HOST: 'https://invalid.example',
        FRONTEND_DEV_PORT: '0',
        FRONTEND_PREVIEW_HOST: '127.0.0.1',
        FRONTEND_PREVIEW_PORT: '70000',
        FRONTEND_ALLOWED_HOSTS: 'https://example.invalid',
      }),
    ).toThrow(FrontendConfigurationError)
  })

  it('accepts valid IPv6 addresses for development and preview binding', () => {
    const configuration = parseViteEnvironment({
      VITE_BASE_URL: '/',
      VITE_API_URL: 'https://api.example.invalid',
      VITE_WS_URL: 'wss://socket.example.invalid/ws',
      VITE_STATIC_URL: 'https://static.example.invalid',
      FRONTEND_DEV_HOST: '2001:db8::1',
      FRONTEND_DEV_PORT: '5173',
      FRONTEND_PREVIEW_HOST: 'fd00::1234',
      FRONTEND_PREVIEW_PORT: '4173',
      FRONTEND_ALLOWED_HOSTS: 'localhost,.example.invalid',
    })

    expect(configuration.developmentHost).toBe('2001:db8::1')
    expect(configuration.previewHost).toBe('fd00::1234')
  })
})
