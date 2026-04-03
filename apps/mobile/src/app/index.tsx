import { View, Text } from 'react-native'
import { formatDate } from '@geckou/shared'

export default function HomeScreen() {
  return (
    <View className="flex-1 items-center justify-center bg-white p-8">
      <Text className="text-3xl font-bold text-gray-900">Geckou Mobile</Text>
      <Text className="mt-4 text-lg text-gray-600">
        Expo + NativeWind + Firebase
      </Text>
      <Text className="mt-2 text-sm text-gray-400">
        Today: {formatDate(new Date())}
      </Text>
    </View>
  )
}
