import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { SQLiteProvider } from './database/SQLiteProvider';
import OverviewScreen from './screens/OverviewScreen';
import DetailScreen from './screens/DetailScreen';
import StrategyScreen from './screens/StrategyScreen';

const Tab = createBottomTabNavigator();

export default function App() {
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const initApp = async () => {
      await new Promise(resolve => setTimeout(resolve, 1000));
      setIsReady(true);
    };
    initApp();
  }, []);

  if (!isReady) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color="#00d4ff" />
        <Text style={styles.loadingText}>正在初始化...</Text>
      </View>
    );
  }

  return (
    <SQLiteProvider>
      <NavigationContainer>
        <Tab.Navigator
          screenOptions={{
            tabBarStyle: {
              backgroundColor: '#0a0a0f',
              borderTopColor: '#1a1a2e',
              height: 64,
              paddingBottom: 8,
              paddingTop: 8,
            },
            tabBarLabelStyle: {
              fontSize: 14,
              fontWeight: 'bold',
              marginBottom: 4,
            },
            tabBarActiveTintColor: '#00d4ff',
            tabBarInactiveTintColor: '#6b7280',
            headerStyle: {
              backgroundColor: '#0a0a0f',
              borderBottomColor: '#1a1a2e',
              height: 56,
            },
            headerTitleStyle: {
              color: '#ffffff',
              fontSize: 18,
              fontWeight: 'bold',
            },
          }}
        >
          <Tab.Screen name="概览" component={OverviewScreen} />
          <Tab.Screen name="详情" component={DetailScreen} />
          <Tab.Screen name="策略" component={StrategyScreen} />
        </Tab.Navigator>
      </NavigationContainer>
    </SQLiteProvider>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    backgroundColor: '#0a0a0f',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#6b7280',
    marginTop: 16,
    fontSize: 16,
  },
});
