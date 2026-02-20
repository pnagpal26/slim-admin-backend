import { GetSecretValueCommand } from '@aws-sdk/client-secrets-manager'
import { secretsClient } from './secrets'

const isProduction = process.env.NODE_ENV === 'production'

let cachedSecrets: Record<string, string> | null = null
let fetchPromise: Promise<Record<string, string>> | null = null

async function fetchSecrets(): Promise<Record<string, string>> {
  const response = await secretsClient.send(
    new GetSecretValueCommand({ SecretId: 'slim/production' })
  )

  if (!response.SecretString) {
    throw new Error(
      'AWS_SECRET_FETCH_FAILED: Unable to retrieve secrets from AWS Secrets Manager'
    )
  }

  return JSON.parse(response.SecretString)
}

export async function getSecret(key: string): Promise<string> {
  if (!cachedSecrets) {
    if (!fetchPromise) {
      fetchPromise = fetchSecrets()
    }

    try {
      cachedSecrets = await fetchPromise
    } catch (error) {
      fetchPromise = null
      if (isProduction) {
        console.error('[getSecret] Failed to fetch secrets from AWS:', error)
        throw error instanceof Error &&
          error.message.startsWith('AWS_SECRET_FETCH_FAILED')
          ? error
          : new Error(
              'AWS_SECRET_FETCH_FAILED: Unable to retrieve secrets from AWS Secrets Manager'
            )
      }
      // Dev/test: AWS unavailable — fall back to process.env
      cachedSecrets = {}
    } finally {
      fetchPromise = null
    }
  }

  const value = cachedSecrets[key]

  if (isProduction) {
    if (value === undefined || value === null) {
      const err = new Error(
        `SECRET_NOT_FOUND: ${key} not found in AWS Secrets Manager`
      )
      console.error('[getSecret]', err.message)
      throw err
    }
    return value
  }

  // Dev/test: prefer process.env (local overrides) over AWS
  return process.env[key] || value || ''
}
