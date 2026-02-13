import Stripe from 'stripe'
import { getSecret } from './get-secret'

let stripeInstance: Stripe | null = null

export async function getStripe(): Promise<Stripe> {
  if (stripeInstance) return stripeInstance

  const secretKey = await getSecret('STRIPE_SECRET_KEY')
  stripeInstance = new Stripe(secretKey, {
    apiVersion: '2025-02-24.acacia',
  })
  return stripeInstance
}
