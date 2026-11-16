import { describe, expect, it } from 'vitest'

import { sentryPlugins } from '../app.config'

const completeEnv = {
  SENTRY_AUTH_TOKEN: 'token',
  SENTRY_ORG: 'example-org',
  SENTRY_PROJECT: 'example-mobile',
}

describe('sentryPlugins', () => {
  it('3 つの変数が揃っていればプラグインを入れる', () => {
    expect(sentryPlugins(completeEnv, true)).toEqual([
      [
        '@sentry/react-native/expo',
        { organization: 'example-org', project: 'example-mobile' },
      ],
    ])
  })

  it.each(['SENTRY_AUTH_TOKEN', 'SENTRY_ORG', 'SENTRY_PROJECT'])(
    '%s が欠けていれば入れない',
    (missing) => {
      expect(
        sentryPlugins({ ...completeEnv, [missing]: undefined }, true)
      ).toEqual([])
      // EAS の変数は空文字で届くこともある
      expect(sentryPlugins({ ...completeEnv, [missing]: '' }, true)).toEqual([])
    }
  )

  it('トークンを props に入れない', () => {
    expect(JSON.stringify(sentryPlugins(completeEnv, true))).not.toContain(
      'token'
    )
  })

  it('パッケージが未インストールなら、変数が揃っていても入れない', () => {
    expect(sentryPlugins(completeEnv, false)).toEqual([])
  })
})
