import { initFirebase } from '@geckou/shared'
import Constants from 'expo-constants'

const extra = Constants.expoConfig?.extra ?? {}

const { app, auth, db } = initFirebase({
  apiKey: extra.firebaseApiKey ?? '',
  authDomain: extra.firebaseAuthDomain ?? '',
  projectId: extra.firebaseProjectId ?? '',
  storageBucket: extra.firebaseStorageBucket ?? '',
  messagingSenderId: extra.firebaseMessagingSenderId ?? '',
  appId: extra.firebaseAppId ?? '',
})

export { app, auth, db }
