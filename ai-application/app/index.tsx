import { StyleSheet, View } from 'react-native';
import { StaticObjectScanner } from '@/components/StaticObjectScanner';

export default function HomeScreen() {
  return (
    <View style={styles.container}>
      <StaticObjectScanner />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000'
  },
});