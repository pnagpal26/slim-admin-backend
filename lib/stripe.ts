import Stripe from 'stripe'
import { getSecret } from './get-secret'

let stripeInstance: Stripe | null = null

export async function getStripe(): Promise<Stripe> {
  if (stripeInstance) return stripeInstance

  const secretKey = await getSecret('STRIPE_SECRET_KEY')
  stripeInstance = new Stripe(secretKey, {
    apiVersion: '2026-01-28.clover',
  })
  return stripeInstance
}
