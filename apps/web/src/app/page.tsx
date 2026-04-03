import { formatDate } from '@geckou/shared'

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8">
      <h1 className="text-4xl font-bold">Geckou Monorepo - Web</h1>
      <p className="mt-4 text-lg text-gray-600">
        Next.js + Expo + Turborepo + Firebase + Tailwind
      </p>
      <p className="mt-2 text-sm text-gray-400">
        Today: {formatDate(new Date())}
      </p>
    </main>
  )
}
