'use client'

import { Purchases } from '@revenuecat/purchases-js'

let instance: Purchases | null = null

export function initializeRevenueCat(appUserId: string) {
  const apiKey = process.env.NEXT_PUBLIC_REVENUECAT_API_KEY
  if (!apiKey) return null

  if (!instance) {
    instance = Purchases.configure(apiKey, appUserId)
  }
  return instance
}

export function getRevenueCat() {
  return instance
}
